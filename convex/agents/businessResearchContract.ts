export type BusinessResearchSourceType =
  | "official_website"
  | "official_social"
  | "google_business_profile"
  | "government_or_registry"
  | "booking_or_ordering"
  | "reputable_directory"
  | "review_platform"
  | "unknown";

export type BusinessResearchFact = {
  key: string;
  value: string | null;
  confidence: number;
  status: "verified" | "low_confidence" | "conflicted" | "missing";
  sourceUrls: string[];
  rationale: string;
};

export type BusinessResearchOutput = {
  canonicalFacts: {
    name: string;
    category: string | null;
    address: string | null;
    phone: string | null;
    hours: string | null;
    website: string | null;
    socialProfiles: string[];
    languages: string[];
    summary: string | null;
  };
  facts: BusinessResearchFact[];
  sources: Array<{
    title: string;
    url: string;
    snippet: string;
    sourceType: BusinessResearchSourceType;
    authority: number;
    authorityReason: string;
    retrievedAt: string;
  }>;
  conflicts: Array<{
    factKey: string;
    competingValues: Array<{ value: string; sourceUrls: string[] }>;
    resolution: string;
  }>;
  missingFacts: Array<{
    key: string;
    reason: string;
    priority: "required" | "recommended" | "optional";
  }>;
  handoff: {
    menuResearchQueries: string[];
    micrositeSafeClaims: string[];
    doNotPublishClaims: string[];
  };
  searchesRun: number;
};

const nullableString = { type: ["string", "null"] } as const;

export const BUSINESS_RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["canonicalFacts", "facts", "sources", "conflicts", "missingFacts", "handoff", "searchesRun"],
  properties: {
    canonicalFacts: {
      type: "object",
      additionalProperties: false,
      required: ["name", "category", "address", "phone", "hours", "website", "socialProfiles", "languages", "summary"],
      properties: {
        name: { type: "string" },
        category: nullableString,
        address: nullableString,
        phone: nullableString,
        hours: nullableString,
        website: nullableString,
        socialProfiles: { type: "array", items: { type: "string" } },
        languages: { type: "array", items: { type: "string" } },
        summary: nullableString,
      },
    },
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "value", "confidence", "status", "sourceUrls", "rationale"],
        properties: {
          key: { type: "string" },
          value: nullableString,
          confidence: { type: "number" },
          status: { type: "string", enum: ["verified", "low_confidence", "conflicted", "missing"] },
          sourceUrls: { type: "array", items: { type: "string" } },
          rationale: { type: "string" },
        },
      },
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "url", "snippet", "sourceType", "authority", "authorityReason", "retrievedAt"],
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          snippet: { type: "string" },
          sourceType: {
            type: "string",
            enum: ["official_website", "official_social", "google_business_profile", "government_or_registry", "booking_or_ordering", "reputable_directory", "review_platform", "unknown"],
          },
          authority: { type: "number" },
          authorityReason: { type: "string" },
          retrievedAt: { type: "string" },
        },
      },
    },
    conflicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["factKey", "competingValues", "resolution"],
        properties: {
          factKey: { type: "string" },
          competingValues: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["value", "sourceUrls"],
              properties: {
                value: { type: "string" },
                sourceUrls: { type: "array", items: { type: "string" } },
              },
            },
          },
          resolution: { type: "string" },
        },
      },
    },
    missingFacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "reason", "priority"],
        properties: {
          key: { type: "string" },
          reason: { type: "string" },
          priority: { type: "string", enum: ["required", "recommended", "optional"] },
        },
      },
    },
    handoff: {
      type: "object",
      additionalProperties: false,
      required: ["menuResearchQueries", "micrositeSafeClaims", "doNotPublishClaims"],
      properties: {
        menuResearchQueries: { type: "array", items: { type: "string" } },
        micrositeSafeClaims: { type: "array", items: { type: "string" } },
        doNotPublishClaims: { type: "array", items: { type: "string" } },
      },
    },
    searchesRun: { type: "number" },
  },
} as const;
