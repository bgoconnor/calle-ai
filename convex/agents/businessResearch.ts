import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  callTool,
  type CitationToPersist,
  type LinkupSearchOutput,
} from "../tools";
import { callStructured } from "./llm";
import {
  BUSINESS_RESEARCH_SCHEMA,
  type BusinessResearchOutput,
  type BusinessResearchSourceType,
} from "./businessResearchContract";

type ResearchContext = {
  business: {
    name?: string;
    type?: string;
    address?: string;
    mapsUrl?: string;
    languages?: string[];
    notes?: string;
  } | null;
  artifacts: Array<{ kind: string; data: unknown }>;
};

type BusinessResearchResult = {
  data: BusinessResearchOutput;
  citations: CitationToPersist[];
  model: string;
  promptTokens?: number;
  completionTokens?: number;
};

type RankedSource = LinkupSearchOutput["results"][number] & {
  sourceType: BusinessResearchSourceType;
  authority: number;
  authorityReason: string;
  retrievedAt: string;
};

const MAX_SEARCHES = 5;
const MAX_RESULTS_PER_SEARCH = 8;
const ROLE = "Business Research Specialist";

const PLATFORM_RULES: Array<{
  hosts: string[];
  type: BusinessResearchSourceType;
  authority: number;
  reason: string;
}> = [
  {
    hosts: ["google.com", "maps.google.com", "goo.gl"],
    type: "google_business_profile",
    authority: 0.82,
    reason:
      "Major business-listing profile; useful but may be user-edited or stale.",
  },
  {
    hosts: ["instagram.com", "facebook.com", "tiktok.com"],
    type: "official_social",
    authority: 0.76,
    reason:
      "Potential owner-controlled social profile; identity must match the business.",
  },
  {
    hosts: [
      "square.site",
      "squareup.com",
      "toasttab.com",
      "clover.com",
      "doordash.com",
      "ubereats.com",
      "grubhub.com",
      "resy.com",
      "opentable.com",
      "vagaro.com",
      "booksy.com",
    ],
    type: "booking_or_ordering",
    authority: 0.78,
    reason:
      "Transactional provider likely maintained by the business, though details can lag.",
  },
  {
    hosts: ["yelp.com", "tripadvisor.com"],
    type: "review_platform",
    authority: 0.5,
    reason:
      "Third-party review platform; corroboration only, never decisive over owner evidence.",
  },
  {
    hosts: ["yellowpages.com", "mapquest.com", "foursquare.com"],
    type: "reputable_directory",
    authority: 0.42,
    reason: "Third-party directory that may aggregate stale data.",
  },
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function matchesHost(host: string, candidate: string): boolean {
  return host === candidate || host.endsWith(`.${candidate}`);
}

function identityTokens(name: string | undefined): string[] {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length >= 4);
}

function rankSource(
  source: LinkupSearchOutput["results"][number],
  retrievedAt: string,
  businessName: string | undefined,
): RankedSource {
  const host = hostOf(source.url);
  for (const rule of PLATFORM_RULES) {
    if (rule.hosts.some((candidate) => matchesHost(host, candidate))) {
      return {
        ...source,
        sourceType: rule.type,
        authority: rule.authority,
        authorityReason: rule.reason,
        retrievedAt,
      };
    }
  }
  if (host.endsWith(".gov")) {
    return {
      ...source,
      sourceType: "government_or_registry",
      authority: 0.9,
      authorityReason: "Government or public-registry source.",
      retrievedAt,
    };
  }
  const identityMatch = identityTokens(businessName).some(
    (token) =>
      host.includes(token) || source.title.toLowerCase().includes(token),
  );
  return {
    ...source,
    sourceType: identityMatch ? "official_website" : "unknown",
    authority: identityMatch ? 0.86 : host ? 0.35 : 0.2,
    authorityReason: identityMatch
      ? "Independent domain whose host or title matches the business name; location still must match."
      : host
        ? "Independent domain without a deterministic business-name match; treat as unverified."
        : "Invalid or missing source URL.",
    retrievedAt,
  };
}

function businessDescriptor(context: ResearchContext): string {
  const business = context.business;
  const prompt = context.artifacts.find((artifact) => artifact.kind === "brief")
    ?.data as { prompt?: unknown } | undefined;
  const placeholder = /^(business pending research|research from brief)$/i.test(
    business?.name?.trim() ?? "",
  );
  const identity =
    placeholder && typeof prompt?.prompt === "string"
      ? prompt.prompt.trim()
      : business?.name;
  return [identity, business?.type, business?.address]
    .filter(Boolean)
    .join(", ");
}

