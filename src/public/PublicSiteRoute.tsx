import { getMockSite } from "./mockSites";
import { PublicMicrosite } from "./PublicMicrosite";
import type { PublishedSite } from "./types";

/**
 * Temporary route adapter. Replace getPublishedSite with a Convex query once
 * the agency engine exposes it; keep PublicMicrosite unchanged.
 */
export function PublicSiteRoute({ slug, site }: { slug: string; site?: PublishedSite }) {
  const resolved = site ?? getMockSite(slug);
  if (!resolved) return <main style={{ padding: 40 }}>This storefront is not published.</main>;
  return <PublicMicrosite site={resolved} />;
}
