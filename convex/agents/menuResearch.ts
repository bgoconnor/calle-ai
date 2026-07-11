import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { callTool, type CitationToPersist } from "../tools";
import { callStructured } from "./llm";
import { ROLES } from "./roles";

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
  const queries = [
    `Find the official, current, comprehensive menu for ${name}. Prefer the restaurant website, official menu PDF, or ordering page.`,
    `Find the complete menu with sections, item names, descriptions, and prices for ${name}. Return authoritative source links.`,
  ];
  const searches = [];

  for (const query of queries) {
    const started = Date.now();
    const result = await callTool(ctx, "linkup.search", {
      query,
      businessId: args.businessId,
    });
    searches.push(result);
    await callTool(ctx, "trace.emit", {
      jobId: args.jobId,
      taskId: args.taskId,
      parentRole: "Agency Manager",
      role: ROLES.menu_discovery.name,
      phase: "tool_call",
      summary: `Linkup menu discovery returned ${result.results.length} sources`,
      input: { query },
      output: { sourceUrls: result.results.map((source) => source.url) },
      toolName: "linkup.search",
      durationMs: Date.now() - started,
    });
  }

  const evidence = searches.flatMap((search) =>
    search.results.map((result) => ({ ...result, answer: search.answer })),
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

  const validUrls = new Set(evidence.map((source) => source.url).filter(Boolean));
  llm.data.sources = llm.data.sources.filter((source: any) => validUrls.has(source.url));
  llm.data.selectedSourceUrls = llm.data.selectedSourceUrls.filter((url: string) => validUrls.has(url));
  llm.data.searchesRun = searches.length;
  llm.data.searchEvidence = searches.map((search) => ({ query: search.query, answer: search.answer }));

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
    .filter((item: any) => item.id && item.originalName && !item.needsReview)
    .sort((a: any, b: any) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0))
    .slice(0, 8);
  const highlights: any[] = [];
  const citations: CitationToPersist[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let model = "";
  let searchesRun = 0;

  for (const item of candidates) {
    if (highlights.length >= 4) break;
    const query = `Find direct customer review quotations for ${businessSearchName(args.context)} that explicitly mention the menu item "${item.originalName}". Include the exact quote, displayed reviewer name, and original review URL.`;
    const started = Date.now();
    const search = await callTool(ctx, "linkup.search", {
      query,
      businessId: args.businessId,
    });
    searchesRun += 1;
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
    const haystack = [search.answer, ...search.results.map((result) => result.snippet)].join("\n");
    const validSource = search.results.find((result) => result.url === candidate.sourceUrl);
    const exactQuote = typeof candidate.quote === "string" && haystack.includes(candidate.quote);
    if (!candidate.qualified || !exactQuote || !validSource || candidate.quote.length > 240 || candidate.confidence < 0.85) {
      continue;
    }

    highlights.push({
      menuItemId: item.id,
      quote: candidate.quote,
      authorDisplayName: candidate.authorDisplayName,
      sourceName: candidate.sourceName ?? validSource.title,
      sourceUrl: candidate.sourceUrl,
      publishedAt: candidate.publishedAt,
      confidence: candidate.confidence,
    });
    citations.push({
      claim: candidate.quote,
      sourceUrl: candidate.sourceUrl,
      sourceTitle: candidate.sourceName ?? validSource.title,
      snippet: candidate.quote,
      origin: "linkup",
    });
  }

  return {
    data: {
      highlights,
      searchesRun,
      stopReason: highlights.length >= 4 ? "target_reached" : "candidates_exhausted",
    },
    citations,
    model,
    promptTokens,
    completionTokens,
  };
}
