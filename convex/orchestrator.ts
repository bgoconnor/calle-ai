import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { ROLES, PUBLISH_TAIL } from "./agents/roles";
import { callTool } from "./tools";
import { prepareMenuGeneratorHandoff } from "./agents/menuEvidence";

// Roles whose artifacts the Manager reviews (and may send back for one revision).
// Stubbed/derived roles are skipped.
const REVIEWED = new Set([
  "intake",
  "menu_discovery",
  "menu_normalization",
  "localization",
  "menu_testimonials",
  "publisher_qa",
]);

// Orchestrates a job: Manager plans the content phase → fixed publishing tail is
// appended → each step runs through the generic specialist executor, with the
// Manager reviewing key artifacts and requesting one revision when needed.
// Trigger from the operator board: await runJob({ jobId })
export const runJob = action({
  args: { jobId: v.id("jobs"), publicBaseUrl: v.optional(v.string()) },
  handler: async (
    ctx,
    { jobId, publicBaseUrl },
  ): Promise<{ status: string; url?: string }> => {
    const initialContext = await ctx.runQuery(
      internal.agents.helpers.getJobContext,
      { jobId },
    );
    const approvalMode = initialContext.job.approvalMode ?? "autonomous";
    const failJob = async (error: string) => {
      await ctx.runMutation(internal.agents.helpers.setJobStatus, {
        jobId,
        status: "failed",
        error,
        finishedAt: Date.now(),
      });
      if (approvalMode === "autonomous") {
        await ctx.runMutation(
          internal.agents.helpers.retractBusinessDeployments,
          { jobId, reason: error },
        );
      }
      return { status: "failed" as const };
    };
    await ctx.runMutation(internal.agents.helpers.setJobStatus, {
      jobId,
      status: "planning",
      startedAt: Date.now(),
    });

    // 1. Manager dynamically plans the content phase.
    let plan;
    try {
      plan = await ctx.runAction(internal.agents.manager.planJob, { jobId });
    } catch (error) {
      return await failJob(
        `Manager planning failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

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

    // Track artifacts produced so far so each task records the handoff inputs it
    // actually consumed — real provenance for the Control Room trace.
    const producedArtifactIds: any[] = [];

    // 3. Execute each step; review + revise where applicable.
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const taskId = taskIds[i];

      // Record which prior artifacts feed this step (the handoff).
      await ctx.runMutation(internal.agents.helpers.updateTask, {
        taskId,
        inputArtifactIds: [...producedArtifactIds],
      });

      if (step.role === "publisher_qa") {
        const context = await ctx.runQuery(
          internal.agents.helpers.getJobContext,
          { jobId },
        );
        const normalizedMenu = [...context.artifacts]
          .reverse()
          .find((artifact) => artifact.kind === "normalized_menu")?.data;
        const testimonials = [...context.artifacts]
          .reverse()
          .find((artifact) => artifact.kind === "menu_testimonials")?.data;
        const menuSources = [...context.artifacts]
          .reverse()
          .find((artifact) => artifact.kind === "menu_sources")?.data;
        if (normalizedMenu) {
          const handoff = prepareMenuGeneratorHandoff(
            normalizedMenu,
            testimonials,
            menuSources,
          );
          if (!handoff.publishable) {
            const reason = `Publisher evidence warnings: ${handoff.blockers.map((blocker) => blocker.message).join(" ")}`;
            await callTool(ctx, "trace.emit", {
              jobId,
              taskId,
              parentRole: "Agency Manager",
              role: "Agency Manager",
              phase: "review",
              summary: reason,
              output: handoff,
            });
            if (approvalMode === "require_approval") {
              await ctx.runMutation(internal.agents.helpers.escalateTask, {
                jobId,
                taskId,
                reason,
              });
              return { status: "escalated" };
            }
            await callTool(ctx, "trace.emit", {
              jobId,
              taskId,
              parentRole: "Agency Manager",
              role: "Agency Manager",
              phase: "review",
              summary:
                "Autonomous manager accepted evidence warnings and continued toward publication",
              output: { decision: "continue", warnings: handoff.blockers },
            });
          }
        }
      }

      await callTool(ctx, "trace.emit", {
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
        if (step.role === "pdf_menu") {
          await callTool(ctx, "trace.emit", {
            jobId,
            taskId,
            parentRole: "Agency Manager",
            role: "Agency Manager",
            phase: "review",
            summary:
              "PDF menu failed as an optional derivative; continuing to microsite publication",
            output: { decision: "continue_without_pdf" },
          });
          continue;
        }
        return await failJob(`Step ${step.role} failed`);
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
            return await failJob(`Revision of ${step.role} failed`);
          }
        }
      }

      if (res.artifactId) producedArtifactIds.push(res.artifactId);
    }

    const completedContext = await ctx.runQuery(
      internal.agents.helpers.getJobContext,
      { jobId },
    );
    const latest = (kind: string) =>
      [...completedContext.artifacts]
        .reverse()
        .find((artifact) => artifact.kind === kind)?.data as any;
    const blockers: string[] = [];
    if (!latest("microsite"))
      blockers.push("no microsite artifact was produced");
    if (
      /restaurant|food|bakery|cafe/i.test(completedContext.business?.type ?? "")
    ) {
      const menu = latest("normalized_menu");
      const itemCount = (menu?.sections ?? []).reduce(
        (sum: number, section: any) => sum + (section.items?.length ?? 0),
        0,
      );
      if (!itemCount)
        blockers.push("no source-supported menu items were found");
      if (menu?.likelyComplete === false)
        blockers.push("the normalized menu is explicitly incomplete");
    }

    if (approvalMode === "require_approval") {
      await ctx.runMutation(internal.agents.helpers.setJobStatus, {
        jobId,
        status: "awaiting_approval",
        ...(blockers.length
          ? { error: `Publish review required: ${blockers.join("; ")}` }
          : {}),
        finishedAt: Date.now(),
      });
      await callTool(ctx, "trace.emit", {
        jobId,
        role: "Publisher & QA Specialist",
        phase: "review",
        summary: blockers.length
          ? `Waiting for required approval with blockers: ${blockers.join("; ")}`
          : "Waiting for required operator approval before publishing",
      });
      return { status: "awaiting_approval" };
    }

    if (blockers.length) {
      const hardBlockers = blockers.filter((blocker) =>
        blocker.includes("no microsite artifact"),
      );
      await callTool(ctx, "trace.emit", {
        jobId,
        role: "Agency Manager",
        phase: "review",
        summary: hardBlockers.length
          ? `Autonomous publish has terminal blockers: ${hardBlockers.join("; ")}`
          : `Autonomous manager published with degraded optional deliverables: ${blockers.join("; ")}`,
        output: {
          blockers,
          hardBlockers,
          decision: hardBlockers.length ? "retract" : "publish_degraded",
        },
      });
      if (hardBlockers.length)
        return await failJob(
          `Autonomous publish blocked: ${hardBlockers.join("; ")}`,
        );
    }

    const published = await ctx.runMutation(api.agency.publishJob, {
      jobId,
      ...(publicBaseUrl ? { publicBaseUrl } : {}),
    });
    return { status: "published", url: published.url };
  },
});
