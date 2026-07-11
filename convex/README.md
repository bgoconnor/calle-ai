# Calle AI Convex contract

`agency.createJob` accepts the natural-language operator brief and returns a reviewable structured brief.
`agency.launchDeterministicRun` supplies an offline/demo agency run while real model, Linkup, and OCR actions are being attached.
`agency.getJob` powers the job control room; it returns the business, tasks, source assets, artifacts, trace events, and citations.
`agency.updateBrief`, `agency.approveArtifact`, and `agency.retryTask` provide the nontechnical operator controls; `agency.publishBusiness` flips a reviewed `siteVersion` live.
`agency.getPublishedSite({ slug })` returns only a published `siteVersions` document for the public `/b/:slug` renderer.

The canonical public render schema is [`src/public/types.ts`](../src/public/types.ts). `siteVersions.content` must match that `PublishedSite` shape exactly; the renderer treats it as data, not generated code. Unverified fields should not appear as facts in customer-facing views.

## Worker provider bridge

The Cloudflare Worker should POST to `https://<deployment>.convex.site/worker-ingest` with `Authorization: Bearer <WORKER_WRITE_KEY>` and `{ jobId, event, payload }` after a Linkup or ElevenLabs call. Set the same `WORKER_WRITE_KEY` manually in both Convex (`npx convex env set`) and Cloudflare Worker secrets (`wrangler secret put`). This is intentionally server-only: provider credentials never reach the browser.

Manual account dependencies: Convex project/deployment; Cloudflare account and Pages/Worker project; Linkup API key; ElevenLabs API key; and `OPENAI_API_KEY` (plus optional `OPENAI_MODEL`, e.g. `gpt-4.1-mini`) when replacing deterministic manager/specialist runs with live model calls. Dodo requires an activated merchant account and webhook secret, but is not needed for the deterministic demo run.
