import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { callTool, type CitationToPersist } from "../tools";
import { callStructured } from "./llm";
import { ROLES } from "./roles";
import {
  canonicalUrl,
  dedupeSources,
  MAX_SOURCES_PER_SEARCH,
  MENU_SEARCH_BUDGET,
  stableMenuId,
  TESTIMONIAL_SEARCH_BUDGET,
  validateNormalizedMenu,
} from "./menuEvidence";

type ResearchContext = {
  business: { name?: string; address?: string; mapsUrl?: string } | null;
  artifacts: Array<{ kind: string; data: any }>;
};

type ToolRoleResult = {
  data: unknown;
  citations: CitationToPersist[];
  model: string;
  promptTokens?: number;
  completionTokens?: number;
};

const TESTIMONIAL_EVALUATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["qualified", "quote", "authorDisplayName", "sourceName", "sourceUrl", "publishedAt", "confidence"],
  properties: {
    qualified: { type: "boolean" },
    quote: { type: ["string", "null"] },
    authorDisplayName: { type: ["string", "null"] },
    sourceName: { type: ["string", "null"] },
    sourceUrl: { type: ["string", "null"] },
    publishedAt: { type: ["string", "null"] },
    confidence: { type: "number" },
  },
};

function businessSearchName(context: ResearchContext) {
  return [context.business?.name, context.business?.address]
    .filter(Boolean)
    .join(" ");
}

