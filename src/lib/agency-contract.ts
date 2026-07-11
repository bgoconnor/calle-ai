/**
 * UI-facing data contract for Calle AI. Convex documents may include `_id` and
 * `_creationTime`; public components should consume these portable shapes.
 */
export type LocalePair = { es: string; en: string };

export type BriefInput = {
  brief: string;
  businessName: string;
  city: string;
  category: string;
  primaryLanguage?: string;
  secondaryLanguage?: string;
  sourceUrls?: string[];
  approvalMode?: "autonomous" | "require_approval";
};

export type StructuredBrief = {
  objective: string;
  business: { name: string; city: string; category: string };
  languages: { primary: string; secondary: string };
  deliverables: string[];
  guardrails: string[];
  sourceStrategy: string[];
};

export type CatalogItem = {
  name: string;
  description: LocalePair;
  price: string | number | null;
  confidence?: number;
  needsReview?: boolean;
};

// Canonical public-render shape lives beside the renderer. Agency output must
// be mapped to this before it is written to `siteVersions.content`.
export type { PublishedSite } from "../public/types";

export type TraceEvent = {
  agent: string;
  event: string;
  inputSummary: string;
  outputSummary: string;
  tools: string[];
  latencyMs: number;
  tokenEstimate: number;
  costUsd: number;
  parentTaskId?: string;
};

export type JobDetail = {
  job: { _id: string; status: string; brief: string; structuredBrief?: StructuredBrief; managerPlan?: unknown[] } | null;
  tasks: unknown[];
  artifacts: unknown[];
  traces: TraceEvent[];
  citations: unknown[];
};
