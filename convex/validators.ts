import { v } from "convex/values";

// Shared enums used by both the schema and the functions that write these rows,
// so the two never drift.

export const jobStatus = v.union(
  v.literal("queued"),
  v.literal("planning"),
  v.literal("running"),
  v.literal("awaiting_approval"),
  v.literal("publishing"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("escalated"),
);

export const taskStatus = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("revision_requested"),
  v.literal("escalated"),
);

export const tracePhase = v.union(
  v.literal("plan"),
  v.literal("delegate"),
  v.literal("tool_call"),
  v.literal("llm_call"),
  v.literal("review"),
  v.literal("artifact_write"),
  v.literal("publish"),
  v.literal("error"),
);
