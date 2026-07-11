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

export async function linkupFetch(
  _ctx: ToolContext,
  input: LinkupFetchInput,
): Promise<LinkupFetchOutput> {
  const apiKey = process.env.LINKUP_API_KEY;
  if (!apiKey) throw new Error("LINKUP_API_KEY is not set");
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("linkup.fetch requires an http(s) URL");

  const response = await fetch("https://api.linkup.so/v1/fetch", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      renderJs: input.renderJs ?? true,
      extractImages: input.extractImages ?? true,
      includeRawHtml: false,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`linkup.fetch failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  const raw = await response.json() as Record<string, unknown>;
  const images = Array.isArray(raw.images) ? raw.images : [];
  return {
    url,
    markdown: String(raw.markdown ?? raw.content ?? ""),
    images: images.map((image: any) => ({ alt: String(image.alt ?? ""), url: String(image.url ?? "") })).filter((image) => image.url),
    retrievedAt: new Date().toISOString(),
  };
}
