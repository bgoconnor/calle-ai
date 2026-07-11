# Prompt 04 — platform and partner integrations

You own the existing platform boundary: `worker/**`, `wrangler.toml`, `.env.example`, `.github/**`, root build/deployment configuration, `src/lib/platform.ts`, and platform documentation. Read `README.md`, `worker/README.md`, `convex/README.md`, and `docs/WORKSTREAMS.md` first.

Do not rebuild product UI, edit `src/public/**`, edit feature directories, or redesign the Convex agency schema. Extend the existing scaffold.

Finish and verify:

- Cloudflare Pages production build and SPA routing
- Cloudflare Worker `/health`, Linkup research, ElevenLabs voice transcription, and Convex event-ingest paths
- server-only secret handling and production CORS configuration
- Convex dev/production deployment instructions and Worker ingest key contract
- Linkup response normalization with citations
- ElevenLabs audio validation, transcription metadata, and error states
- Dodo feature flag that remains off unless a real checkout and verified webhook are configured
- CI for install, typecheck, and build
- judge evidence checklist for Convex, Cloudflare, Linkup, ElevenLabs, Wispr, and optional Dodo

Never place provider secrets in `VITE_*` variables or client code. Do not claim an integration is live unless a real provider request succeeds and persists an artifact in Convex.

Acceptance:

- clean `npm install`, `npm run typecheck`, and `npm run build`
- Worker starts locally without optional provider secrets and reports configuration accurately
- malformed uploads and provider failures return safe structured errors
- Worker-to-Convex writes require a shared secret
- deployment/manual account steps are complete and copy-pasteable
- all changes stay within platform-owned files
