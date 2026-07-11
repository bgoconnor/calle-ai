import { action } from "./_generated/server";
import { v } from "convex/values";
import { callStructured } from "./agents/llm";

const localizedValue = {
  type: "object",
  additionalProperties: false,
  required: ["sourceLanguage", "original", "es", "en"],
  properties: {
    sourceLanguage: { type: "string", enum: ["es", "en"] },
    original: { type: "string" },
    es: { type: "string" },
    en: { type: "string" },
  },
};

const menuSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sections"],
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "items"],
        properties: {
          id: { type: "string" },
          name: localizedValue,
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "name", "description", "price", "sourceUrls"],
              properties: {
                id: { type: "string" },
                name: localizedValue,
                description: { anyOf: [localizedValue, { type: "null" }] },
                price: { type: ["string", "null"] },
                sourceUrls: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    },
  },
};

// Raw, no-tools control arm for the developer eval console. This intentionally
// receives no Linkup evidence, business memory, or prior artifacts.
export const runMenuBaseline = action({
  args: {
    prompt: v.string(),
    businessName: v.string(),
  },
  handler: async (_ctx, { prompt, businessName }) => {
    const started = Date.now();
    const result = await callStructured<any>({
      system:
        "You are the single-call control arm in a menu-generation evaluation. " +
        "Use only your pretrained knowledge and the user's prompt. You have no browsing tools or supplied sources. " +
        "Return a normalized bilingual English/Spanish menu. Preserve whichever language you treat as the source " +
        "and translate into the other. Use null for unknown descriptions or prices and never claim source URLs you did not receive.",
      user: `BUSINESS: ${businessName}\n\nSHARED EVAL PROMPT:\n${prompt}`,
      schemaName: "baseline_normalized_menu",
      schema: menuSchema,
      temperature: 0,
    });

    return {
      menu: result.data,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      durationMs: Date.now() - started,
      toolCalls: 0,
      runner: "single_call_no_tools",
    };
  },
});
