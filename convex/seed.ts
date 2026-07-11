import { mutation } from "./_generated/server";

/** Creates the named eval set required by the rubric. Safe to run once per dev deployment. */
export const seedEvalCases = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("evalCases").collect();
    if (existing.length) return { created: 0, message: "Eval set already exists" };
    const cases = [
      ["yucatasia-photo-menu", "restaurant", "Cochinita Pibil / Panuchos", { preserveOriginalNames: true, inventPrices: false, citeResearch: true }],
      ["bakery-spanish-menu", "restaurant", "Pan dulce / Café de olla", { preserveOriginalNames: true, inventPrices: false, citeResearch: true }],
      ["taqueria-low-contrast-menu", "restaurant", "unreadable photo", { escalateLowConfidence: true, inventPrices: false }],
      ["chelys-services", "salon", "Planchado de cejas / Rizado de pestañas", { preserveOriginalNames: true, inventPrices: false }],
      ["barber-service-list", "salon", "Corte clásico / Afeitado", { preserveOriginalNames: true, inventPrices: false }],
    ];
    for (const [name, category, input, expected] of cases) await ctx.db.insert("evalCases", { name: name as string, category: category as string, input, expected, active: true });
    return { created: cases.length };
  },
});

/** Seed three distinct ready-to-run jobs used by the demo and eval walkthrough. */
export const seedDemoJobs = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("businesses").collect();
    if (existing.length) return { created: 0, message: "Businesses already exist; no duplicate demo data created" };
    const timestamp = Date.now();
    const demos = [
      { name: "Yucatasia", slug: "yucatasia", city: "San Francisco", category: "Yucatán restaurant", brief: "Create a Spanish-first bilingual microsite for Yucatasia in the Mission. Preserve regional Yucatán dish names, explain them for English-speaking visitors, and never guess prices.", urls: ["https://maps.google.com/?q=Yucatasia+San+Francisco"] },
      { name: "Chely's Beauty Salon", slug: "chelys-beauty-salon", city: "San Francisco", category: "beauty salon", brief: "Turn Chely's Maps listing and Spanish-first service photos into a polished Spanish-English microsite. Keep the storefront's bright pink, aqua, and lavender energy.", urls: ["https://maps.google.com/?q=Chelys+Beauty+Salon+San+Francisco"] },
      { name: "Mission Panadería", slug: "mission-panaderia", city: "San Francisco", category: "bakery", brief: "Create a bilingual bakery menu and mobile microsite from photographed Spanish menu cards. Preserve original names and mark unclear pricing for review.", urls: [] },
    ];
    const jobs = [];
    for (const demo of demos) {
      const businessId = await ctx.db.insert("businesses", { name: demo.name, slug: demo.slug, city: demo.city, category: demo.category, primaryLanguage: "es", secondaryLanguage: "en", publishStatus: "draft", createdAt: timestamp, updatedAt: timestamp });
      const structuredBrief = { objective: "Create bilingual local-presence pack", business: { name: demo.name, city: demo.city, category: demo.category }, languages: { primary: "es", secondary: "en" }, deliverables: ["bilingual microsite", "structured catalog", "listing improvement pack", "delivery report"], guardrails: ["Preserve original names", "Do not invent business facts", "Escalate low confidence"], sourceStrategy: ["public sources", "operator assets"] };
      const jobId = await ctx.db.insert("jobs", { businessId, brief: demo.brief, status: "brief_review", structuredBrief, requiredDeliverables: structuredBrief.deliverables, sourceUrls: demo.urls, createdAt: timestamp, updatedAt: timestamp });
      await ctx.db.insert("memory", { businessId, layer: "business_history", key: "seed-context", value: { audience: "Spanish-first local business", demo: true }, updatedAt: timestamp });
      jobs.push({ businessId, jobId, slug: demo.slug });
    }
    return { created: jobs.length, jobs };
  },
});
