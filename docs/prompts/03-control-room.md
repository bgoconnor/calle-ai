# Prompt 03 — agency control room

You own `src/features/control-room/**`. Build the nontechnical operations and judge-proof observability surface. Read `src/lib/agency-contract.ts`, `convex/README.md`, and `docs/WORKSTREAMS.md` first.

Do not modify Convex, the Worker, `src/public/**`, intake files, deployment configuration, or `src/main.tsx`.

Build:

- job list with business, status, category, run time, cost, and publish state
- job detail with manager plan, specialist tasks, artifacts, citations, escalations, and published URL
- trace tree showing who called whom
- per-step input/output summaries, tools, latency, tokens, and cost
- filters by job, agent, task, and status
- artifact approve/edit/retry controls using existing backend functions
- artifact version comparison
- publish/unpublish panel and public-site preview link
- clear empty, loading, failed, needs-review, and published states

The UI must feel like an agency delivery desk rather than a developer log viewer. A nontechnical operator should be able to retry a failed task and approve a flagged artifact after one walkthrough.

Use a typed data adapter within your directory. It may fall back to deterministic seeded run data when Convex is not configured. Never fabricate a successful live provider call; label demo data.

Export one mountable entry component from `src/features/control-room/index.ts` and document integration requirements.

Acceptance:

- a past run can be opened and reconstructed step by step
- manager-to-specialist relationships are visible as a tree
- cost and latency aggregate correctly from task traces
- one seeded low-confidence artifact can be corrected and retried
- `npm run typecheck` and `npm run build` pass
- changes stay inside the owned directory plus additive documentation
