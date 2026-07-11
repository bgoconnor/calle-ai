import type { ToolContext } from "./types";

export type LinkupFetchInput = {
  url: string;
  renderJs?: boolean;
  extractImages?: boolean;
};

export type LinkupFetchOutput = {
  url: string;
  markdown: string;
  images: Array<{ alt: string; url: string }>;
  retrievedAt: string;
};

const LINKUP_FETCH_URL = "https://api.linkup.so/v1/fetch";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_MARKDOWN_CHARS = 12_000;

export async function linkupFetch(
  _ctx: ToolContext,
  input: LinkupFetchInput,
): Promise<LinkupFetchOutput> {
  const apiKey = process.env.LINKUP_API_KEY;
  if (!apiKey) throw new Error("LINKUP_API_KEY is not set");
  const url = new URL(input.url);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("linkup.fetch requires an HTTP URL");

  const response = await fetch(LINKUP_FETCH_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: url.toString(),
      renderJs: input.renderJs ?? false,
      extractImages: input.extractImages ?? false,
      includeRawHtml: false,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`linkup.fetch failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  const raw = await response.json() as { markdown?: unknown; images?: Array<Record<string, unknown>> };
  return {
    url: url.toString(),
    markdown: typeof raw.markdown === "string" ? raw.markdown.slice(0, MAX_MARKDOWN_CHARS) : "",
    images: Array.isArray(raw.images) ? raw.images.map((image) => ({ alt: String(image.alt ?? ""), url: String(image.url ?? "") })) : [],
    retrievedAt: new Date().toISOString(),
  };
}