export async function runMenuDiscovery(
  ctx: ActionCtx,
  args: { jobId: Id<"jobs">; taskId: Id<"tasks">; businessId: Id<"businesses">; context: ResearchContext },
): Promise<ToolRoleResult> {
  const name = businessSearchName(args.context);
  const businessQueries = [...args.context.artifacts]
    .reverse()
    .find((artifact) => artifact.kind === "business_facts")?.data?.handoff?.menuResearchQueries;
  const suggestedQuery = Array.isArray(businessQueries)
    ? businessQueries.find((query): query is string => typeof query === "string")
    : undefined;
  const queries = [
    { pattern: "exact_keyword", query: `"${args.context.business?.name ?? name}" menu "${args.context.business?.address ?? ""}"`, depth: "fast" as const, outputType: "searchResults" as const },
    { pattern: "official_menu", query: suggestedQuery ?? `Find the official website or owner-published menu for "${name}". Return direct menu pages, PDFs, or images with sections, items, descriptions, and prices.`, depth: "standard" as const, outputType: "searchResults" as const },
    { pattern: "ordering_platforms", query: `Find the current owner-linked ordering menu for "${name}". Match the address before returning menu pages.`, depth: "standard" as const, outputType: "searchResults" as const, includeDomains: ["toasttab.com", "square.site", "squareup.com", "clover.com", "doordash.com", "ubereats.com", "grubhub.com"] },
  ].slice(0, MENU_SEARCH_BUDGET);
  const searches = [];

  for (const pattern of queries) {
    const started = Date.now();
    const result = await callTool(ctx, "linkup.search", {
      query: pattern.query,
      businessId: args.businessId,
      depth: pattern.depth,
      outputType: pattern.outputType,
      includeDomains: pattern.includeDomains,
      maxResults: MAX_SOURCES_PER_SEARCH,
    });
    searches.push({
      ...result,
      results: dedupeSources(result.results).slice(0, MAX_SOURCES_PER_SEARCH),
    });
    await callTool(ctx, "trace.emit", {
      jobId: args.jobId,
      taskId: args.taskId,
      parentRole: "Agency Manager",
      role: ROLES.menu_discovery.name,
      phase: "tool_call",
      summary: `Linkup menu discovery returned ${result.results.length} sources`,
      input: { pattern: pattern.pattern, query: pattern.query, depth: pattern.depth, outputType: pattern.outputType, includeDomains: pattern.includeDomains },
      output: { sourceUrls: result.results.map((source) => source.url) },
      toolName: "linkup.search",
      durationMs: Date.now() - started,
    });
  }

  const fetchedByUrl = new Map<string, string>();
  const fetchCandidates = dedupeSources(searches.flatMap((search) => search.results))
    .filter((source) => !/(yelp|tripadvisor|instagram|facebook|tiktok)\.com$/i.test(new URL(source.url).hostname.replace(/^www\./, "")))
    .slice(0, 4);
  for (const source of fetchCandidates) {
    const started = Date.now();
    try {
      const fetched = await callTool(ctx, "linkup.fetch", { url: source.url, renderJs: false });
      if (fetched.markdown) fetchedByUrl.set(canonicalUrl(source.url) ?? source.url, fetched.markdown);
      await callTool(ctx, "trace.emit", {
        jobId: args.jobId,
        taskId: args.taskId,
        parentRole: "Agency Manager",
        role: ROLES.menu_discovery.name,
        phase: "tool_call",
        summary: "Fetched candidate menu page for full-text evidence",
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
        role: ROLES.menu_discovery.name,
        phase: "error",
        summary: "Candidate menu fetch failed; retaining search snippet",
        input: { url: source.url },
        output: { error: error instanceof Error ? error.message : String(error) },
        toolName: "linkup.fetch",
        durationMs: Date.now() - started,
      });
    }
  }

  const evidence = searches.flatMap((search, searchIndex) =>
    search.results.map((result, sourceIndex) => ({
      ...result,
      snippet: fetchedByUrl.get(canonicalUrl(result.url) ?? result.url) ?? result.snippet,
      query: search.query,
      retrievedAt: search.retrievedAt,
      searchIndex,
      sourceIndex,
    })),
  );
  const llm = await callStructured<any>({
    system: ROLES.menu_discovery.system,
    user:
      `BUSINESS:\n${JSON.stringify(args.context.business, null, 2)}\n\n` +
      `LIVE LINKUP EVIDENCE:\n${JSON.stringify(evidence, null, 2)}\n\n` +
      `Select the authoritative menu sources. searchesRun must be ${searches.length}.`,
    schemaName: ROLES.menu_discovery.outputName,
    schema: ROLES.menu_discovery.outputSchema,
  });

  const evidenceByUrl = new Map(evidence.map((source) => [canonicalUrl(source.url), source]));
  llm.data.sources = llm.data.sources.flatMap((source: any) => {
    const url = canonicalUrl(source.url);
    const observed = url ? evidenceByUrl.get(url) : undefined;
    if (!url || !observed) return [];
    return [{ ...source, url, title: observed.title, snippet: observed.snippet }];
  });
  const acceptedUrls = new Set(llm.data.sources
    .filter((source: any) => source.sourceType !== "third_party" && Number(source.authority) >= 0.7)
    .map((source: any) => source.url));
  llm.data.selectedSourceUrls = [...new Set(llm.data.selectedSourceUrls
    .map((url: string) => canonicalUrl(url))
    .filter((url: string | null): url is string => Boolean(url) && acceptedUrls.has(url)))];
  llm.data.searchesRun = searches.length;
  llm.data.searchEvidence = searches.map((search) => ({ query: search.query, answer: search.answer }));
  llm.data.provenance = searches.flatMap((search, searchIndex) => search.results.map((source, sourceIndex) => ({
    searchIndex,
    sourceIndex,
    query: search.query,
    retrievedAt: search.retrievedAt,
    url: source.url,
  })));
  if (llm.data.selectedSourceUrls.length === 0 && llm.data.status === "authoritative_menu_found") {
    llm.data.status = llm.data.sources.length > 0 ? "third_party_only" : "not_found";
  }
  llm.data.blockers = llm.data.status === "authoritative_menu_found" && llm.data.selectedSourceUrls.length > 0
    ? []
    : [{
        code: "no_authoritative_source",
        message: "No owner-controlled or official ordering menu was verified; operator evidence is required before publishing a complete menu.",
        sourceUrls: llm.data.sources.map((source: any) => source.url),
      }];

  return {
    data: llm.data,
    citations: llm.data.sources.map((source: any) => ({
      claim: `Menu source discovered for ${args.context.business?.name ?? "business"}`,
      sourceUrl: source.url,
      sourceTitle: source.title,
      snippet: source.snippet,
      origin: "linkup" as const,
    })),
    model: llm.model,
    promptTokens: llm.promptTokens,
    completionTokens: llm.completionTokens,
  };
}

