# calle-ai

Calle AI — an AI-operated local-presence agency (Hermes Buildathon). Multi-agent system that publishes bilingual local-business presence packs.

## Backend (Convex)

Convex is the source of truth. The shared team deployment is under the
`anthony-lee` team, project `calle-ai`.

- **Shared deployment URL:** `https://fastidious-mammoth-951.convex.cloud`
- **Dashboard:** https://dashboard.convex.dev/d/fastidious-mammoth-951

### For frontend / Worker (Engineer 2)

You do **not** need a deploy key to read data or call functions — just point at
the shared deployment URL and import the generated API (committed in
`convex/_generated`):

```
VITE_CONVEX_URL=https://fastidious-mammoth-951.convex.cloud
```

Backend schema/functions are pushed from the backend owner's machine only, to
avoid concurrent schema pushes.

### For backend work

```bash
npm install
npx convex dev              # watcher: pushes schema + functions on save
npx convex run seed:seedAll # (re)seed the two demo businesses — idempotent
```

### Data model

See `convex/schema.ts` for the 13-table contract: businesses, jobs, assets,
policies (memory), plans, tasks, artifacts, citations, approvals, deployments,
traceEvents, evalCases, evalResults. Everything an agent produces is an
`artifact`; handoffs pass artifact ids; every agent step writes a `traceEvent`.
