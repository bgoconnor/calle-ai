# Calle AI workstream contract

This document is the integration boundary for parallel work. Do not overwrite files outside your owned area without asking the owner.

## Ownership

| Workstream | Owns | Do not edit |
| --- | --- | --- |
| Platform & integrations | `worker/**`, `wrangler.toml`, `.env.example`, root deployment/tooling config, `README.md`, `.github/**`, `src/lib/platform.ts` | product routes/components, `convex/schema.ts`, agent code |
| Agency engine | `convex/**`, agent runtime modules, backend data contracts | `worker/**`, product UI components, deployment config |
| Intake UI | intake/brief-review components and routes | Worker, Convex schema, customer renderer |
| Microsite renderer | `/b/:slug` route and public theme components | Worker, Convex schema, control room |
| Control room | job/run/trace operation components and routes | Worker, Convex schema, public microsite components |

All teams may update shared TypeScript interfaces only by agreement. During rapid build, use `src/contracts/` as the source of truth and make additive changes only.

## Shared contracts

Create the following contracts in `src/contracts/` once the agent-engine owner starts:

```ts
export type JobStatus = "draft" | "planned" | "running" | "needs_review" | "failed" | "published";
export type Confidence = "verified" | "low" | "missing";

export interface AgencyBriefInput {
  brief: string;
  sourceUrls?: string[];
  assetIds?: string[];
  voiceBriefId?: string;
}

export interface PublishedSite {
  slug: string;
  publishStatus: "draft" | "published";
  business: { name: string; category?: string; address?: string; phone?: string; hours?: string[] };
  languages: { primary: string; secondary: string };
  brand: { theme?: string; colors?: string[]; tone?: string };
  content: Record<string, unknown>;
  citations: Array<{ title: string; url: string; snippet?: string }>;
}
```

Actual backend functions supplied by the agency engine:

```ts
createJob({ brief, businessName, city, category, primaryLanguage?, secondaryLanguage?, sourceUrls? }): Promise<{ jobId: string }>;
getJob(jobId: string): Job;
launchDeterministicRun(jobId: string): Promise<void>;
approveArtifact(artifactId: string): Promise<void>;
publishBusiness({businessId, siteVersionId}): Promise<string>;
getPublishedSite(slug: string): PublishedSite | null;
```

Worker → Convex event envelope:

```ts
{ event: "linkup_research" | "voice_brief", payload: Record<string, unknown> }
```

The agency engine supplies `POST /worker-ingest`; configure `CONVEX_HTTP_URL` and matching `WORKER_WRITE_KEY` in both Convex and the Worker.

## Platform commands

```sh
npm install
npm run dev
npm run typecheck
npm run build
npx convex dev
npm run worker:dev
npm run worker:deploy
```

## Integration checklist

- [ ] `npm install` succeeds and `npm run build` passes.
- [ ] Convex dev deployment exists; `VITE_CONVEX_URL` is configured locally and in Pages.
- [ ] Backend has a protected HTTP event endpoint; Worker `CONVEX_HTTP_URL` points to it.
- [ ] Worker deploys and `/health` returns expected integration configuration booleans.
- [ ] Linkup key is set only as a Worker secret; a real research event persists to Convex.
- [ ] ElevenLabs key is set only as a Worker secret; a real audio upload creates a transcript artifact.
- [ ] Pages production URL has `VITE_CONVEX_URL` and `VITE_INTEGRATION_WORKER_URL`.
- [ ] Public `/b/:slug` route reads an approved Convex site record.
- [ ] Dodo remains disabled unless its real checkout + webhook proof works.
- [ ] Restrict Worker CORS to the production Pages origin before final submission.
