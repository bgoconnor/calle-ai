import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { jobStatus, taskStatus } from "../validators";

// Internal read/write helpers the agent ACTIONS call via ctx.runQuery/runMutation
// (actions can't touch ctx.db directly). Not part of the public API.

export const getJobContext = internalQuery({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("job not found");
    const business = await ctx.db.get(job.businessId);

    const [assets, artifacts, bizPolicies, agencyPolicies] = await Promise.all([
      ctx.db
        .query("assets")
        .withIndex("by_business", (q) => q.eq("businessId", job.businessId))
        .collect(),
      ctx.db
        .query("artifacts")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .collect(),
      ctx.db
        .query("policies")
        .withIndex("by_business", (q) => q.eq("businessId", job.businessId))
        .collect(),
      ctx.db
        .query("policies")
        .withIndex("by_scope", (q) => q.eq("scope", "agency"))
        .collect(),
    ]);

    return {
      job,
      business,
      assets,
      artifacts,
      policies: [...agencyPolicies, ...bizPolicies].map((p) => ({
        key: p.key,
        value: p.value,
        scope: p.scope,
      })),
    };
  },
});

export const writeArtifact = internalMutation({
  args: {
    jobId: v.id("jobs"),
    businessId: v.id("businesses"),
    kind: v.string(),
    data: v.any(),
    producedByRole: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    confidence: v.optional(v.number()),
    supersedesId: v.optional(v.id("artifacts")),
  },
  handler: async (ctx, a) => {
    const existing = await ctx.db
      .query("artifacts")
      .withIndex("by_job_kind", (q) =>
        q.eq("jobId", a.jobId).eq("kind", a.kind),
      )
      .collect();
    return await ctx.db.insert("artifacts", { ...a, version: existing.length + 1 });
  },
});

export const createPlanWithTasks = internalMutation({
  args: {
    jobId: v.id("jobs"),
    rationale: v.optional(v.string()),
    steps: v.array(
      v.object({
        order: v.number(),
        role: v.string(),
        purpose: v.string(),
        inputKinds: v.array(v.string()),
        ephemeral: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, { jobId, rationale, steps }) => {
    const priorPlans = await ctx.db
      .query("plans")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .collect();
    const planId = await ctx.db.insert("plans", {
      jobId,
      version: priorPlans.length + 1,
      steps,
      rationale,
    });
    const taskIds = [];
    for (const step of steps) {
      taskIds.push(
        await ctx.db.insert("tasks", {
          jobId,
          planId,
          order: step.order,
          role: step.role,
          status: "pending",
          inputArtifactIds: [],
          attempt: 1,
        }),
      );
    }
    await ctx.db.patch(jobId, { planId, status: "running" });
    return { planId, taskIds };
  },
});

export const updateTask = internalMutation({
  args: {
    taskId: v.id("tasks"),
    status: v.optional(taskStatus),
    outputArtifactId: v.optional(v.id("artifacts")),
    confidence: v.optional(v.number()),
    blockerReason: v.optional(v.string()),
    reviewNote: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, { taskId, ...patch }) => {
    await ctx.db.patch(taskId, patch);
  },
});

export const setJobStatus = internalMutation({
  args: {
    jobId: v.id("jobs"),
    status: jobStatus,
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  },
  handler: async (ctx, { jobId, ...patch }) => {
    await ctx.db.patch(jobId, patch);
  },
});
