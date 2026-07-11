import { internalAction } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import { ROLES } from "./roles";
import { callStructured } from "./llm";

// The ONE generic specialist executor. Runs any role from the roster:
// loads job context, builds the prompt from business + policies + prior
// artifacts (the handoff), calls the model with the role's output schema,
// writes the resulting artifact, updates the task, and traces every step.
export const runSpecialist = internalAction({
  args: {
    jobId: v.id("jobs"),
    taskId: v.id("tasks"),
    role: v.string(),
    revisionNote: v.optional(v.string()),
  },
  handler: async (ctx, { jobId, taskId, role, revisionNote }) => {
    const roleDef = ROLES[role];
    if (!roleDef) throw new Error(`unknown role: ${role}`);
    const start = Date.now();

    await ctx.runMutation(internal.agents.helpers.updateTask, {
      taskId,
      status: "running",
      ...(revisionNote ? { attempt: 2, reviewNote: revisionNote } : {}),
    });

    const context = await ctx.runQuery(internal.agents.helpers.getJobContext, {
      jobId,
    });
    const priorArtifacts = context.artifacts.map((a) => ({
      kind: a.kind,
      data: a.data,
    }));

    // Discovery is stubbed until Linkup is wired — write an honest placeholder
    // rather than fabricate uncited research.
    if (roleDef.stub) {
      const data = {
        findings: [],
        listingGaps: [],
        note: "Linkup live search not yet wired — placeholder research artifact.",
      };
      const artifactId = await ctx.runMutation(
        internal.agents.helpers.writeArtifact,
        {
          jobId,
          businessId: context.job.businessId,
          kind: roleDef.artifactKind,
          data,
          producedByRole: roleDef.name,
          taskId,
        },
      );
      await ctx.runMutation(internal.agents.helpers.updateTask, {
        taskId,
        status: "succeeded",
        outputArtifactId: artifactId,
        durationMs: Date.now() - start,
      });
      await ctx.runMutation(api.trace.emitTrace, {
        jobId,
        taskId,
        parentRole: "Agency Manager",
        role: roleDef.name,
        phase: "tool_call",
        summary: `${roleDef.name} (stub) wrote placeholder ${roleDef.artifactKind}`,
        toolName: "linkup",
        durationMs: Date.now() - start,
      });
      return { status: "succeeded" as const, artifactId };
    }

    // Vision: pass menu/service photo URLs when the role reads images.
    const images = roleDef.usesVision
      ? context.assets
          .filter(
            (a) =>
              (a.kind === "menu_photo" || a.kind === "service_list") && a.url,
          )
          .map((a) => a.url as string)
      : undefined;

    try {
      const user = roleDef.buildUser({
        business: context.business,
        policies: context.policies,
        priorArtifacts,
        revisionNote,
      });

      const llm = await callStructured({
        system: roleDef.system,
        user,
        schemaName: roleDef.outputName,
        schema: roleDef.outputSchema,
        images,
      });

      const artifactId = await ctx.runMutation(
        internal.agents.helpers.writeArtifact,
        {
          jobId,
          businessId: context.job.businessId,
          kind: roleDef.artifactKind,
          data: llm.data,
          producedByRole: roleDef.name,
          taskId,
        },
      );

      const durationMs = Date.now() - start;
      await ctx.runMutation(internal.agents.helpers.updateTask, {
        taskId,
        status: "succeeded",
        outputArtifactId: artifactId,
        durationMs,
      });
      await ctx.runMutation(api.trace.emitTrace, {
        jobId,
        taskId,
        parentRole: "Agency Manager",
        role: roleDef.name,
        phase: "llm_call",
        summary: `${roleDef.name} produced ${roleDef.artifactKind}${revisionNote ? " (revision)" : ""}`,
        model: llm.model,
        promptTokens: llm.promptTokens,
        completionTokens: llm.completionTokens,
        durationMs,
        output: llm.data,
      });
      return { status: "succeeded" as const, artifactId };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.agents.helpers.updateTask, {
        taskId,
        status: "failed",
        blockerReason: message,
        durationMs: Date.now() - start,
      });
      await ctx.runMutation(api.trace.emitTrace, {
        jobId,
        taskId,
        role: roleDef.name,
        phase: "error",
        summary: `${roleDef.name} failed: ${message}`,
      });
      return { status: "failed" as const, error: message };
    }
  },
});
