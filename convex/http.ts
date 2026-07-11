import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

/**
 * Protected worker bridge. Set WORKER_WRITE_KEY in both Convex and Cloudflare.
 * The Worker posts `{ jobId, event: 'voice_brief' | 'linkup_research', payload }`.
 */
http.route({
  path: "/worker-ingest",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.WORKER_WRITE_KEY;
    if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    try {
      const body = await request.json();
      if (!body?.jobId || !body?.event) return new Response("Missing jobId or event", { status: 400 });
      await ctx.runMutation(internal.agency.ingestWorkerEnvelope, body);
      return Response.json({ ok: true });
    } catch (error) {
      return Response.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
    }
  }),
});

export default http;
