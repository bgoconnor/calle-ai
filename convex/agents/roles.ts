import { bilingual } from "./llm";

// The specialist roster as DATA. The generic executor (specialist.ts) runs any
// of these; the orchestrator/manager just names roles. Adding a role here (or,
// later, a manager-spawned ephemeral role) needs no new execution code.

export interface RoleDef {
  name: string;
  artifactKind: string; // artifact kind this role produces
  outputName: string; // json_schema name
  outputSchema: Record<string, unknown>;
  system: string;
  usesVision?: boolean; // pass menu/service photos to the model
  stub?: boolean; // executor writes a placeholder instead of calling the model
  buildUser: (args: {
    business: any;
    policies: { key: string; value: string; scope: string }[];
    priorArtifacts: { kind: string; data: unknown }[];
    revisionNote?: string;
  }) => string;
}

// Shared prompt block so every specialist sees the business + policy + handoffs.
function context(args: {
  business: any;
  policies: { key: string; value: string; scope: string }[];
  priorArtifacts: { kind: string; data: unknown }[];
  revisionNote?: string;
}): string {
  const parts = [
    `BUSINESS:\n${JSON.stringify(args.business, null, 2)}`,
    `POLICIES (agency + business standards you MUST follow):\n${JSON.stringify(args.policies, null, 2)}`,
    `PRIOR ARTIFACTS (outputs from earlier specialists — use these, do not re-derive):\n${JSON.stringify(args.priorArtifacts, null, 2)}`,
  ];
  if (args.revisionNote) {
    parts.push(
      `REVISION REQUESTED BY MANAGER — fix this specifically:\n${args.revisionNote}`,
    );
  }
  return parts.join("\n\n");
}

