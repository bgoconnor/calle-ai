import type { Id } from "../_generated/dataModel";
import type { ToolContext } from "./types";

export type LinkupSearchInput = {
  query: string;
  jobId?: Id<"jobs">;
  businessId?: Id<"businesses">;
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

/** Calls Linkup through the integration Worker so its API key stays centralized. */
export async function linkupSearch(
  _ctx: ToolContext,
  input: LinkupSearchInput,
): Promise<LinkupSearchOutput> {
  const workerUrl =
    process.env.INTEGRATION_WORKER_URL ??
    process.env.VITE_INTEGRATION_WORKER_URL;
  if (!workerUrl) {
    throw new Error("INTEGRATION_WORKER_URL is not configured");
  }

  const query = input.query.trim();
  if (!query) throw new Error("linkup.search requires a query");

  const response = await fetch(
    `${workerUrl.replace(/\/$/, "")}/v1/research`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        jobId: input.jobId,
        businessId: input.businessId,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(
      `linkup.search failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  const payload = (await response.json()) as Partial<LinkupSearchOutput>;
  if (!Array.isArray(payload.results)) {
    throw new Error("linkup.search returned an invalid response");
  }

  return {
    query: typeof payload.query === "string" ? payload.query : query,
    answer: typeof payload.answer === "string" ? payload.answer : "",
    results: payload.results.map((result) => ({
      title: String(result.title ?? "Untitled source"),
      url: String(result.url ?? ""),
      snippet: String(result.snippet ?? ""),
    })),
    retrievedAt:
      typeof payload.retrievedAt === "string"
        ? payload.retrievedAt
        : new Date().toISOString(),
  };
}
