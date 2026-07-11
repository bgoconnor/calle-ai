import { makeFunctionReference } from "convex/server";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export type CitationOrigin = "linkup" | "source_asset" | "business_fact";

export type CitationToPersist = {
  claim: string;
  sourceUrl: string;
  sourceTitle?: string;
  snippet?: string;
  origin: CitationOrigin;
};

export type CitationsPersistInput = {
  jobId: Id<"jobs">;
  artifactId?: Id<"artifacts">;
  citations: CitationToPersist[];
};

export type CitationsPersistOutput = {
  citationIds: Id<"citations">[];
};

export type CitationPersistenceContext = Pick<ActionCtx, "runMutation">;

const persistCitationBatch = makeFunctionReference<
  "mutation",
  CitationsPersistInput,
  CitationsPersistOutput
>("tools/citationPersistenceMutations:persistCitationBatch");

export async function persistCitations(
  ctx: CitationPersistenceContext,
  input: CitationsPersistInput,
): Promise<CitationsPersistOutput> {
  return await ctx.runMutation(persistCitationBatch, input);
}