type SearchPattern = {
  name: string;
  query: string;
  depth: "fast" | "standard";
  outputType: "searchResults" | "sourcedAnswer";
  includeDomains?: string[];
};

function buildQueries(context: ResearchContext): SearchPattern[] {
  const descriptor = businessDescriptor(context);
  const exactName = descriptor.split(",")[0]?.trim() || descriptor;
  const address = context.business?.address?.trim() ?? "";
  const suppliedUrls = [
    context.business?.mapsUrl,
    ...context.artifacts.flatMap((artifact) => {
      const data = artifact.data as { sourceUrls?: unknown } | null;
      return Array.isArray(data?.sourceUrls)
        ? data.sourceUrls.filter(
            (url): url is string => typeof url === "string",
          )
        : [];
    }),
  ].filter(
    (url): url is string => typeof url === "string" && /^https?:\/\//.test(url),
  );
  const patterns: SearchPattern[] = [
    {
      name: "exact_keyword",
      query: `"${exactName}" "${address}"`,
      depth: "fast",
      outputType: "searchResults",
    },
    ...(suppliedUrls[0]
      ? [
          {
            name: "supplied_url",
            query: `${suppliedUrls[0]}\nScrape this page and return exact business identity, address, phone, hours, official links, and visible service or menu links.`,
            depth: "standard" as const,
            outputType: "searchResults" as const,
          },
        ]
      : []),
    {
      name: "identity_and_official_domain",
      query: `Find the exact business ${descriptor}. Retrieve its official homepage, contact page, and Google Business Profile. Extract only identity, address, phone, and official domain evidence. Exclude similarly named businesses.`,
      depth: "standard",
      outputType: "searchResults",
    },
    {
      name: "owner_social_and_booking",
      query: `Find owner-controlled profiles for ${descriptor}. Match the address or phone before returning Instagram, Facebook, TikTok, booking, or ordering pages.`,
      depth: "standard",
      outputType: "searchResults",
      includeDomains: [
        "instagram.com",
        "facebook.com",
        "tiktok.com",
        "vagaro.com",
        "booksy.com",
        "square.site",
        "toasttab.com",
        "clover.com",
        "opentable.com",
      ],
    },
    {
      name: "conflict_crosscheck",
      query: `Cross-check ${descriptor} for conflicting address, phone, hours, website, and closure status. Return the exact competing values and their URLs; do not reconcile them.`,
      depth: "standard",
      outputType: "sourcedAnswer",
    },
  ];
  return patterns.slice(0, MAX_SEARCHES);
}

