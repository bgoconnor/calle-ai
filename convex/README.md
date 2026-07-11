# Calle AI Convex contract

The normalized remote schema is authoritative. Public functions in `agency.ts`
project native plans, tasks, artifacts, approvals, deployments, and trace events
into portable frontend contracts.

## Write API

- `agency.createJobFromPrompt` — minimal NL prompt entrypoint.
- `agency.createJob` / `agency.updateBrief` — detailed-intake compatibility.
- `agency.launchDeterministicRun` — seeded agent workflow using native records.
- `agency.approveEscalation` / `agency.approveArtifact` — resolve exceptions.
- `agency.requestTaskRevision` / `agency.retryTask` — targeted iteration.
- `agency.requestArtifactRevision` — UI-friendly artifact-to-task revision.
- `agency.publishJob` / `agency.unpublishJob` — control the current deployment.

## Read API

- `agency.getControlRoomJobs` — portable job-board rows.
- `agency.getControlRoomJob` — projected plan, trace tree, artifacts and evidence.
- `agency.getPublishedSite` — dereferences deployment → microsite artifact data.

The canonical public render schema is [`src/public/types.ts`](../src/public/types.ts).
An artifact with `kind="microsite"` must store that exact shape in `data`.
Unverified fields should not appear as customer-facing facts.

## Worker provider bridge

The Cloudflare Worker should POST to `https://<deployment>.convex.site/worker-ingest` with `Authorization: Bearer <WORKER_WRITE_KEY>` and `{ jobId, event, payload }` after a Linkup or ElevenLabs call. Set the same `WORKER_WRITE_KEY` manually in both Convex (`npx convex env set`) and Cloudflare Worker secrets (`wrangler secret put`). This is intentionally server-only: provider credentials never reach the browser.

Manual account dependencies: Convex project/deployment; Cloudflare account and Pages/Worker project; Linkup API key; ElevenLabs API key; and `OPENAI_API_KEY` (plus optional `OPENAI_MODEL`, e.g. `gpt-4.1-mini`) when replacing deterministic manager/specialist runs with live model calls. Dodo requires an activated merchant account and webhook secret, but is not needed for the deterministic demo run.
