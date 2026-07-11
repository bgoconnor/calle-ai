import { action } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import { ROLES, PUBLISH_TAIL } from "./agents/roles";

// Roles whose artifacts the Manager reviews (and may send back for one revision).
// Stubbed/derived roles are skipped.
const REVIEWED = new Set([
  "intake",
  "menu_structuring",
  "localization",
  "publisher_qa",
]);

// Orchestrates a job: Manager plans the content phase → fixed publishing tail is
// appended → each step runs through the generic specialist executor, with the
// Manager reviewing key artifacts and requesting one revision when needed.
// Trigger from the operator board: await runJob({ jobId })
export const runJob = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }): Promise<{ status: string }> => {
    await ctx.runMutation(internal.agents.helpers.setJobStatus, {
      jobId,
      status: "planning",
      startedAt: Date.now(),
    });

    // 1. Manager dynamically plans the content phase.
    const plan = await ctx.runAction(internal.agents.manager.planJob, { jobId });

    // 2. Full plan = content steps + fixed publishing tail.
    const fullRoles = [...plan.steps.map((s) => s.role), ...PUBLISH_TAIL];
    const steps = fullRoles.map((role, i) => ({
      order: i,
      role,
      purpose: plan.steps[i]?.purpose ?? ROLES[role].name,
      inputKinds: [] as string[],
    }));

    const { taskIds } = await ctx.runMutation(
      internal.agents.helpers.createPlanWithTasks,
      { jobId, rationale: plan.rationale, steps },
    );

    // 3. Execute each step; review + revise where applicable.
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

      let res: { status: string; artifactId?: any } = await ctx.runAction(
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

      // Manager review + single revision cycle.
      if (REVIEWED.has(step.role) && res.artifactId) {
        const review = await ctx.runAction(
          internal.agents.manager.reviewArtifact,
          { jobId, taskId, artifactId: res.artifactId, role: step.role },
        );
        if (!review.approved && review.revisionInstruction) {
          await ctx.runMutation(internal.agents.helpers.updateTask, {
            taskId,
            status: "revision_requested",
            reviewNote: review.revisionInstruction,
          });
          res = await ctx.runAction(internal.agents.specialist.runSpecialist, {
            jobId,
            taskId,
            role: step.role,
            revisionNote: review.revisionInstruction,
          });
          if (res.status === "failed") {
            await ctx.runMutation(internal.agents.helpers.setJobStatus, {
              jobId,
              status: "failed",
              error: `Revision of ${step.role} failed`,
              finishedAt: Date.now(),
            });
            return { status: "failed" };
          }
        }
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
      summary:
        "Job completed — microsite, catalog, GBP pack, and delivery report ready",
    });

    return { status: "completed" };
  },
});
