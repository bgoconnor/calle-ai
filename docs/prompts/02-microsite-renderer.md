# Prompt 02 — customer microsite renderer

You own `src/public/**`. Read its README and treat `src/public/types.ts` as the canonical `PublishedSite` contract. Extend the existing Yucatasia and Chely's implementation; do not create a second renderer or type.

Deliver production-quality `/b/:slug` microsites driven entirely by an approved `PublishedSite` record:

- Spanish-first ES/EN toggle
- restaurant and salon/service layouts
- hero, story, menu/services, contextual guide, FAQs, hours, address, phone, and Maps CTA
- original-language names preserved
- responsive mobile and desktop presentation
- accessible navigation, headings, controls, focus states, and contrast
- unpublished/not-found/loading behavior through the route adapter
- concept disclosure for seeded demonstrations

Yucatasia should use warm Mission/Yucatán art direction: achiote, maize, jade, ink, and paper textures without stereotypes. Chely's should use the storefront's vivid pink, aqua, lavender, and neighborhood-signage energy.

Do not edit Convex, the Worker, control-room files, intake files, root deployment configuration, or `src/main.tsx`. If backend data needs normalization, create an adapter under `src/public/` rather than changing the shared contract.

Acceptance:

- both seeded slugs render from existing mocks
- language switching covers all visitor-facing copy
- a backend `PublishedSite` can replace mocks without component changes
- no draft, trace, confidence, or raw research data leaks onto the public page
- `npm run typecheck` and `npm run build` pass
- document the route integration in `src/public/README.md`
