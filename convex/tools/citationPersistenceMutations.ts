import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const citationOrigin = v.union(
  v.literal("linkup"),
  v.literal("source_asset"),
  v.literal("business_fact"),
);

// Internal storage primitive used by citations.persist. Keeping the database
// write here lets action-based tools remain small and easy to mock.
export const persistCitationBatch = internalMutation({
  args: {
    jobId: v.id("jobs"),
    artifactId: v.optional(v.id("artifacts")),
    citations: v.array(
      v.object({
        claim: v.string(),
        sourceUrl: v.string(),
        sourceTitle: v.optional(v.string()),
        snippet: v.optional(v.string()),
        origin: citationOrigin,
      }),
    ),
  },
  handler: async (ctx, { jobId, artifactId, citations }) => {
    const citationIds = [];

    for (const citation of citations) {
      citationIds.push(
        await ctx.db.insert("citations", {
          jobId,
          ...(artifactId ? { artifactId } : {}),
          ...citation,
        }),
      );
    }

    return { citationIds };
  },
});
