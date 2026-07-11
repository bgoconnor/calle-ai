import type { Id } from "../_generated/dataModel";
import type { ToolContext } from "./types";

export type LinkupSearchInput = {
  query: string;
  jobId?: Id<"jobs">;
  businessId?: Id<"businesses">;
  depth?: "fast" | "standard" | "deep";
  outputType?: "searchResults" | "sourcedAnswer";
  includeDomains?: string[];
  excludeDomains?: string[];
  maxResults?: number;
  includeImages?: boolean;
};

export type LinkupSearchOutput = {
  query: string;
  answer: string;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  retrievedAt: string;
};

const REQUEST_TIMEOUT_MS = 15_000;
const LINKUP_URL = "https://api.linkup.so/v1/search";

/**
 * Calls Linkup directly from the Convex action, with the key held in Convex env
 * (`LINKUP_API_KEY`). Convex actions run server-side, so the key never reaches
 * the browser — no integration Worker needed for this server-to-server lookup.
 * (The Worker is still used for browser-facing ElevenLabs audio + Dodo webhooks.)
 */
export async function linkupSearch(
  _ctx: ToolContext,
  input: LinkupSearchInput,
): Promise<LinkupSearchOutput> {
  const apiKey = process.env.LINKUP_API_KEY;
  if (!apiKey) {
    throw new Error(
      "LINKUP_API_KEY is not set. Run: npx convex env set LINKUP_API_KEY <key>",
    );
  }

  const query = input.query.trim();
  if (!query) throw new Error("linkup.search requires a query");

  const response = await fetch(LINKUP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      depth: input.depth ?? "standard",
      outputType: input.outputType ?? "searchResults",
      ...(input.includeDomains?.length ? { includeDomains: input.includeDomains.slice(0, 100) } : {}),
      ...(input.excludeDomains?.length ? { excludeDomains: input.excludeDomains } : {}),
      ...(input.maxResults ? { maxResults: Math.max(1, Math.min(input.maxResults, 20)) } : {}),
      ...(input.includeImages ? { includeImages: true } : {}),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(
      `linkup.search failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  const raw = (await response.json()) as {
    answer?: unknown;
    sources?: Array<Record<string, unknown>>;
    results?: Array<Record<string, unknown>>;
  };

  const rawResults = Array.isArray(raw.results) ? raw.results : raw.sources;
  const results = Array.isArray(rawResults)
    ? rawResults.map((source) => ({
        title: String(source.name ?? source.title ?? "Untitled source"),
        url: String(source.url ?? ""),
        snippet: String(source.snippet ?? source.content ?? ""),
      }))
    : [];

  return {
    query,
    answer: typeof raw.answer === "string" ? raw.answer : "",
    results,
    retrievedAt: new Date().toISOString(),
  };
}
