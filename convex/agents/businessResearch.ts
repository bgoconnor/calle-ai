import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { callTool, type CitationToPersist, type LinkupSearchOutput } from "../tools";
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

const MAX_SEARCHES = 4;
const MAX_RESULTS_PER_SEARCH = 8;
const ROLE = "Business Research Specialist";

const PLATFORM_RULES: Array<{
  hosts: string[];
  type: BusinessResearchSourceType;
  authority: number;
  reason: string;
}> = [
  { hosts: ["google.com", "maps.google.com", "goo.gl"], type: "google_business_profile", authority: 0.82, reason: "Major business-listing profile; useful but may be user-edited or stale." },
  { hosts: ["instagram.com", "facebook.com", "tiktok.com"], type: "official_social", authority: 0.76, reason: "Potential owner-controlled social profile; identity must match the business." },
  { hosts: ["square.site", "squareup.com", "toasttab.com", "clover.com", "doordash.com", "ubereats.com", "grubhub.com", "resy.com", "opentable.com", "vagaro.com", "booksy.com"], type: "booking_or_ordering", authority: 0.78, reason: "Transactional provider likely maintained by the business, though details can lag." },
  { hosts: ["yelp.com", "tripadvisor.com"], type: "review_platform", authority: 0.5, reason: "Third-party review platform; corroboration only, never decisive over owner evidence." },
  { hosts: ["yellowpages.com", "mapquest.com", "foursquare.com"], type: "reputable_directory", authority: 0.42, reason: "Third-party directory that may aggregate stale data." },
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
      return { ...source, sourceType: rule.type, authority: rule.authority, authorityReason: rule.reason, retrievedAt };
    }
  }
  if (host.endsWith(".gov")) {
    return { ...source, sourceType: "government_or_registry", authority: 0.9, authorityReason: "Government or public-registry source.", retrievedAt };
  }
  const identityMatch = identityTokens(businessName).some(
    (token) => host.includes(token) || source.title.toLowerCase().includes(token),
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
  return [business?.name, business?.type, business?.address].filter(Boolean).join(", ");
}

function buildQueries(context: ResearchContext): string[] {
  const descriptor = businessDescriptor(context);
  return [
    `Identify the exact local business ${descriptor}. Find its official website or Google Business Profile and current name, category, address, and phone. Do not return similarly named businesses.`,
    `Find owner-controlled pages for ${descriptor}: official website and official Instagram, Facebook, TikTok, booking, or ordering profiles. Verify the location matches.`,
    `Find current operating hours, services or cuisine, languages, and booking or ordering details for ${descriptor}. Prefer first-party pages and Google Business Profile.`,
    `Cross-check listings for ${descriptor} for conflicting address, phone, hours, closure status, or website information. Return source links for every value.`,
  ].slice(0, MAX_SEARCHES);
}

function uniqueRankedSources(searches: LinkupSearchOutput[], businessName: string | undefined): RankedSource[] {
  const byUrl = new Map<string, RankedSource>();
  for (const search of searches) {
    for (const result of search.results.slice(0, MAX_RESULTS_PER_SEARCH)) {
      if (!result.url || !hostOf(result.url)) continue;
      const ranked = rankSource(result, search.retrievedAt, businessName);
      const existing = byUrl.get(result.url);
      if (!existing || ranked.snippet.length > existing.snippet.length) byUrl.set(result.url, ranked);
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
    const sourceUrls = [...new Set(fact.sourceUrls.filter((url) => allowedUrls.has(url)))];
    const unsupported = sourceUrls.length === 0;
    return {
      ...fact,
      value: unsupported ? null : fact.value,
      confidence: unsupported ? 0 : clampConfidence(fact.confidence),
      status: unsupported ? "missing" as const : fact.status,
      sourceUrls,
      rationale: unsupported ? "No retrieved source supports this fact." : fact.rationale,
    };
  });
  const safeFactValues = new Set(
    sanitizedFacts
      .filter((fact) => fact.status === "verified" && fact.confidence >= 0.75 && fact.value)
      .map((fact) => fact.value as string),
  );

  return {
    ...output,
    facts: sanitizedFacts,
    sources: sources.map((source) => ({ ...source })),
    conflicts: output.conflicts.map((conflict) => ({
      ...conflict,
      competingValues: conflict.competingValues
        .map((value) => ({ ...value, sourceUrls: value.sourceUrls.filter((url) => allowedUrls.has(url)) }))
        .filter((value) => value.sourceUrls.length > 0),
    })),
    handoff: {
      menuResearchQueries: output.handoff.menuResearchQueries.slice(0, 4),
      micrositeSafeClaims: output.handoff.micrositeSafeClaims.filter((claim) =>
        [...safeFactValues].some((value) => claim.includes(value)),
      ),
      doNotPublishClaims: [...new Set([
        ...output.handoff.doNotPublishClaims,
        ...sanitizedFacts.filter((fact) => fact.status !== "verified").map((fact) => fact.key),
      ])],
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
  if (!args.context.business?.name?.trim()) throw new Error("Business research requires a business name");

  const searches: LinkupSearchOutput[] = [];
  for (const query of buildQueries(args.context)) {
    const started = Date.now();
    try {
      const search = await callTool(ctx, "linkup.search", {
        query,
        jobId: args.jobId,
        businessId: args.businessId,
      });
      searches.push(search);
      await callTool(ctx, "trace.emit", {
        jobId: args.jobId,
        taskId: args.taskId,
        parentRole: "Agency Manager",
        role: ROLE,
        phase: "tool_call",
        summary: `Linkup business research returned ${search.results.length} sources`,
        input: { query },
        output: { resultCount: search.results.length, sourceUrls: search.results.map((source) => source.url) },
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
        input: { query },
        output: { error: error instanceof Error ? error.message : String(error) },
        toolName: "linkup.search",
        durationMs: Date.now() - started,
      });
    }
  }

  const sources = uniqueRankedSources(searches, args.context.business.name);
  const llmStarted = Date.now();
  const llm = await callStructured<BusinessResearchOutput>({
    system:
      "You are the initial business research specialist for a local-presence agency. Resolve the exact business identity before extracting facts. " +
      "Use only the supplied evidence. First-party and government evidence outrank profiles and directories; search rank never establishes authority. " +
      "Every non-missing fact must cite one or more supplied source URLs. Report disagreements as conflicts, never silently choose a convenient value. " +
      "Do not infer languages, amenities, services, pricing, awards, popularity, ownership, or cultural identity. " +
      "Microsite-safe claims must be conservative, factual statements containing an exact verified fact value. Create bounded follow-up queries for menu research.",
    user:
      `BUSINESS INPUT:\n${JSON.stringify(args.context.business, null, 2)}\n\n` +
      `PRIOR OPERATOR ARTIFACTS (context only, not web verification):\n${JSON.stringify(args.context.artifacts, null, 2)}\n\n` +
      `RANKED LIVE SOURCES:\n${JSON.stringify(sources, null, 2)}\n\n` +
      `LINKUP SOURCED ANSWERS:\n${JSON.stringify(searches.map((search) => ({ query: search.query, answer: search.answer })), null, 2)}\n\n` +
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
    output: { factCount: llm.data.facts.length, conflictCount: llm.data.conflicts.length, missingCount: llm.data.missingFacts.length },
    model: llm.model,
    promptTokens: llm.promptTokens,
    completionTokens: llm.completionTokens,
    durationMs: Date.now() - llmStarted,
  });

  const data = sanitizeOutput(llm.data, sources, searches.length);
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
