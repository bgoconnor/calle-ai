export const MENU_SEARCH_BUDGET = 3;
export const TESTIMONIAL_SEARCH_BUDGET = 6;
export const MAX_SOURCES_PER_SEARCH = 8;

export type SearchSource = {
  title: string;
  url: string;
  snippet: string;
};

export type MenuBlocker = {
  code: "no_authoritative_source" | "unsupported_item_sources" | "conflicting_sources" | "incomplete_menu" | "unstable_item_ids";
  message: string;
  sourceUrls: string[];
};

export function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"]) {
      url.searchParams.delete(key);
    }
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

export function dedupeSources(sources: SearchSource[]): SearchSource[] {
  const seen = new Set<string>();
  const result: SearchSource[] = [];
  for (const source of sources) {
    const url = canonicalUrl(source.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push({ ...source, url });
  }
  return result;
}

export function stableMenuId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function validateNormalizedMenu(menu: any, menuSources?: any): MenuBlocker[] {
  const blockers: MenuBlocker[] = [];
  const ids = new Set<string>();
  let unstable = false;
  for (const section of menu?.sections ?? []) {
    if (!stableMenuId(section?.id) || ids.has(section.id)) unstable = true;
    else ids.add(section.id);
    for (const item of section?.items ?? []) {
      if (!stableMenuId(item?.id) || ids.has(item.id)) unstable = true;
      else ids.add(item.id);
    }
  }
  if (unstable) blockers.push({
    code: "unstable_item_ids",
    message: "Section and item IDs must be unique lowercase kebab-case IDs before downstream handoff.",
    sourceUrls: [],
  });
  if (menu?.likelyComplete !== true) blockers.push({
    code: "incomplete_menu",
    message: String(menu?.completenessReason || "The available evidence does not support a complete menu."),
    sourceUrls: [],
  });
  // Conflicts are provenance, not an approval gate. The normalization agent
  // selects the freshest credible source as canonical and retains older values
  // here so post-ship feedback can correct the decision without blocking it.
  if (menuSources) {
    const selected = new Set((menuSources.selectedSourceUrls ?? []).map(canonicalUrl).filter(Boolean));
    if (selected.size === 0) blockers.push({
      code: "no_authoritative_source",
      message: "No authoritative menu source was selected by discovery.",
      sourceUrls: [],
    });
    const unsupported = (menu?.sections ?? []).flatMap((section: any) => section.items ?? []).filter((item: any) =>
      !Array.isArray(item.sourceUrls) || item.sourceUrls.length === 0 ||
      item.sourceUrls.some((url: string) => !selected.has(canonicalUrl(url))),
    );
    if (unsupported.length > 0) blockers.push({
      code: "unsupported_item_sources",
      message: `${unsupported.length} menu item(s) do not cite a selected authoritative source.`,
      sourceUrls: [...new Set(unsupported.flatMap((item: any) => item.sourceUrls ?? []))] as string[],
    });
  }
  return blockers;
}

export function prepareMenuGeneratorHandoff(menu: any, testimonials: any, menuSources?: any) {
  const blockers = validateNormalizedMenu(menu, menuSources);
  const itemIds = new Set((menu?.sections ?? []).flatMap((section: any) =>
    (section.items ?? []).map((item: any) => item.id)).filter(stableMenuId));
  const highlights = (testimonials?.highlights ?? []).filter((highlight: any) =>
    itemIds.has(highlight.menuItemId));
  return {
    contractVersion: "menu-generator-input.v1",
    menu,
    testimonials: highlights,
    blockers,
    publishable: blockers.length === 0,
  };
}