function uniqueRankedSources(
  searches: LinkupSearchOutput[],
  businessName: string | undefined,
): RankedSource[] {
  const byUrl = new Map<string, RankedSource>();
  for (const search of searches) {
    for (const result of search.results.slice(0, MAX_RESULTS_PER_SEARCH)) {
      if (!result.url || !hostOf(result.url)) continue;
      const ranked = rankSource(result, search.retrievedAt, businessName);
      const existing = byUrl.get(result.url);
      if (!existing || ranked.snippet.length > existing.snippet.length)
        byUrl.set(result.url, ranked);
    }
  }
  return [...byUrl.values()].sort((a, b) => b.authority - a.authority);
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function sanitizeOutput(
  output: BusinessResearchOutput,
  sources: RankedSource[],
  searchesRun: number,
): BusinessResearchOutput {
  const sourceByUrl = new Map(sources.map((source) => [source.url, source]));
  const allowedUrls = new Set(sourceByUrl.keys());
  const sanitizedFacts = output.facts.map((fact) => {
    const sourceUrls = [
      ...new Set(fact.sourceUrls.filter((url) => allowedUrls.has(url))),
    ];
    const unsupported = sourceUrls.length === 0;
    return {
      ...fact,
      value: unsupported ? null : fact.value,
      confidence: unsupported ? 0 : clampConfidence(fact.confidence),
      status: unsupported ? ("missing" as const) : fact.status,
      sourceUrls,
      rationale: unsupported
        ? "No retrieved source supports this fact."
        : fact.rationale,
    };
  });
  const safeFactValues = new Set(
    sanitizedFacts
      .filter(
        (fact) =>
          fact.status === "verified" && fact.confidence >= 0.75 && fact.value,
      )
      .map((fact) => fact.value as string),
  );

  return {
    ...output,
    facts: sanitizedFacts,
    sources: sources.map((source) => ({ ...source })),
    conflicts: output.conflicts.map((conflict) => ({
      ...conflict,
      competingValues: conflict.competingValues
        .map((value) => ({
          ...value,
          sourceUrls: value.sourceUrls.filter((url) => allowedUrls.has(url)),
        }))
        .filter((value) => value.sourceUrls.length > 0),
    })),
    handoff: {
      menuResearchQueries: output.handoff.menuResearchQueries.slice(0, 4),
      micrositeSafeClaims: output.handoff.micrositeSafeClaims.filter((claim) =>
        [...safeFactValues].some((value) => claim.includes(value)),
      ),
      doNotPublishClaims: [
        ...new Set([
          ...output.handoff.doNotPublishClaims,
          ...sanitizedFacts
            .filter((fact) => fact.status !== "verified")
            .map((fact) => fact.key),
        ]),
      ],
    },
    searchesRun,
  };
}

export async function runBusinessResearch(
  ctx: ActionCtx,
  args: {
    jobId: Id<"jobs">;
    taskId: Id<"tasks">;
    businessId: Id<"businesses">;
    context: ResearchContext;
  },
): Promise<BusinessResearchResult> {
  if (!businessDescriptor(args.context))
    throw new Error("Business research requires a business identity prompt");

  const searches: LinkupSearchOutput[] = [];
  for (const pattern of buildQueries(args.context)) {
    const started = Date.now();
    try {
      const search = await callTool(ctx, "linkup.search", {
        query: pattern.query,
        jobId: args.jobId,
        businessId: args.businessId,
        depth: pattern.depth,
        outputType: pattern.outputType,
        includeDomains: pattern.includeDomains,
        maxResults: MAX_RESULTS_PER_SEARCH,
      });
      searches.push(search);
      await callTool(ctx, "trace.emit", {
        jobId: args.jobId,
        taskId: args.taskId,
        parentRole: "Agency Manager",
        role: ROLE,
        phase: "tool_call",
        summary: `Linkup business research returned ${search.results.length} sources`,
        input: {
          pattern: pattern.name,
          query: pattern.query,
          depth: pattern.depth,
          outputType: pattern.outputType,
          includeDomains: pattern.includeDomains,
        },
        output: {
          resultCount: search.results.length,
          sourceUrls: search.results.map((source) => source.url),
        },
        toolName: "linkup.search",
        durationMs: Date.now() - started,
      });
    } catch (error) {
      await callTool(ctx, "trace.emit", {
        jobId: args.jobId,
        taskId: args.taskId,
        parentRole: "Agency Manager",
        role: ROLE,
        phase: "error",
        summary: "Linkup business research query failed",
        input: { pattern: pattern.name, query: pattern.query },
        output: {
          error: error instanceof Error ? error.message : String(error),
        },
        toolName: "linkup.search",
        durationMs: Date.now() - started,
      });
    }
  }

  let visualEvidence: LinkupSearchOutput["results"] = [];
  const visualStarted = Date.now();
  try {
    const visualSearch = await callTool(ctx, "linkup.search", {
      query: `Find recent, authentic photos of ${businessDescriptor(args.context)} including storefront, signage, printed menus, posters, interiors, and brand ephemera. Return distinct images that reveal visual character.`,
      jobId: args.jobId,
      businessId: args.businessId,
      depth: "standard",
      outputType: "searchResults",
      includeImages: true,
      maxResults: 12,
    });
    visualEvidence = visualSearch.results
      .filter((result) => result.type === "image")
      .slice(0, 12);
    await callTool(ctx, "trace.emit", {
      jobId: args.jobId,
      taskId: args.taskId,
      parentRole: "Agency Manager",
      role: ROLE,
      phase: "tool_call",
      summary: `Collected ${visualEvidence.length} visual brand references`,
      input: { query: visualSearch.query },
      output: { imageUrls: visualEvidence.map((image) => image.url) },
      toolName: "linkup.search",
      durationMs: Date.now() - visualStarted,
    });
  } catch (error) {
    await callTool(ctx, "trace.emit", {
      jobId: args.jobId,
      taskId: args.taskId,
      parentRole: "Agency Manager",
      role: ROLE,
      phase: "error",
      summary: "Visual brand research failed; continuing with factual evidence",
      output: { error: error instanceof Error ? error.message : String(error) },
      toolName: "linkup.search",
      durationMs: Date.now() - visualStarted,
    });
  }

  const sources = uniqueRankedSources(
    searches,
    businessDescriptor(args.context).split(",")[0],
  );
  for (const source of sources
    .filter(
      (candidate) =>
        candidate.sourceType === "official_website" ||
        candidate.sourceType === "booking_or_ordering",
    )
    .slice(0, 3)) {
    const started = Date.now();
    try {
      const fetched = await callTool(ctx, "linkup.fetch", {
        url: source.url,
        renderJs: false,
      });
      if (fetched.markdown) source.snippet = fetched.markdown;
      visualEvidence.push(
        ...fetched.images.map((image) => ({
          title: image.alt || source.title,
          url: image.url,
          snippet: `Image discovered on ${source.url}`,
          type: "image" as const,
        })),
      );
      await callTool(ctx, "trace.emit", {
        jobId: args.jobId,
        taskId: args.taskId,
        parentRole: "Agency Manager",
        role: ROLE,
        phase: "tool_call",
        summary: "Fetched authoritative business page for full-text evidence",
        input: { url: source.url },
        output: { characters: fetched.markdown.length },
        toolName: "linkup.fetch",
        durationMs: Date.now() - started,
      });
    } catch (error) {
      await callTool(ctx, "trace.emit", {
        jobId: args.jobId,
        taskId: args.taskId,
        parentRole: "Agency Manager",
        role: ROLE,
        phase: "error",
        summary: "Authoritative page fetch failed; retaining search evidence",
        input: { url: source.url },
        output: {
          error: error instanceof Error ? error.message : String(error),
        },
        toolName: "linkup.fetch",
        durationMs: Date.now() - started,
      });
    }
  }
  const llmStarted = Date.now();
  const llm = await callStructured<BusinessResearchOutput>({
    system:
      "You are the initial business research specialist for a local-presence agency. Resolve the exact business identity before extracting facts. " +
      "The operator brief is the identity request when the business record contains placeholder text; never treat placeholder text as the business name. " +
      "Use only the supplied evidence. First-party and government evidence outrank profiles and directories; search rank never establishes authority. " +
      "Every non-missing fact must cite one or more supplied source URLs. Report disagreements as conflicts, never silently choose a convenient value. " +
      "Do not infer languages, amenities, services, pricing, awards, popularity, ownership, or cultural identity. " +
      "Microsite-safe claims must be conservative, factual statements containing an exact verified fact value. Create bounded follow-up queries for menu research.",
    user:
      `BUSINESS INPUT:\n${JSON.stringify(args.context.business, null, 2)}\n\n` +
      `PRIOR OPERATOR ARTIFACTS (context only, not web verification):\n${JSON.stringify(args.context.artifacts, null, 2)}\n\n` +
      `RANKED LIVE SOURCES:\n${JSON.stringify(sources, null, 2)}\n\n` +
      `LINKUP SOURCED ANSWERS:\n${JSON.stringify(
        searches.map((search) => ({
          query: search.query,
          answer: search.answer,
        })),
        null,
        2,
      )}\n\n` +
      `searchesRun must equal ${searches.length}. Preserve source URLs exactly.`,
    schemaName: "business_research_v1",
    schema: BUSINESS_RESEARCH_SCHEMA,
    temperature: 0.1,
  });
  await callTool(ctx, "trace.emit", {
    jobId: args.jobId,
    taskId: args.taskId,
    parentRole: "Agency Manager",
    role: ROLE,
    phase: "llm_call",
    summary: "Synthesized fact-level business research",
    input: { sourceCount: sources.length, searchesRun: searches.length },
    output: {
      factCount: llm.data.facts.length,
      conflictCount: llm.data.conflicts.length,
      missingCount: llm.data.missingFacts.length,
    },
    model: llm.model,
    promptTokens: llm.promptTokens,
    completionTokens: llm.completionTokens,
    durationMs: Date.now() - llmStarted,
  });

  const data = sanitizeOutput(llm.data, sources, searches.length);
  (
    data as BusinessResearchOutput & { visualEvidence: typeof visualEvidence }
  ).visualEvidence = [
    ...new Map(visualEvidence.map((image) => [image.url, image])).values(),
  ].slice(0, 20);
  const citations: CitationToPersist[] = data.facts.flatMap((fact) =>
    fact.sourceUrls.map((sourceUrl) => {
      const source = sources.find((candidate) => candidate.url === sourceUrl);
      return {
        claim: `${fact.key}: ${fact.value ?? "missing"}`,
        sourceUrl,
        sourceTitle: source?.title,
        snippet: source?.snippet,
        origin: "linkup" as const,
      };
    }),
  );

  return {
    data,
    citations,
    model: llm.model,
    promptTokens: llm.promptTokens,
    completionTokens: llm.completionTokens,
  };
}
