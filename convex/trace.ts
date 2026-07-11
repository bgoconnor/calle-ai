import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { tracePhase } from "./validators";

// The load-bearing observability primitive. Every agent step — plan, delegate,
// tool call, LLM call, review, artifact write, publish, error — records one row
// here. The Control Room's trace tree, cost/latency rollups, and filters all
// read from `traceEvents`. Call this around every step from day one.
export const emitTrace = mutation({
  args: {
    jobId: v.id("jobs"),
    taskId: v.optional(v.id("tasks")),
    parentRole: v.optional(v.string()),
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
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("traceEvents", args);
  },
});
