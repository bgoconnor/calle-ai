import { query } from "./_generated/server";
import { v } from "convex/values";

// Read APIs the Control Room and operator job board bind against on day one.

// Job board: newest first, each row enriched with its business.
export const listJobs = query({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.query("jobs").order("desc").collect();
    return Promise.all(
      jobs.map(async (job) => ({
        ...job,
        business: await ctx.db.get(job.businessId),
      })),
    );
  },
});

// Job detail: the job plus everything hanging off it for the run view.
export const getJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return null;

    const [business, tasks, artifacts, approvals] = await Promise.all([
      ctx.db.get(job.businessId),
      ctx.db
        .query("tasks")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .collect(),
      ctx.db
        .query("artifacts")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .collect(),
      ctx.db
        .query("approvals")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .collect(),
    ]);
    const plan = job.planId ? await ctx.db.get(job.planId) : null;

    return {
      job,
      business,
      plan,
      tasks: tasks.sort((a, b) => a.order - b.order),
      artifacts,
      approvals,
    };
  },
});

// Trace tree source: all events for a job in chronological order.
export const jobTrace = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    return await ctx.db
      .query("traceEvents")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .order("asc")
      .collect();
  },
});
