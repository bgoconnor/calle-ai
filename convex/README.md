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

## Live menu agency pipeline

Restaurant jobs can plan these narrow specialist roles:

1. `intake` writes verified business facts and missing-data flags.
2. `menu_discovery` calls `linkup.search` through the Cloudflare Worker and writes cited menu sources plus the returned search evidence.
3. `menu_normalization` creates the comprehensive original-language menu with stable section/item IDs, provenance, confidence, and conflicts.
4. `localization` detects language per field, preserves the source text, and generates the missing English or Spanish counterpart.
5. `menu_testimonials` runs a bounded Linkup loop and accepts at most four short, exact, source-linked quotations for distinct menu items.
6. `pdf_menu` deterministically renders the latest normalized menu plus bilingual handoff as a printable `printable-menu-pdf.v1` artifact, retaining source artifact IDs and adding no items or prices.
7. `publisher_qa` joins normalized items, localization, and sparse testimonials by stable item ID before the normal GBP/report tail.

All external and observability calls go through `convex/tools`. Set the Worker base URL in the Convex environment before a live run:

```sh
npx convex env set INTEGRATION_WORKER_URL https://<worker>.workers.dev
```

Run `npx convex run seed:seedAll` to install the named restaurant eval cases as well as the demo businesses. A live Linkup power-up still requires a real Worker request during the demo; fixtures do not count as provider success.
