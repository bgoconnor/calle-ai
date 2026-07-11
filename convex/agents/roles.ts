import { bilingual } from "./llm";
import { BUSINESS_RESEARCH_SCHEMA } from "./businessResearchContract";

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

const sourceEvidence = {
  type: "object",
  additionalProperties: false,
  required: ["title", "url", "sourceType", "authority", "snippet"],
  properties: {
    title: { type: "string" },
    url: { type: "string" },
    sourceType: {
      type: "string",
      enum: ["official_menu", "official_website", "official_ordering", "owner_asset", "third_party"],
    },
    authority: { type: "number" },
    snippet: { type: "string" },
  },
};

const testimonial = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["quote", "authorDisplayName", "sourceName", "sourceUrl", "publishedAt"],
      properties: {
        quote: { type: "string" },
        authorDisplayName: { type: ["string", "null"] },
        sourceName: { type: "string" },
        sourceUrl: { type: "string" },
        publishedAt: { type: ["string", "null"] },
      },
    },
    { type: "null" },
  ],
};

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
    name: "Business Research Specialist",
    artifactKind: "business_facts",
    outputName: "business_facts",
    usesVision: true,
    system:
      "Research the exact business with live evidence. Rank first-party sources above directories, " +
      "retain fact-level provenance, report conflicts and missing facts, and never invent unsupported claims.",
    outputSchema: BUSINESS_RESEARCH_SCHEMA,
    buildUser: (a) =>
      `Extract canonical facts for this business.\n\n${context(a)}`,
  },

  menu_discovery: {
    name: "Menu Discovery Specialist",
    artifactKind: "menu_sources",
    outputName: "menu_sources",
    system:
      "You use live Linkup results to identify the most authoritative and complete menu sources. " +
      "Prefer the restaurant's official menu, website, or ordering provider. Search ranking is not authority. " +
      "Use explicit update dates and recent menu photography to break conflicts, choosing one canonical source confidently. " +
      "Older evidence remains useful as a conflict record but must not block shipping. Editorial articles are context only. " +
      "Do not invent URLs, menu items, freshness, or source content. Preserve evidence verbatim and never request approval.",
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["sources", "selectedSourceUrls", "canonicalSourceUrl", "recencyRationale", "status", "searchesRun", "searchEvidence"],
      properties: {
        sources: { type: "array", items: sourceEvidence },
        selectedSourceUrls: { type: "array", items: { type: "string" } },
        canonicalSourceUrl: { type: ["string", "null"] },
        recencyRationale: { type: "string" },
        status: {
          type: "string",
          enum: ["authoritative_menu_found", "partial_sources_found", "third_party_only", "not_found"],
        },
        searchesRun: { type: "number" },
        searchEvidence: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["query", "answer"],
            properties: { query: { type: "string" }, answer: { type: "string" } },
          },
        },
      },
    },
    buildUser: (a) => `Select authoritative menu sources from live search evidence.\n\n${context(a)}`,
  },

  menu_normalization: {
    name: "Menu Normalization Specialist",
    artifactKind: "normalized_menu",
    outputName: "normalized_menu",
    usesVision: true,
    system:
      "Build the most comprehensive menu supported by the discovered sources and owner assets. " +
      "Preserve original-language names, descriptions, and prices exactly. Give every section and item a stable " +
      "lowercase kebab-case id. Inspect every supplied image and every distinct page or collage region; merge multi-image menus. " +
      "When evidence conflicts, use the discovery artifact's canonical, freshest credible source and record the older value in conflicts. " +
      "Make an executive decision and continue toward shipping; needsReview records uncertainty but is not an approval gate. " +
      "Reconcile duplicates and never invent missing items or prices.",
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["sections", "conflicts", "likelyComplete", "completenessReason", "canonicalSourceUrl"],
      properties: {
        sections: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "originalName", "items"],
            properties: {
              id: { type: "string" },
              originalName: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "originalName", "originalDescription", "price", "aliases", "sourceUrls", "confidence", "needsReview"],
                  properties: {
                    id: { type: "string" },
                    originalName: { type: "string" },
                    originalDescription: { type: ["string", "null"] },
                    price: { type: ["string", "null"] },
                    aliases: { type: "array", items: { type: "string" } },
                    sourceUrls: { type: "array", items: { type: "string" } },
                    confidence: { type: "number" },
                    needsReview: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
        conflicts: { type: "array", items: { type: "string" } },
        canonicalSourceUrl: { type: ["string", "null"] },
        likelyComplete: { type: "boolean" },
        completenessReason: { type: "string" },
      },
    },
    buildUser: (a) => `Normalize the full discovered menu.\n\n${context(a)}`,
  },

  menu_testimonials: {
    name: "Menu Testimonial Specialist",
    artifactKind: "menu_testimonials",
    outputName: "menu_testimonials",
    system:
      "Find short, compelling, attributable direct review quotations for distinct normalized menu items. " +
      "A quote must appear verbatim in the supplied Linkup evidence, match one current item unambiguously, " +
      "and retain its source URL. Never compose, repair, translate, or merge quotations.",
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["highlights", "searchesRun", "stopReason", "searchEvidence"],
      properties: {
        highlights: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["menuItemId", "quote", "authorDisplayName", "sourceName", "sourceUrl", "publishedAt", "confidence"],
            properties: {
              menuItemId: { type: "string" },
              quote: { type: "string" },
              authorDisplayName: { type: ["string", "null"] },
              sourceName: { type: "string" },
              sourceUrl: { type: "string" },
              publishedAt: { type: ["string", "null"] },
              confidence: { type: "number" },
            },
          },
        },
        searchesRun: { type: "number" },
        stopReason: { type: "string", enum: ["target_reached", "candidates_exhausted", "search_budget_reached"] },
        searchEvidence: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["menuItemId", "query", "answer", "sources"],
            properties: {
              menuItemId: { type: "string" },
              query: { type: "string" },
              answer: { type: "string" },
              sources: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "url", "snippet"],
                  properties: { title: { type: "string" }, url: { type: "string" }, snippet: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
    buildUser: (a) => `Select only verified direct testimonials from live review evidence.\n\n${context(a)}`,
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
      "You localize a normalized menu bidirectionally. Detect the source language per field. " +
      "If it is Spanish, preserve it verbatim and generate English; if it is English, preserve it " +
      "verbatim and generate Spanish. For mixed menus, decide per field. Preserve culturally distinctive " +
      "dish names in both languages, do not translate prices, and never invent a missing description.",
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
            required: ["menuItemId", "name", "description", "sourceLanguage", "generatedLanguage", "translationNote"],
            properties: {
              menuItemId: { type: "string" },
              name: bilingual,
              description: { anyOf: [bilingual, { type: "null" }] },
              sourceLanguage: { type: "string", enum: ["es", "en", "mixed", "unknown"] },
              generatedLanguage: { type: ["string", "null"], enum: ["es", "en", null] },
              translationNote: { type: ["string", "null"] },
            },
          },
        },
      },
    },
    buildUser: (a) =>
      `Fill the other language for every normalized menu item while preserving source text.\n\n${context(a)}`,
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

  // Canonical output contract: src/public/types.ts. Keep this schema and the
  // renderer type synchronized; public pages render artifact.data directly.
  publisher_qa: {
    name: "Publisher & QA Specialist",
    artifactKind: "microsite",
    outputName: "microsite",
    system:
      "You compose the approved specialist outputs into a bilingual public microsite. " +
      "Render EVERY supported normalized menu item, joining localized fields and sparse testimonials by stable item id. " +
      "Use ONLY facts/prices present in prior artifacts and only exact testimonial quotes with source URLs. " +
      "Never introduce new prices, claims, or quotes. Validate both languages and the comprehensive menu.",
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["slug", "kind", "theme", "business", "hero", "story", "sections", "guide", "faqs", "conceptLabel"],
      properties: {
        slug: { type: "string" },
        kind: { type: "string", enum: ["restaurant", "salon"] },
        theme: { type: "string", enum: ["yucatasia", "chelys"] },
        business: {
          type: "object",
          additionalProperties: false,
          required: ["name", "eyebrow", "contact"],
          properties: {
            name: { type: "string" },
            eyebrow: bilingual,
            contact: {
              type: "object",
              additionalProperties: false,
              required: ["address", "city", "phone", "mapsUrl", "hours"],
              properties: {
                address: { type: "string" }, city: { type: "string" }, phone: { type: "string" }, mapsUrl: { type: "string" },
                hours: { type: "array", items: { type: "object", additionalProperties: false, required: ["days", "hours"], properties: { days: bilingual, hours: { type: "string" } } } },
              },
            },
          },
        },
        hero: {
          type: "object",
          additionalProperties: false,
          required: ["title", "subtitle", "cta", "image"],
          properties: {
            title: bilingual, subtitle: bilingual, cta: bilingual, image: { type: "string" },
          },
        },
        story: bilingual,
        sections: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "title", "items"],
            properties: { id: { type: "string" }, title: bilingual, items: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "name", "description", "price", "note", "tag", "testimonial"], properties: { id: { type: "string" }, name: bilingual, description: bilingual, price: { type: ["string", "null"] }, note: { anyOf: [bilingual, { type: "null" }] }, tag: { anyOf: [bilingual, { type: "null" }] }, testimonial } } } },
          },
        },
        guide: { anyOf: [{ type: "object", additionalProperties: false, required: ["title", "body", "picks"], properties: { title: bilingual, body: bilingual, picks: { type: "array", items: { type: "string" } } } }, { type: "null" }] },
        faqs: { type: "array", items: { type: "object", additionalProperties: false, required: ["question", "answer"], properties: { question: bilingual, answer: bilingual } } },
        conceptLabel: { type: "string" },
      },
    },
    buildUser: (a) =>
      `Compose the bilingual microsite from the approved artifacts. slug must be "${a.business?.slug}".\n\n${context(a)}`,
  },

  gbp_pack: {
    name: "Google Business Profile Pack",
    artifactKind: "gbp_pack",
    outputName: "gbp_pack",
    system:
      "You produce a Google Business Profile improvement pack from the approved artifacts: " +
      "a bilingual business description, a primary category, additional categories, attributes, " +
      "recommended posts (bilingual), photo recommendations, and listing gaps to fix. Use ONLY " +
      "facts supported by the prior artifacts — never invent hours, prices, or attributes.",
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "businessDescription",
        "primaryCategory",
        "additionalCategories",
        "attributes",
        "recommendedPosts",
        "photoRecommendations",
        "listingGaps",
      ],
      properties: {
        businessDescription: bilingual,
        primaryCategory: { type: "string" },
        additionalCategories: { type: "array", items: { type: "string" } },
        attributes: { type: "array", items: { type: "string" } },
        recommendedPosts: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "body"],
            properties: { title: { type: "string" }, body: bilingual },
          },
        },
        photoRecommendations: { type: "array", items: { type: "string" } },
        listingGaps: { type: "array", items: { type: "string" } },
      },
    },
    buildUser: (a) =>
      `Produce the Google Business Profile improvement pack.\n\n${context(a)}`,
  },

  delivery_report: {
    name: "Delivery Report",
    artifactKind: "delivery_report",
    outputName: "delivery_report",
    system:
      "You are the agency producing a delivery report for the operator. Summarize what was " +
      "delivered, give per-item confidence flags, and list open issues — grounded ONLY in the " +
      "artifacts actually produced this run. Do not overclaim or invent published URLs.",
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "deliverables", "confidenceFlags", "openIssues"],
      properties: {
        summary: { type: "string" },
        deliverables: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "status", "note"],
            properties: {
              name: { type: "string" },
              status: { type: "string" },
              note: { type: "string" },
            },
          },
        },
        confidenceFlags: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["item", "confidence", "note"],
            properties: {
              item: { type: "string" },
              confidence: { type: "number" },
              note: { type: "string" },
            },
          },
        },
        openIssues: { type: "array", items: { type: "string" } },
      },
    },
    buildUser: (a) =>
      `Write the agency delivery report for this run.\n\n${context(a)}`,
  },
};

// The Manager dynamically plans the CONTENT roles below; the orchestrator always
// appends the fixed publishing tail (publisher_qa → gbp_pack → delivery_report)
// so every completed job produces all four deliverables in a reliable order.
export const CONTENT_ROLES = [
  "intake",
  "menu_discovery",
  "menu_normalization",
  "localization",
  "menu_testimonials",
];
export const PUBLISH_TAIL = ["publisher_qa", "gbp_pack", "delivery_report"];
