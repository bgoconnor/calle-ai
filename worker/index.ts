export interface Env {
  CONVEX_HTTP_URL?: string;
  WORKER_WRITE_KEY?: string;
  LINKUP_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_TRANSCRIPTION_MODEL?: string;
  DODO_API_KEY?: string;
  DODO_WEBHOOK_SECRET?: string;
  DODO_ENABLED?: string;
}

type JsonRecord = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: JsonRecord, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

async function forwardToConvex(env: Env, event: string, payload: JsonRecord) {
  if (!env.CONVEX_HTTP_URL || !env.WORKER_WRITE_KEY) return;
  const response = await fetch(`${env.CONVEX_HTTP_URL.replace(/\/$/, "")}/worker-ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.WORKER_WRITE_KEY}` },
    body: JSON.stringify({ jobId: payload.jobId, event, payload }),
  });
  if (!response.ok) throw new Error(`Convex event write failed (${response.status})`);
}

async function research(request: Request, env: Env) {
  if (!env.LINKUP_API_KEY) return json({ error: "Linkup is not configured." }, 503);
  const body = (await request.json()) as { query?: string; jobId?: string; businessId?: string };
  if (!body.query?.trim()) return json({ error: "query is required" }, 400);

  // Linkup is intentionally called only from the Worker, so the key cannot reach the browser.
  const upstream = await fetch("https://api.linkup.so/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.LINKUP_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: body.query, depth: "standard", outputType: "sourcedAnswer" }),
  });
  if (!upstream.ok) return json({ error: "Linkup search failed", status: upstream.status }, 502);

  const raw = (await upstream.json()) as JsonRecord;
  const results = Array.isArray(raw.sources)
    ? raw.sources.map((source) => {
        const item = source as JsonRecord;
        return {
          title: String(item.name ?? item.title ?? "Untitled source"),
          url: String(item.url ?? ""),
          snippet: String(item.snippet ?? item.content ?? ""),
        };
      })
    : [];
  const payload = { query: body.query, answer: String(raw.answer ?? ""), results, retrievedAt: new Date().toISOString(), jobId: body.jobId, businessId: body.businessId };
  if (body.jobId) await forwardToConvex(env, "linkup_research", payload);
  return json(payload);
}

async function transcribe(request: Request, env: Env) {
  if (!env.ELEVENLABS_API_KEY) return json({ error: "ElevenLabs is not configured." }, 503);
  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) return json({ error: "audio file is required" }, 400);

  const upstreamForm = new FormData();
  upstreamForm.append("file", audio, audio.name || "voice-brief.webm");
  upstreamForm.append("model_id", env.ELEVENLABS_TRANSCRIPTION_MODEL || "scribe_v1");
  const upstream = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
    body: upstreamForm,
  });
  if (!upstream.ok) return json({ error: "ElevenLabs transcription failed", status: upstream.status }, 502);

  const raw = (await upstream.json()) as JsonRecord;
  const payload = {
    transcript: String(raw.text ?? raw.transcript ?? ""),
    language: raw.language_code ?? raw.language ?? null,
    provider: "elevenlabs",
    createdAt: new Date().toISOString(),
    jobId: form.get("jobId")?.toString(),
  };
  if (payload.jobId) await forwardToConvex(env, "voice_brief", payload);
  return json(payload);
}

async function dodoWebhook(request: Request, env: Env) {
  if (env.DODO_ENABLED !== "true") return json({ error: "Dodo Payments is disabled." }, 404);
  const signature = request.headers.get("webhook-signature") ?? request.headers.get("x-webhook-signature");
  if (!signature || !env.DODO_WEBHOOK_SECRET) return json({ error: "Webhook is not configured." }, 503);

  // Preserve the raw signed body. Convex should verify against Dodo's current signing spec
  // before changing payment state; this Worker intentionally never fabricates paid status.
  const rawBody = await request.text();
  // Payment event ingestion is deliberately deferred until checkout has a verified jobId
  // and the backend implements Dodo's current signature verification protocol.
  return json({ received: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, integrations: { convex: Boolean(env.CONVEX_HTTP_URL && env.WORKER_WRITE_KEY), linkup: Boolean(env.LINKUP_API_KEY), elevenlabs: Boolean(env.ELEVENLABS_API_KEY), dodo: env.DODO_ENABLED === "true" } });
    }
    try {
      if (request.method === "POST" && url.pathname === "/v1/research") return research(request, env);
      if (request.method === "POST" && url.pathname === "/v1/voice-brief/transcribe") return transcribe(request, env);
      if (request.method === "POST" && url.pathname === "/v1/webhooks/dodo") return dodoWebhook(request, env);
      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: "Integration request failed" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