export async function runMenuTestimonials(
  ctx: ActionCtx,
  args: { jobId: Id<"jobs">; taskId: Id<"tasks">; businessId: Id<"businesses">; context: ResearchContext },
): Promise<ToolRoleResult> {
  const menu = [...args.context.artifacts]
    .reverse()
    .find((artifact) => artifact.kind === "normalized_menu")?.data;
  const items = (menu?.sections ?? []).flatMap((section: any) => section.items ?? []);
  const candidates = items
    .filter((item: any) => stableMenuId(item.id) && item.originalName && !item.needsReview)
    .sort((a: any, b: any) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0))
    .slice(0, TESTIMONIAL_SEARCH_BUDGET);
  const highlights: any[] = [];
  const citations: CitationToPersist[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let model = "";
  let searchesRun = 0;
  const searchEvidence: Array<{ menuItemId: string; query: string; answer: string; sources: typeof highlights }> = [];
  const menuBlockers = validateNormalizedMenu(menu);

  for (const item of candidates) {
    if (highlights.length >= 4) break;
    const query = `Find direct customer review quotations for ${businessSearchName(args.context)} that explicitly mention the menu item "${item.originalName}". Include the exact quote, displayed reviewer name, and original review URL.`;
    const started = Date.now();
    const rawSearch = await callTool(ctx, "linkup.search", {
      query,
      businessId: args.businessId,
    });
    const search = {
      ...rawSearch,
      results: dedupeSources(rawSearch.results).slice(0, MAX_SOURCES_PER_SEARCH),
    };
    searchesRun += 1;
    searchEvidence.push({
      menuItemId: String(item.id),
      query,
      answer: search.answer,
      sources: search.results,
    });
    await callTool(ctx, "trace.emit", {
      jobId: args.jobId,
      taskId: args.taskId,
      parentRole: "Agency Manager",
      role: ROLES.menu_testimonials.name,
      phase: "tool_call",
      summary: `Searched reviews for ${item.originalName}`,
      input: { query, menuItemId: item.id },
      output: { resultCount: search.results.length, sourceUrls: search.results.map((source) => source.url) },
      toolName: "linkup.search",
      durationMs: Date.now() - started,
    });

    const evaluation = await callStructured<any>({
      system: ROLES.menu_testimonials.system,
      user:
        `MENU ITEM: ${JSON.stringify({ id: item.id, name: item.originalName, aliases: item.aliases })}\n\n` +
        `LINKUP ANSWER:\n${search.answer}\n\nSOURCES:\n${JSON.stringify(search.results, null, 2)}\n\n` +
        "Return qualified=false unless the exact quote is visible in this evidence and clearly refers to this item. Keep quotes under 240 characters.",
      schemaName: "testimonial_evaluation",
      schema: TESTIMONIAL_EVALUATION_SCHEMA,
    });
    model = evaluation.model;
    promptTokens += evaluation.promptTokens ?? 0;
    completionTokens += evaluation.completionTokens ?? 0;

    const candidate = evaluation.data;
    const candidateUrl = typeof candidate.sourceUrl === "string" ? canonicalUrl(candidate.sourceUrl) : null;
    const validSource = search.results.find((result) => canonicalUrl(result.url) === candidateUrl);
    // A sourced answer may combine multiple pages. Verify against the selected
    // source's own evidence so a quote cannot be attributed to the wrong URL.
    const exactQuote = typeof candidate.quote === "string" && validSource?.snippet.includes(candidate.quote);
    const authorSupported = candidate.authorDisplayName === null ||
      (typeof candidate.authorDisplayName === "string" && validSource?.snippet.includes(candidate.authorDisplayName));
    if (!candidate.qualified || !exactQuote || !validSource || candidate.quote.length > 240 || candidate.confidence < 0.85) {
      continue;
    }
    if (!authorSupported) continue;

    highlights.push({
      menuItemId: item.id,
      quote: candidate.quote,
      authorDisplayName: candidate.authorDisplayName,
      sourceName: candidate.sourceName ?? validSource.title,
      sourceUrl: validSource.url,
      publishedAt: candidate.publishedAt,
      confidence: candidate.confidence,
    });
    citations.push({
      claim: candidate.quote,
      sourceUrl: validSource.url,
      sourceTitle: candidate.sourceName ?? validSource.title,
      snippet: candidate.quote,
      origin: "linkup",
    });
  }

  return {
    data: {
      highlights,
      searchesRun,
      stopReason: highlights.length >= 4
        ? "target_reached"
        : searchesRun >= TESTIMONIAL_SEARCH_BUDGET
          ? "search_budget_reached"
          : "candidates_exhausted",
      searchEvidence,
      blockers: menuBlockers,
      contractVersion: "menu-testimonials.v1",
    },
    citations,
    model,
    promptTokens,
    completionTokens,
  };
}
