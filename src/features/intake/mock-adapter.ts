import type { BriefInput, StructuredBrief } from "../../lib/agency-contract";
import type { IntakeAdapter, LaunchResult } from "./types";

const id = () => `demo-${Math.random().toString(36).slice(2, 10)}`;

function inferBrief(input: BriefInput): StructuredBrief {
  const text = `${input.brief} ${input.businessName}`.toLowerCase();
  const salon = /salon|beauty|pestañ|cejas|hair|barber/.test(text);
  return {
    objective: salon ? "Create a bilingual salon microsite and service guide" : "Create a bilingual local-business microsite and menu guide",
    business: { name: input.businessName || "Business to confirm", city: input.city || "Location to confirm", category: input.category || (salon ? "Beauty salon" : "Restaurant") },
    languages: { primary: input.primaryLanguage || "es", secondary: input.secondaryLanguage || "en" },
    deliverables: salon ? ["Bilingual microsite", "Structured service catalog", "Google listing improvement pack"] : ["Bilingual microsite", "Structured menu", "Google listing improvement pack"],
    guardrails: ["Preserve original Spanish names", "Do not invent prices or business facts", "Escalate unclear information for review"],
    sourceStrategy: input.sourceUrls?.length ? ["Operator-provided links", "Uploaded assets", "Public source verification"] : ["Public source verification", "Uploaded assets when supplied"],
  };
}

export function createMockIntakeAdapter(): IntakeAdapter {
  return {
    async createDraft(input) {
      await new Promise((resolve) => setTimeout(resolve, 450));
      return { jobId: id(), structuredBrief: inferBrief(input) };
    },
    async updateDraft() { await new Promise((resolve) => setTimeout(resolve, 180)); },
    async launch(jobId): Promise<LaunchResult> { await new Promise((resolve) => setTimeout(resolve, 500)); return { jobId }; },
  };
}
