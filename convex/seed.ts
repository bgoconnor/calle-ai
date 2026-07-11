import { mutation } from "./_generated/server";

// Idempotent seed for the two demo businesses. Run with:
//   npx convex run seed:seedAll
// Safe to run repeatedly — it skips businesses/jobs that already exist.

const SEED = [
  {
    slug: "yucatasia",
    name: "Yucatasia",
    type: "restaurant",
    languages: ["es", "en"],
    address: "San Francisco, CA",
    notes:
      "Yucatán-focused restaurant — concept demo only, not affiliated with any real business.",
    guardrails:
      "Preserve original Spanish dish names; explain unfamiliar regional items to English speakers; never guess prices.",
  },
  {
    slug: "chelys",
    name: "Chely's",
    type: "salon",
    languages: ["es", "en"],
    address: "San Francisco, CA",
    notes:
      "Spanish-first salon services — concept demo only, not affiliated with any real business.",
    guardrails:
      "Spanish-first service names with concise English explanations; never guess prices.",
  },
];

export const seedAll = mutation({
  args: {},
  handler: async (ctx) => {
    const result = [];
    for (const b of SEED) {
      const existing = await ctx.db
        .query("businesses")
        .withIndex("by_slug", (q) => q.eq("slug", b.slug))
        .unique();

      const businessId =
        existing?._id ??
        (await ctx.db.insert("businesses", {
          slug: b.slug,
          name: b.name,
          type: b.type,
          languages: b.languages,
          address: b.address,
          notes: b.notes,
        }));

      // Create one stub queued job per business if none exists yet.
      const jobs = await ctx.db
        .query("jobs")
        .withIndex("by_business", (q) => q.eq("businessId", businessId))
        .collect();

      let jobId = jobs[0]?._id;
      if (!jobId) {
        jobId = await ctx.db.insert("jobs", {
          businessId,
          status: "queued",
          requiredDeliverables: [
            "microsite",
            "catalog",
            "gbp_pack",
            "report",
          ],
          guardrails: b.guardrails,
        });
      }

      result.push({ slug: b.slug, businessId, jobId });
    }
    return result;
  },
});
