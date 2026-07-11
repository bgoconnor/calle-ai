# Calle AI — platform setup

Calle AI is a Vite/React client hosted on Cloudflare Pages, with Convex as the application source of truth and a Cloudflare Worker as the private boundary for third-party integrations.

## Architecture

```text
Browser (React/Vite) ────────────────> Convex (jobs, artifacts, traces, sites)
        │
        └─ Cloudflare Worker ────────> Linkup (research)
                                  ├──> ElevenLabs (voice brief transcription)
                                  └──> Dodo Payments (optional webhooks)
```

The browser receives `VITE_CONVEX_URL` and optionally `VITE_INTEGRATION_WORKER_URL` only. Never put `LINKUP_API_KEY`, `ELEVENLABS_API_KEY`, Dodo keys, or Convex deployment keys in a `VITE_` variable.

## Local setup

1. Copy `.env.example` to `.env.local` and set `VITE_CONVEX_URL` after Convex is initialized.
2. Install dependencies: `npm install`.
3. Initialize/login to Convex: `npx convex dev`.
4. Start the UI: `npm run dev`.
5. For Worker development, create `.dev.vars` from the server-only values in `.env.example`, then run `npm run worker:dev`.

The backend/orchestration engineer owns the Convex schema and must provide a Convex HTTP action for Worker event writes. Its contract is documented in [worker/README.md](worker/README.md).

## Cloudflare deployment

### Pages (frontend)

Create a Cloudflare Pages project linked to this repository:

- Build command: `npm run build`
- Build output: `dist`
- Node version: 20+
- Production environment variable: `VITE_CONVEX_URL`
- Production environment variable: `VITE_INTEGRATION_WORKER_URL` (the deployed Worker URL)

`public/_redirects` supplies SPA history fallback. Ensure product routing handles `/jobs/:jobId` and `/b/:slug` client-side.

### Worker (provider boundary)

1. Authenticate: `npx wrangler login`.
2. Deploy: `npm run worker:deploy`.
3. Add secrets individually:

```sh
npx wrangler secret put LINKUP_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put CONVEX_HTTP_URL
npx wrangler secret put WORKER_WRITE_KEY
# Only when activated:
npx wrangler secret put DODO_API_KEY
npx wrangler secret put DODO_WEBHOOK_SECRET
```

4. Set `DODO_ENABLED=true` only after a real Dodo product, checkout path, and verified webhook are ready. The included webhook intentionally does not mark any job as paid.

## Convex production deployment

Use `npx convex deploy` after the backend agent has added the `convex/` functions and schema. Configure provider keys that agents use directly with `npx convex env set NAME value`; do not expose them to the frontend.

## Integration evidence for judges

- **Convex:** dashboard showing persisted jobs, artifacts, agent traces, and published site records.
- **Cloudflare:** Pages production URL plus Worker deployment and `/health` response.
- **Linkup:** a run trace with a real `/v1/research` call and cited output.
- **ElevenLabs:** voice recording → transcript artifact → manager plan handoff.
- **Dodo:** only claim if live checkout and verified webhook update a real job payment record.
- **Wispr Flow:** 500+ word stats screenshot from real project/delivery work.

## Required credentials

The project needs user-owned accounts/keys for:

- Convex account and deployment
- Cloudflare account + API token (or Wrangler login)
- Linkup API key
- ElevenLabs API key with speech-to-text enabled
- Dodo merchant account, product ID, API key, and webhook secret (optional)

## Safety notes

- The Worker has permissive CORS during hackathon development. Restrict `Access-Control-Allow-Origin` to the Pages domain before production.
- Dodo webhook verification must follow the currently documented Dodo signing algorithm before it writes payment state.
- All business facts should remain source-linked; a successful provider call is not evidence that a fact is safe to publish.
