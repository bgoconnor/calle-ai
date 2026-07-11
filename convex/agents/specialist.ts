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

function compactArtifactForPrompt(kind: string, data: any) {
  if (kind === "printable_menu_pdf") {
    const { dataUrl: _dataUrl, ...metadata } = data ?? {};
    return metadata;
  }
  if (kind === "business_facts") {
    return {
      canonicalFacts: data?.canonicalFacts,
      handoff: data?.handoff,
      conflicts: data?.conflicts,
      missingFacts: data?.missingFacts,
      sources: (data?.sources ?? []).slice(0, 12).map((source: any) => ({
        title: source.title,
        url: source.url,
        sourceType: source.sourceType,
        authority: source.authority,
        snippet: String(source.snippet ?? "").slice(0, 800),
      })),
      visualEvidence: (data?.visualEvidence ?? [])
        .slice(0, 12)
        .map((image: any) => ({ title: image.title, url: image.url })),
    };
  }
  if (kind === "menu_sources") {
    return {
      sources: (data?.sources ?? []).map((source: any) => ({
        ...source,
        snippet: String(source.snippet ?? "").slice(0, 1200),
      })),
      selectedSourceUrls: data?.selectedSourceUrls,
      canonicalSourceUrl: data?.canonicalSourceUrl,
      recencyRationale: data?.recencyRationale,
      status: data?.status,
      blockers: data?.blockers,
      pageEvidence: (data?.pageEvidence ?? []).slice(0, 4).map((page: any) => ({
        url: page.url,
        retrievedAt: page.retrievedAt,
        markdown: String(page.markdown ?? "").slice(0, 8_000),
      })),
      imageEvidence: (data?.imageEvidence ?? [])
        .slice(0, 12)
        .map((image: any) => ({
          title: image.title ?? image.alt,
          url: image.url,
          sourceUrl: image.sourceUrl,
        })),
    };
  }
  return data;
}

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
  handler: async (
    ctx,
    { jobId, taskId, role, revisionNote },
  ): Promise<SpecialistResult> => {
    const roleDef = ROLES[role];
    if (!roleDef) throw new Error(`unknown role: ${role}`);
    const start = Date.now();

    await ctx.runMutation(internal.agents.helpers.updateTask, {
      taskId,
      status: "running",
      ...(revisionNote ? { attempt: 2, reviewNote: revisionNote } : {}),
    });

    const context: any = await ctx.runQuery(
      internal.agents.helpers.getJobContext,
      {
        jobId,
      },
    );
    const latestArtifacts = new Map<string, any>();
    for (const artifact of context.artifacts)
      latestArtifacts.set(artifact.kind, artifact);
    const priorArtifacts = [...latestArtifacts.values()].map((a: any) => ({
      kind: a.kind,
      data: compactArtifactForPrompt(a.kind, a.data),
    }));
    if (role === "pdf_menu") {
      try {
        const normalized = [...context.artifacts]
          .reverse()
          .find((a: any) => a.kind === "normalized_menu");
        const bilingual = [...context.artifacts]
          .reverse()
          .find((a: any) => a.kind === "bilingual_content");
        if (!normalized || !bilingual)
          throw new Error(
            "PDF menu requires the latest normalized_menu and bilingual_content artifacts",
          );
        const data = await callTool(ctx, "pdf_menu.generate", {
          normalizedMenuArtifactId: String(normalized._id),
          bilingualContentArtifactId: String(bilingual._id),
          normalizedMenu: normalized.data,
          bilingualContent: bilingual.data,
        });
        const artifactId: Id<"artifacts"> = await ctx.runMutation(
          internal.agents.helpers.writeArtifact,
          {
            jobId,
            businessId: context.job.businessId,
            kind: roleDef.artifactKind,
            data,
            producedByRole: roleDef.name,
            taskId,
            confidence: data.warnings.length ? 0.8 : 1,
          },
        );
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
          phase: "tool_call",
          summary: `Rendered ${data.itemCount} supported items into a ${data.pageCount}-page PDF menu`,
          toolName: "pdf_menu.generate",
          durationMs,
          input: { sourceArtifactIds: data.sourceArtifactIds },
          output: {
            artifactId,
            pageCount: data.pageCount,
            itemCount: data.itemCount,
            warnings: data.warnings,
          },
        });
        return { status: "succeeded", artifactId };
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
        return { status: "failed", error: message };
      }
    }
    if (role === "publisher_qa") {
      const normalizedMenu = [...context.artifacts]
        .reverse()
        .find((a: any) => a.kind === "normalized_menu")?.data;
      const testimonials = [...context.artifacts]
        .reverse()
        .find((a: any) => a.kind === "menu_testimonials")?.data;
      const menuSources = [...context.artifacts]
        .reverse()
        .find((a: any) => a.kind === "menu_sources")?.data;
      if (normalizedMenu) {
        priorArtifacts.push({
          kind: "menu_generator_input",
          data: prepareMenuGeneratorHandoff(
            normalizedMenu,
            testimonials,
            menuSources,
          ),
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
    const discoveredImages =
      role === "menu_normalization"
        ? ([...context.artifacts]
            .reverse()
            .find((artifact: any) => artifact.kind === "menu_sources")
            ?.data?.imageEvidence?.map((image: any) => image.url)
            .filter(Boolean) ?? [])
        : role === "creative_direction"
          ? ([...context.artifacts]
              .reverse()
              .find((artifact: any) => artifact.kind === "business_facts")
              ?.data?.visualEvidence?.map((image: any) => image.url)
              .filter(Boolean) ?? [])
          : [];
    // One inaccessible or non-raster asset fails an entire vision call.
    const visionSafe = (url: string) => {
      if (
        !/^https?:\/\//i.test(url) ||
        /maps\.googleapis\.com|staticmap|doubleclick|googlesyndication|\.svg(?:\?|$)/i.test(
          url,
        )
      )
        return false;
      try {
        const parsed = new URL(url);
        return (
          /\.(?:png|jpe?g|webp|gif)$/i.test(parsed.pathname) ||
          (parsed.hostname === "res.cloudinary.com" &&
            parsed.pathname.includes("/image/upload/"))
        );
      } catch {
        return false;
      }
    };
    const images = roleDef.usesVision
      ? ([...new Set([...discoveredImages, ...ownerImages])]
          .filter(visionSafe)
          .slice(0, 12) as string[])
      : undefined;

    try {
      const toolRole =
        role === "intake"
          ? await runBusinessResearch(ctx, {
              jobId,
              taskId,
              businessId: context.job.businessId,
              context: {
                business: context.business,
                artifacts: context.artifacts,
              },
            })
          : role === "menu_discovery"
            ? await runMenuDiscovery(ctx, {
                jobId,
                taskId,
                businessId: context.job.businessId,
                context: {
                  business: context.business,
                  artifacts: context.artifacts,
                },
              })
            : role === "menu_testimonials"
              ? await runMenuTestimonials(ctx, {
                  jobId,
                  taskId,
                  businessId: context.job.businessId,
                  context: {
                    business: context.business,
                    artifacts: context.artifacts,
                  },
                })
              : null;

      const llm =
        toolRole ??
        (await callStructured({
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
          model:
            role === "publisher_qa"
              ? (process.env.MICROSITE_MODEL ?? "gpt-5.6-sol")
              : undefined,
        }));

      if (role === "publisher_qa") {
        const page = (llm.data as any)?.customPage;
        const normalized = [...context.artifacts]
          .reverse()
          .find((artifact: any) => artifact.kind === "normalized_menu")?.data;
        const expectedIds = (normalized?.sections ?? [])
          .flatMap((section: any) =>
            (section.items ?? []).map((item: any) => String(item.id)),
          )
          .sort();
        const manifestIds = [...(page?.contentManifest?.menuItemIds ?? [])]
          .map(String)
          .sort();
        const forbidden =
          /<\s*(script|iframe|object|embed|form)\b|\son\w+\s*=|javascript\s*:|@import/i.test(
            `${page?.html ?? ""}\n${page?.css ?? ""}`,
          );
        const occurrencesValid = expectedIds.every(
          (id: string) =>
            (
              (page?.html ?? "").match(
                new RegExp(
                  `data-menu-item-id=["']${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
                  "g",
                ),
              ) ?? []
            ).length === 1,
        );
        if (
          !page ||
          forbidden ||
          JSON.stringify(expectedIds) !== JSON.stringify(manifestIds) ||
          !occurrencesValid
        ) {
          throw new Error(
            "Custom microsite failed safety or menu-completeness validation",
          );
        }
      }

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
