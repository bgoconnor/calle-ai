import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { ROLES, CONTENT_ROLES } from "./roles";
import { callStructured } from "./llm";
import { callTool } from "../tools";

// The Agency Manager. Dynamically plans the CONTENT phase per job (so a
// restaurant and a salon get different plans), and reviews each artifact before
// it proceeds — requesting a revision when it misses the bar.

const ROLE_BLURBS: Record<string, string> = {
  intake:
    "Extracts canonical business facts + confidence + missing data from the sources.",
  menu_structuring:
    "Structures menu/service items from photos/text (original titles, prices, modifiers).",
  localization:
    "Produces Spanish-first bilingual content, preserving original names + cultural context.",
  discovery:
    "Live, cited local-discovery research + listing-gap analysis (Linkup).",
};

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rationale", "steps"],
  properties: {
    rationale: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "purpose", "inputKinds"],
        properties: {
          role: { type: "string", enum: CONTENT_ROLES },
          purpose: { type: "string" },
          inputKinds: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

type PlanStep = { role: string; purpose: string; inputKinds: string[] };

// Plan the content phase. Returns ordered content steps; the orchestrator
// appends the fixed publishing tail.
export const planJob = internalAction({
  args: { jobId: v.id("jobs") },
  handler: async (
    ctx,
    { jobId },
  ): Promise<{ rationale: string; steps: PlanStep[] }> => {
    const context = await ctx.runQuery(internal.agents.helpers.getJobContext, {
      jobId,
    });
    const roster = CONTENT_ROLES.map((r) => `- ${r}: ${ROLE_BLURBS[r]}`).join(
      "\n",
    );
    const assets =
      context.assets.map((a) => `${a.kind}${a.url ? " (url)" : ""}`).join(", ") ||
      "none";

    const system =
      "You are the Agency Manager of an AI local-presence agency. Plan the CONTENT phase " +
      "for THIS job by choosing and ordering roles from the roster. Tailor each step's purpose " +
      "to the business type and available assets. Include only roles that add value — e.g. skip " +
      "discovery if there's nothing to research. Different business types and asset sets should " +
      "produce different plans. (Publishing steps are added automatically afterward.)";
    const user =
      `AVAILABLE CONTENT SPECIALISTS:\n${roster}\n\n` +
      `BUSINESS:\n${JSON.stringify(context.business, null, 2)}\n\n` +
      `REQUIRED DELIVERABLES: ${context.job.requiredDeliverables.join(", ")}\n` +
      `ATTACHED ASSETS: ${assets}\n` +
      `GUARDRAILS: ${context.job.guardrails ?? "none"}\n\n` +
      `Produce an ordered content plan with a short rationale.`;

    const llm = await callStructured<{ rationale: string; steps: PlanStep[] }>({
      system,
      user,
      schemaName: "agency_plan",
      schema: PLAN_SCHEMA,
    });

    const steps = llm.data.steps.filter((s) => CONTENT_ROLES.includes(s.role));

    await callTool(ctx, "trace.emit", {
      jobId,
      role: "Agency Manager",
      phase: "plan",
      summary: `Planned content phase (${steps.length}): ${steps.map((s) => s.role).join(" → ")}`,
      output: { rationale: llm.data.rationale, steps },
      model: llm.model,
      promptTokens: llm.promptTokens,
      completionTokens: llm.completionTokens,
    });

    return { rationale: llm.data.rationale, steps };
  },
});

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["approved", "reason", "revisionInstruction"],
  properties: {
    approved: { type: "boolean" },
    reason: { type: "string" },
    revisionInstruction: { type: ["string", "null"] },
  },
};

type Review = {
  approved: boolean;
  reason: string;
  revisionInstruction: string | null;
};

// Review one artifact against the policies + hard rules. Returns a verdict; the
// orchestrator triggers a single revision when not approved.
export const reviewArtifact = internalAction({
  args: {
    jobId: v.id("jobs"),
    taskId: v.id("tasks"),
    artifactId: v.id("artifacts"),
    role: v.string(),
  },
  handler: async (ctx, { jobId, taskId, artifactId, role }): Promise<Review> => {
    const context = await ctx.runQuery(internal.agents.helpers.getJobContext, {
      jobId,
    });
    const artifact = context.artifacts.find((a) => a._id === artifactId);
    const roleDef = ROLES[role];

    const system =
      "You are the Agency Manager reviewing a specialist's artifact before it proceeds. " +
      "Check it against the agency/business policies and these hard rules: no fabricated prices; " +
      "original-language names preserved; research claims carry citations; required fields present; " +
      "both languages present where applicable. Approve if it clears the bar; otherwise set " +
      "approved=false with a specific, actionable revisionInstruction.";
    const user =
      `SPECIALIST ROLE: ${roleDef?.name ?? role}\n\n` +
      `POLICIES:\n${JSON.stringify(context.policies, null, 2)}\n\n` +
      `ARTIFACT (${artifact?.kind}):\n${JSON.stringify(artifact?.data, null, 2)}`;

    const llm = await callStructured<Review>({
      system,
      user,
      schemaName: "artifact_review",
      schema: REVIEW_SCHEMA,
    });

    await callTool(ctx, "trace.emit", {
      jobId,
      taskId,
      parentRole: "Agency Manager",
      role: "Agency Manager",
      phase: "review",
      summary: `Review of ${artifact?.kind}: ${llm.data.approved ? "approved" : "revision requested"} — ${llm.data.reason}`,
      output: llm.data,
      model: llm.model,
      promptTokens: llm.promptTokens,
      completionTokens: llm.completionTokens,
    });

    return llm.data;
  },
});
