import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const artifactPayload = v.any();

export default defineSchema({
  businesses: defineTable({
    name: v.string(),
    slug: v.string(),
    category: v.string(),
    city: v.string(),
    primaryLanguage: v.string(),
    secondaryLanguage: v.string(),
    publishStatus: v.union(v.literal("draft"), v.literal("published"), v.literal("unpublished")),
    liveVersionId: v.optional(v.id("siteVersions")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  jobs: defineTable({
    businessId: v.id("businesses"),
    brief: v.string(),
    status: v.union(
      v.literal("brief_review"), v.literal("queued"), v.literal("running"),
      v.literal("needs_review"), v.literal("ready_to_publish"), v.literal("published"),
      v.literal("failed")
    ),
    structuredBrief: v.optional(v.any()),
    managerPlan: v.optional(v.any()),
    requiredDeliverables: v.array(v.string()),
    sourceUrls: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_business", ["businessId"]).index("by_status", ["status"]),

  sourceAssets: defineTable({
    jobId: v.id("jobs"),
    kind: v.union(v.literal("maps"), v.literal("menu_photo"), v.literal("storefront_photo"), v.literal("url"), v.literal("voice_brief")),
    url: v.optional(v.string()),
    label: v.string(),
    extractedText: v.optional(v.string()),
    confidence: v.number(),
    createdAt: v.number(),
  }).index("by_job", ["jobId"]),

  tasks: defineTable({
    jobId: v.id("jobs"),
    parentTaskId: v.optional(v.id("tasks")),
    agent: v.string(),
    title: v.string(),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("complete"), v.literal("needs_review"), v.literal("failed")),
    inputArtifactIds: v.array(v.id("artifacts")),
    outputArtifactIds: v.array(v.id("artifacts")),
    tools: v.array(v.string()),
    revisionOfTaskId: v.optional(v.id("tasks")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_job", ["jobId"]).index("by_parent", ["parentTaskId"]),

  artifacts: defineTable({
    jobId: v.id("jobs"),
    taskId: v.optional(v.id("tasks")),
    kind: v.string(),
    title: v.string(),
    payload: artifactPayload,
    confidence: v.number(),
    approvalStatus: v.union(v.literal("pending"), v.literal("approved"), v.literal("changes_requested"), v.literal("escalated")),
    version: v.number(),
    createdAt: v.number(),
  }).index("by_job", ["jobId"]).index("by_task", ["taskId"]),

  citations: defineTable({
    jobId: v.id("jobs"),
    artifactId: v.optional(v.id("artifacts")),
    title: v.string(),
    url: v.string(),
    snippet: v.string(),
    query: v.string(),
    retrievedAt: v.number(),
  }).index("by_job", ["jobId"]),

  traceEvents: defineTable({
    jobId: v.id("jobs"),
    taskId: v.optional(v.id("tasks")),
    parentTaskId: v.optional(v.id("tasks")),
    agent: v.string(),
    event: v.string(),
    inputSummary: v.string(),
    outputSummary: v.string(),
    tools: v.array(v.string()),
    latencyMs: v.number(),
    tokenEstimate: v.number(),
    costUsd: v.number(),
    createdAt: v.number(),
  }).index("by_job", ["jobId"]).index("by_task", ["taskId"]),

  memory: defineTable({
    businessId: v.id("businesses"),
    layer: v.union(v.literal("business_history"), v.literal("agency_policy"), v.literal("current_task")),
    key: v.string(),
    value: v.any(),
    updatedAt: v.number(),
  }).index("by_business_layer", ["businessId", "layer"]),

  siteVersions: defineTable({
    businessId: v.id("businesses"),
    jobId: v.id("jobs"),
    version: v.number(),
    content: v.any(),
    isPublished: v.boolean(),
    createdAt: v.number(),
  }).index("by_business", ["businessId"]),

  evalCases: defineTable({
    name: v.string(),
    category: v.string(),
    input: v.any(),
    expected: v.any(),
    active: v.boolean(),
  }),
});
