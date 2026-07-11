# Sol one-shot workstreams

Run these four prompts from commit `9506450` or later. The repository already contains the platform scaffold, Convex agency contract, Cloudflare Worker boundary, and public-site renderer baseline. Agents must extend the existing project rather than reinitialize it.

## Execution

Use one isolated git worktree per prompt:

| Prompt | Branch | Exclusive area |
| --- | --- | --- |
| 01 | `ui/intake` | `src/features/intake/**` |
| 02 | `ui/microsites` | `src/public/**` |
| 03 | `ui/control-room` | `src/features/control-room/**` |
| 04 | `infra/integrations` | `worker/**`, deployment config, integration docs |

All agents may read `src/public/types.ts`, `src/lib/agency-contract.ts`, `convex/README.md`, and `docs/WORKSTREAMS.md`. They may not change a shared contract unless the existing contract makes their task impossible; in that case they must add an adapter inside their owned directory.

Each workstream must finish by running:

```sh
npm install
npm run typecheck
npm run build
```

Prompt 04 additionally runs the Worker locally when credentials are available. Live account creation and secrets remain manual.

After the four branches merge, the integrator replaces the temporary `src/main.tsx` shell with the three feature entrypoints. No feature agent should independently rewrite the root app shell.
