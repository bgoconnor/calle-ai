// OpenAI model wrapper. Plain module (not Convex functions) — imported by the
// specialist/manager actions. Uses raw fetch so it runs in Convex's default
// runtime (no "use node", no SDK dependency). Structured output via
// response_format: json_schema (strict).
//
// Requires OPENAI_API_KEY in the Convex env:
//   npx convex env set OPENAI_API_KEY sk-...
// Optionally override the model with OPENAI_MODEL (defaults below).

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o";

export type LLMResult<T> = {
  data: T;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
};

// JSON Schema strict mode requires additionalProperties:false and every
// property listed in `required`. Use nullable types (["string","null"]) for
// optional values. Helper for the common bilingual { es, en } object:
export const bilingual = {
  type: "object",
  additionalProperties: false,
  required: ["es", "en"],
  properties: { es: { type: "string" }, en: { type: "string" } },
} as const;

export async function callStructured<T>(opts: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  images?: string[]; // image URLs for vision (menu/service photos)
  model?: string;
  temperature?: number;
}): Promise<LLMResult<T>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Run: npx convex env set OPENAI_API_KEY sk-...",
    );
  }
  const model = opts.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

  const userContent: unknown[] = [{ type: "text", text: opts.user }];
  for (const url of opts.images ?? []) {
    userContent.push({ type: "image_url", image_url: { url } });
  }

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: opts.temperature ?? 0.3,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: opts.schemaName,
          strict: true,
          schema: opts.schema,
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 500)}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI returned no message content");
  }

  return {
    data: JSON.parse(content) as T,
    model,
    promptTokens: json.usage?.prompt_tokens,
    completionTokens: json.usage?.completion_tokens,
  };
}
