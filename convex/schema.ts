import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { jobStatus, taskStatus, tracePhase } from "./validators";

// ---------------------------------------------------------------------------
// Calle AI — data model. This file is the contract between the agency backend
// (Engineer 1) and the surfaces that read it: the Control Room, the operator
// job board, and the Cloudflare Worker (Engineer 2).
//
// Convex adds `_id` and `_creationTime` to every row automatically, so we don't
// define created-at fields. Everything an agent produces is an `artifact`;
// handoffs are just artifact ids passed between tasks.
// ---------------------------------------------------------------------------

export default defineSchema({
  // --- core entities ------------------------------------------------------
  businesses: defineTable({
    slug: v.string(), // public route key: /businesses/{slug}
    name: v.string(),
    type: v.string(), // "restaurant" | "salon" | ... (free-form so plans can adapt)
    languages: v.array(v.string()), // e.g. ["es", "en"]
    mapsUrl: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  }).index("by_slug", ["slug"]),

  jobs: defineTable({
    businessId: v.id("businesses"),
    status: jobStatus,
    approvalMode: v.optional(v.union(v.literal("autonomous"), v.literal("require_approval"))),
    requiredDeliverables: v.array(v.string()), // ["microsite","catalog","gbp_pack","report"]
    guardrails: v.optional(v.string()), // brand/tone guardrails from the operator
    briefArtifactId: v.optional(v.id("artifacts")), // ElevenLabs transcript → policy
    planId: v.optional(v.id("plans")),
    error: v.optional(v.string()),
    costEstimate: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_business", ["businessId"])
    .index("by_status", ["status"]),

  // Raw inputs the operator attaches (menu photos, service lists, logo, maps).
  assets: defineTable({
    businessId: v.id("businesses"),
    jobId: v.optional(v.id("jobs")),
    kind: v.union(
      v.literal("menu_photo"),
      v.literal("service_list"),
      v.literal("logo"),
      v.literal("photo"),
      v.literal("other"),
    ),
    storageId: v.optional(v.id("_storage")), // Convex file storage
    url: v.optional(v.string()),
    label: v.optional(v.string()),
  })
    .index("by_business", ["businessId"])
    .index("by_job", ["jobId"]),

  // --- memory layers 2 & 3: business memory + agency policy ----------------
  // Versioned key/value policies. scope="agency" for global standards
  // (translation rules, publish requirements, escalation rules); scope="business"
  // for per-business preferences, corrections, and the spoken brief.
  policies: defineTable({
    scope: v.union(v.literal("agency"), v.literal("business")),
    businessId: v.optional(v.id("businesses")),
    key: v.string(), // e.g. "translation_standard", "brief", "preferred_tone"
    value: v.string(),
    version: v.number(),
    sourceArtifactId: v.optional(v.id("artifacts")),
  })
    .index("by_scope", ["scope"])
    .index("by_business", ["businessId"]),

  // --- orchestration: plans, tasks -----------------------------------------
  // The Agency Manager writes one plan per job (per attempt). Steps are data,
  // executed by the generic specialist runner — no hardcoded pipeline.
  plans: defineTable({
    jobId: v.id("jobs"),
    version: v.number(),
    steps: v.array(
      v.object({
        order: v.number(),
        role: v.string(),
        purpose: v.string(),
        inputKinds: v.array(v.string()),
        ephemeral: v.optional(v.boolean()), // true for a manager-spawned role (L5)
      }),
    ),
    rationale: v.optional(v.string()),
  }).index("by_job", ["jobId"]),

  tasks: defineTable({
    jobId: v.id("jobs"),
    planId: v.optional(v.id("plans")),
    order: v.number(),
    role: v.string(),
    status: taskStatus,
    inputArtifactIds: v.array(v.id("artifacts")),
    outputArtifactId: v.optional(v.id("artifacts")),
    attempt: v.number(),
    confidence: v.optional(v.number()),
    blockerReason: v.optional(v.string()),
    reviewNote: v.optional(v.string()), // manager's revision request
    durationMs: v.optional(v.number()),
    costEstimate: v.optional(v.number()),
  })
    .index("by_job", ["jobId"])
    .index("by_status", ["status"]),

  // --- artifacts: the universal output type + versioning -------------------
  // kind ∈ brief_transcript | business_facts | menu_catalog | bilingual_content
  //        | research | microsite | gbp_pack | delivery_report
  artifacts: defineTable({
    jobId: v.id("jobs"),
    businessId: v.id("businesses"),
    kind: v.string(),
    version: v.number(),
    producedByRole: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    data: v.any(), // structured JSON payload
    confidence: v.optional(v.number()),
    supersedesId: v.optional(v.id("artifacts")), // enables side-by-side revision diffs
  })
    .index("by_job", ["jobId"])
    .index("by_job_kind", ["jobId", "kind"])
    .index("by_business", ["businessId"]),

  // Every research-derived claim must carry a citation.
  citations: defineTable({
    jobId: v.id("jobs"),
    artifactId: v.optional(v.id("artifacts")),
    claim: v.string(),
    sourceUrl: v.string(),
    sourceTitle: v.optional(v.string()),
    snippet: v.optional(v.string()),
    origin: v.union(
      v.literal("linkup"),
      v.literal("source_asset"),
      v.literal("business_fact"),
    ),
  })
    .index("by_job", ["jobId"])
    .index("by_artifact", ["artifactId"]),

  // --- human-in-the-loop: approvals & escalations --------------------------
  approvals: defineTable({
    jobId: v.id("jobs"),
    taskId: v.optional(v.id("tasks")),
    type: v.union(v.literal("escalation"), v.literal("publish_approval")),
    reason: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    resolvedBy: v.optional(v.string()),
    resolutionNote: v.optional(v.string()),
  })
    .index("by_job", ["jobId"])
    .index("by_status", ["status"]),

  // --- publishing ----------------------------------------------------------
  // Written by the Publisher; read by Engineer 2's Cloudflare Worker to resolve
  // the current published version for a slug.
  deployments: defineTable({
    jobId: v.id("jobs"),
    businessId: v.id("businesses"),
    slug: v.string(),
    version: v.number(),
    url: v.string(),
    micrositeArtifactId: v.id("artifacts"),
    status: v.union(v.literal("published"), v.literal("superseded")),
  })
    .index("by_slug", ["slug"])
    .index("by_job", ["jobId"]),

  // --- observability: the load-bearing trace primitive ---------------------
  // One row per agent step. Powers the Control Room trace tree, cost/latency
  // rollups, and filtering by business/job/agent/status.
  traceEvents: defineTable({
    jobId: v.id("jobs"),
    taskId: v.optional(v.id("tasks")),
    parentRole: v.optional(v.string()), // e.g. "Agency Manager"
    role: v.string(),
    phase: tracePhase,
    summary: v.string(),
    input: v.optional(v.any()),
    output: v.optional(v.any()),
    toolName: v.optional(v.string()),
    model: v.optional(v.string()),
    promptTokens: v.optional(v.number()),
    completionTokens: v.optional(v.number()),
    costEstimate: v.optional(v.number()),
    durationMs: v.optional(v.number()),
  })
    .index("by_job", ["jobId"])
    .index("by_task", ["taskId"])
    .index("by_role", ["role"]),

  // --- evaluation ----------------------------------------------------------
  evalCases: defineTable({
    name: v.string(),
    suite: v.union(v.literal("restaurant"), v.literal("salon")),
    input: v.any(), // fixture: business facts + source assets
    expected: v.any(), // expected extraction + translation/cultural rules
    active: v.boolean(),
  }).index("by_suite", ["suite"]),

  evalResults: defineTable({
    caseId: v.id("evalCases"),
    promptVersion: v.string(),
    passed: v.boolean(),
    failures: v.array(v.string()),
    metrics: v.optional(v.any()),
  })
    .index("by_case", ["caseId"])
    .index("by_promptVersion", ["promptVersion"]),
});
