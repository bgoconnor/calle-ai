import { useEffect, useState } from "react";
import { fetchPublishedSite } from "../lib/liveAgency";
import { PublicSiteRoute } from "./PublicSiteRoute";
import type { PublishedSite } from "./types";

export function ConnectedPublicSite({ slug, convexUrl }: { slug: string; convexUrl?: string }) {
  const [site, setSite] = useState<PublishedSite | null | undefined>(undefined);

  useEffect(() => {
    if (!convexUrl) return;
    let active = true;
    void fetchPublishedSite(convexUrl, slug)
      .then((result) => { if (active) setSite(result); })
      .catch(() => { if (active) setSite(null); });
    return () => { active = false; };
  }, [convexUrl, slug]);

  if (!convexUrl) return <PublicSiteRoute slug={slug} />;
  if (site === undefined) return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui" }}>Loading storefront…</main>;
  if (site === null) return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui" }}>This storefront is not published.</main>;
  return <PublicSiteRoute slug={slug} site={site} />;
}