export const ROLES: Record<string, RoleDef> = {
  intake: {
    name: "Intake & Evidence Specialist",
    artifactKind: "business_facts",
    outputName: "business_facts",
    usesVision: true,
    system:
      "You are an intake & evidence specialist for a local-business agency. " +
      "From the provided sources (business record, maps info, photos, operator brief), " +
      "produce canonical business facts, a source inventory, a list of missing data, " +
      "and a per-fact confidence score (0-1). Never invent facts you cannot support; " +
      "mark anything uncertain in missingData.",
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["canonicalFacts", "sourceInventory", "missingData", "factConfidence"],
      properties: {
        canonicalFacts: {
          type: "object",
          additionalProperties: false,
          required: ["name", "category", "address", "phone", "hours", "summary"],
          properties: {
            name: { type: "string" },
            category: { type: "string" },
            address: { type: ["string", "null"] },
            phone: { type: ["string", "null"] },
            hours: { type: ["string", "null"] },
            summary: { type: "string" },
          },
        },
        sourceInventory: { type: "array", items: { type: "string" } },
        missingData: { type: "array", items: { type: "string" } },
        factConfidence: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["fact", "confidence"],
            properties: {
              fact: { type: "string" },
              confidence: { type: "number" },
            },
          },
        },
      },
    },
    buildUser: (a) =>
      `Extract canonical facts for this business.\n\n${context(a)}`,
  },

  menu_structuring: {
    name: "Menu Structuring Specialist",
    artifactKind: "menu_catalog",
    outputName: "menu_catalog",
    usesVision: true,
    system:
      "You convert messy menu or service-list images/text into structured items. " +
      "For each item capture the ORIGINAL-language title, category, price (as written, " +
      "or null if not shown), modifiers, and dietary info ONLY when explicitly supported. " +
      "Never invent prices or dietary claims. Give each item a confidence (0-1).",
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["items"],
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["originalTitle", "category", "price", "modifiers", "dietary", "confidence"],
            properties: {
              originalTitle: { type: "string" },
              category: { type: "string" },
              price: { type: ["string", "null"] },
              modifiers: { type: "array", items: { type: "string" } },
              dietary: { type: "array", items: { type: "string" } },
              confidence: { type: "number" },
            },
          },
        },
      },
    },
    buildUser: (a) =>
      `Structure every menu/service item from the sources.\n\n${context(a)}`,
  },

  localization: {
    name: "Cultural Localization Specialist",
    artifactKind: "bilingual_content",
    outputName: "bilingual_content",
    system:
      "You produce Spanish-first bilingual content. PRESERVE the original Spanish " +
      "dish/service name exactly — never replace it with a literal English translation. " +
      "Add a concise English explanation and, for unfamiliar regional items, cultural " +
      "context. Explain notable translation choices. Example: 'Relleno Negro — Traditional " +
      "Yucatán turkey stew flavored with roasted chiles, served with a pork-and-egg filling.'",
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["items"],
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["originalName", "englishExplanation", "culturalContext", "translationNote"],
            properties: {
              originalName: { type: "string" },
              englishExplanation: { type: "string" },
              culturalContext: { type: ["string", "null"] },
              translationNote: { type: ["string", "null"] },
            },
          },
        },
      },
    },
    buildUser: (a) =>
      `Produce bilingual content for the structured catalog, preserving original names.\n\n${context(a)}`,
  },

  discovery: {
    name: "Local Discovery Research Specialist",
    artifactKind: "research",
    outputName: "research",
    stub: true, // TODO: wire real Linkup live search; must cite every claim
    system:
      "You gather live, cited local-discovery research (regional cuisine/service context, " +
      "customer-facing explanations, listing gap analysis). EVERY external claim must carry " +
      "a real source URL. Distinguish research from verified business facts.",
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["findings", "listingGaps"],
      properties: {
        findings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["statement", "sourceUrl", "sourceTitle"],
            properties: {
              statement: { type: "string" },
              sourceUrl: { type: "string" },
              sourceTitle: { type: "string" },
            },
          },
        },
        listingGaps: { type: "array", items: { type: "string" } },
      },
    },
    buildUser: (a) => `Research local-discovery context.\n\n${context(a)}`,
  },

  // NOTE: microsite shape below is PROVISIONAL — it's the render contract with
  // Engineer 2's Cloudflare Worker and needs his sign-off before it's final.
  publisher_qa: {
    name: "Publisher & QA Specialist",
    artifactKind: "microsite",
    outputName: "microsite",
    system:
      "You compose the approved specialist outputs into a bilingual public microsite. " +
      "Spanish-first with English alongside. Use ONLY facts/prices present in the prior " +
      "artifacts — never introduce new prices or claims. Validate that required sections " +
      "exist and both languages are present.",
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["slug", "businessName", "tagline", "hero", "sections", "menu", "contact", "languages"],
      properties: {
        slug: { type: "string" },
        businessName: { type: "string" },
        tagline: bilingual,
        hero: {
          type: "object",
          additionalProperties: false,
          required: ["headline", "subhead", "imageUrl"],
          properties: {
            headline: bilingual,
            subhead: bilingual,
            imageUrl: { type: ["string", "null"] },
          },
        },
        sections: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "body"],
            properties: { title: bilingual, body: bilingual },
          },
        },
        menu: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "description", "price", "category"],
            properties: {
              name: { type: "string" }, // original-language name preserved
              description: bilingual,
              price: { type: ["string", "null"] },
              category: { type: "string" },
            },
          },
        },
        contact: {
          type: "object",
          additionalProperties: false,
          required: ["address", "phone", "hours"],
          properties: {
            address: { type: ["string", "null"] },
            phone: { type: ["string", "null"] },
            hours: { type: ["string", "null"] },
          },
        },
        languages: { type: "array", items: { type: "string" } },
      },
    },
    buildUser: (a) =>
      `Compose the bilingual microsite from the approved artifacts. slug must be "${a.business?.slug}".\n\n${context(a)}`,
  },
};

// Default fixed sequence (walking skeleton). The Manager will replace this with
// a per-job dynamic plan next.
export const DEFAULT_SEQUENCE = [
  "intake",
  "menu_structuring",
  "localization",
  "discovery",
  "publisher_qa",
];
