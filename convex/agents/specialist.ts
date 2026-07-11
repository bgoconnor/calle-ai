import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { ROLES } from "./roles";
import { callStructured } from "./llm";
import type { Id } from "../_generated/dataModel";
import { callTool } from "../tools";
import { runMenuDiscovery, runMenuTestimonials } from "./menuResearch";
import { runBusinessResearch } from "./businessResearch";
import { prepareMenuGeneratorHandoff } from "./menuEvidence";

type SpecialistResult =
  | { status: "succeeded"; artifactId: Id<"artifacts"> }
  | { status: "failed"; error: string };

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
  handler: async (ctx, { jobId, taskId, role, revisionNote }): Promise<SpecialistResult> => {
    const roleDef = ROLES[role];
    if (!roleDef) throw new Error(`unknown role: ${role}`);
    const start = Date.now();

    await ctx.runMutation(internal.agents.helpers.updateTask, {
      taskId,
      status: "running",
      ...(revisionNote ? { attempt: 2, reviewNote: revisionNote } : {}),
    });

    const context: any = await ctx.runQuery(internal.agents.helpers.getJobContext, {
      jobId,
    });
    const priorArtifacts = context.artifacts.map((a: any) => ({
      kind: a.kind,
      data: a.data,
    }));
    if (role === "pdf_menu") {
      try {
        const normalized = [...context.artifacts].reverse().find((a: any) => a.kind === "normalized_menu");
        const bilingual = [...context.artifacts].reverse().find((a: any) => a.kind === "bilingual_content");
        if (!normalized || !bilingual) throw new Error("PDF menu requires the latest normalized_menu and bilingual_content artifacts");
        const data = await callTool(ctx, "pdf_menu.generate", {
          normalizedMenuArtifactId: String(normalized._id),
          bilingualContentArtifactId: String(bilingual._id),
          normalizedMenu: normalized.data,
          bilingualContent: bilingual.data,
        });
        const artifactId: Id<"artifacts"> = await ctx.runMutation(internal.agents.helpers.writeArtifact, {
          jobId,
          businessId: context.job.businessId,
          kind: roleDef.artifactKind,
          data,
          producedByRole: roleDef.name,
          taskId,
          confidence: data.warnings.length ? 0.8 : 1,
        });
        const durationMs = Date.now() - start;
        await ctx.runMutation(internal.agents.helpers.updateTask, { taskId, status: "succeeded", outputArtifactId: artifactId, durationMs });
        await callTool(ctx, "trace.emit", {
          jobId, taskId, parentRole: "Agency Manager", role: roleDef.name, phase: "tool_call",
          summary: `Rendered ${data.itemCount} supported items into a ${data.pageCount}-page PDF menu`,
          toolName: "pdf_menu.generate", durationMs,
          input: { sourceArtifactIds: data.sourceArtifactIds },
          output: { artifactId, pageCount: data.pageCount, itemCount: data.itemCount, warnings: data.warnings },
        });
        return { status: "succeeded", artifactId };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await ctx.runMutation(internal.agents.helpers.updateTask, { taskId, status: "failed", blockerReason: message, durationMs: Date.now() - start });
        await callTool(ctx, "trace.emit", { jobId, taskId, role: roleDef.name, phase: "error", summary: `${roleDef.name} failed: ${message}` });
        return { status: "failed", error: message };
      }
    }
    if (role === "publisher_qa") {
      const normalizedMenu = [...context.artifacts].reverse().find((a: any) => a.kind === "normalized_menu")?.data;
      const testimonials = [...context.artifacts].reverse().find((a: any) => a.kind === "menu_testimonials")?.data;
      const menuSources = [...context.artifacts].reverse().find((a: any) => a.kind === "menu_sources")?.data;
      if (normalizedMenu) {
        priorArtifacts.push({
          kind: "menu_generator_input",
          data: prepareMenuGeneratorHandoff(normalizedMenu, testimonials, menuSources),
        });
      }
    }

    // Discovery is stubbed until Linkup is wired — write an honest placeholder
    // rather than fabricate uncited research.
    if (roleDef.stub) {
      const data = {
        findings: [],
        listingGaps: [],
        note: "Linkup live search not yet wired — placeholder research artifact.",
      };
      const artifactId: Id<"artifacts"> = await ctx.runMutation(
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
      await callTool(ctx, "trace.emit", {
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
    const ownerImages = context.assets
          .filter(
            (a: any) =>
              (a.kind === "menu_photo" || a.kind === "service_list") && a.url,
          )
          .map((a: any) => a.url as string);
    const discoveredImages = role === "menu_normalization"
      ? [...context.artifacts].reverse().find((artifact: any) => artifact.kind === "menu_sources")?.data?.imageEvidence
          ?.map((image: any) => image.url).filter(Boolean) ?? []
      : [];
    const images = roleDef.usesVision
      ? [...new Set([...discoveredImages, ...ownerImages])].slice(0, 12) as string[]
      : undefined;

    try {
      const toolRole = role === "intake"
        ? await runBusinessResearch(ctx, {
            jobId,
            taskId,
            businessId: context.job.businessId,
            context: { business: context.business, artifacts: context.artifacts },
          })
        : role === "menu_discovery"
        ? await runMenuDiscovery(ctx, {
            jobId,
            taskId,
            businessId: context.job.businessId,
            context: { business: context.business, artifacts: context.artifacts },
          })
        : role === "menu_testimonials"
          ? await runMenuTestimonials(ctx, {
              jobId,
              taskId,
              businessId: context.job.businessId,
              context: { business: context.business, artifacts: context.artifacts },
            })
          : null;

      const llm = toolRole ?? await callStructured({
        system: roleDef.system,
        user: roleDef.buildUser({
          business: context.business,
          policies: context.policies,
          priorArtifacts,
          revisionNote,
        }),
        schemaName: roleDef.outputName,
        schema: roleDef.outputSchema,
        images,
      });

      const artifactId: Id<"artifacts"> = await ctx.runMutation(
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

      if (toolRole?.citations.length) {
        await callTool(ctx, "citations.persist", {
          jobId,
          artifactId,
          citations: toolRole.citations,
        });
      }

      const durationMs = Date.now() - start;
      await ctx.runMutation(internal.agents.helpers.updateTask, {
        taskId,
        status: "succeeded",
        outputArtifactId: artifactId,
        durationMs,
      });
      await callTool(ctx, "trace.emit", {
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
      await callTool(ctx, "trace.emit", {
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
