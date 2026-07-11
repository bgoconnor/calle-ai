# Worker API contract

The Worker owns all provider secrets. Product UI should call only these endpoints:

- `GET /health` — configuration health (no secrets returned)
- `POST /v1/research` — JSON: `{ query, jobId?, businessId? }`; runs Linkup and forwards normalized evidence to Convex
- `POST /v1/voice-brief/transcribe` — multipart: `audio`, optional `jobId`; runs ElevenLabs transcription and forwards the artifact to Convex
- `POST /v1/webhooks/dodo` — Dodo webhook receiver, feature-gated by `DODO_ENABLED=true`

Set `CONVEX_HTTP_URL` to the Convex deployment base URL and set the same `WORKER_WRITE_KEY` secret in both Convex and the Worker. The agency engine provides `POST /worker-ingest`; it requires `Authorization: Bearer <WORKER_WRITE_KEY>` and accepts `{ event, payload }`. Supported events are `linkup_research` and `voice_brief`.
