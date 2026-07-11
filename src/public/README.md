# Calle AI public microsites

This folder is deliberately isolated from the agency workflow, Convex schema, and Cloudflare setup. It renders a customer-facing site from one approved `PublishedSite` record.

## Entrypoints

- `PublicMicrosite.tsx` — pure responsive renderer. It owns the ES/EN toggle and all public-site visual components.
- `PublicSiteRoute.tsx` — thin route adapter for a `/b/:slug` page. It accepts a site record as a prop during production and uses mocks locally.
- `types.ts` — shared contract that the agency engine should return after content approval.
- `mockSites.ts` — concept/demo records for `yucatasia` and `chelys-beauty-salon`; replace these at runtime, do not use them for production data.
- `public-site.css` — all isolated public-site styling.

## App-router integration

For React Router:

```tsx
<Route path="/b/:slug" element={<PublishedSitePage />} />

function PublishedSitePage() {
  const { slug = "" } = useParams();
  const site = useQuery(api.sites.getPublishedBySlug, { slug });
  if (site === undefined) return <Loading />;
  return <PublicSiteRoute slug={slug} site={site ?? undefined} />;
}
```

`getPublishedBySlug` must return `null` for unpublished/deleted site versions. The production page should never render a draft.

## Required backend contract

The public page expects `PublishedSite` exactly as defined in `types.ts`:

- `slug`, `kind`, and `theme` select the published route and visual treatment.
- all visitor-facing copy is bilingual via `{ es, en }` objects.
- source-language names remain in `sections[].items[].name`.
- business facts live under `business.contact`.
- `conceptLabel` is a safe concept-demo/footer disclosure; production can replace it with normal business attribution.

For the hackathon, backend should return the most recent approved/published immutable site version. The renderer should not receive research drafts, agent trace data, confidence flags, or raw source materials.

## Type conversion note

Convex documents can be mapped to this frontend type in one query/action layer. Keep that mapper outside this folder so schema migrations do not affect the visual renderer.
