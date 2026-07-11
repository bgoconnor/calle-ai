import { action } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import { DEFAULT_SEQUENCE, ROLES } from "./agents/roles";

// Walking-skeleton orchestrator: runs a job through a FIXED specialist sequence.
// Next step replaces the fixed sequence with the Agency Manager's dynamic plan
// + per-artifact review/revision. Trigger from the operator board:
//   await runJob({ jobId })
export const runJob = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }): Promise<{ status: string }> => {
    await ctx.runMutation(internal.agents.helpers.setJobStatus, {
      jobId,
      status: "running",
      startedAt: Date.now(),
    });

    // Fixed plan (stands in for the Manager until dynamic planning lands).
    const steps = DEFAULT_SEQUENCE.map((role, i) => ({
      order: i,
      role,
      purpose: ROLES[role].name,
      inputKinds: [] as string[],
    }));

    const { taskIds } = await ctx.runMutation(
      internal.agents.helpers.createPlanWithTasks,
      { jobId, rationale: "Fixed walking-skeleton sequence", steps },
    );

    await ctx.runMutation(api.trace.emitTrace, {
      jobId,
      role: "Agency Manager",
      phase: "plan",
      summary: `Planned ${steps.length} steps: ${steps.map((s) => s.role).join(" → ")}`,
      output: steps,
    });

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const taskId = taskIds[i];

      await ctx.runMutation(api.trace.emitTrace, {
        jobId,
        taskId,
        parentRole: "Agency Manager",
        role: "Agency Manager",
        phase: "delegate",
        summary: `Delegating to ${ROLES[step.role].name}`,
      });

      const res: { status: string } = await ctx.runAction(
        internal.agents.specialist.runSpecialist,
        { jobId, taskId, role: step.role },
      );

      if (res.status === "failed") {
        await ctx.runMutation(internal.agents.helpers.setJobStatus, {
          jobId,
          status: "failed",
          error: `Step ${step.role} failed`,
          finishedAt: Date.now(),
        });
        return { status: "failed" };
      }
    }

    await ctx.runMutation(internal.agents.helpers.setJobStatus, {
      jobId,
      status: "completed",
      finishedAt: Date.now(),
    });
    await ctx.runMutation(api.trace.emitTrace, {
      jobId,
      role: "Publisher & QA Specialist",
      phase: "publish",
      summary: "Job completed — artifacts ready (microsite, catalog, research)",
    });

    return { status: "completed" };
  },
});
