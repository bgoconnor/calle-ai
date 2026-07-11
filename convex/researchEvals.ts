import { action } from "./_generated/server";
import { prepareMenuGeneratorHandoff } from "./agents/menuEvidence";

const authoritativeSources = {
  selectedSourceUrls: ["https://example.restaurant/menu"],
};

const completeMenu = {
  sections: [{
    id: "mains",
    originalName: "Platos",
    items: [{
      id: "cochinita-pibil",
      originalName: "Cochinita Pibil",
      sourceUrls: ["https://example.restaurant/menu"],
    }],
  }],
  conflicts: [],
  likelyComplete: true,
  completenessReason: "All official sections were captured.",
};

const CASES = [
  { name: "authoritative_complete_menu", menu: completeMenu, sources: authoritativeSources, expected: true },
  { name: "missing_authoritative_source", menu: completeMenu, sources: { selectedSourceUrls: [] }, expected: false },
  { name: "unsupported_item_source", menu: completeMenu, sources: { selectedSourceUrls: ["https://other.example/menu"] }, expected: false },
  { name: "incomplete_menu", menu: { ...completeMenu, likelyComplete: false, completenessReason: "Only one menu image was found." }, sources: authoritativeSources, expected: false },
  // A recorded conflict is publishable once the manager selects the freshest
  // credible value; provenance enables correction without a human gate.
  { name: "conflicting_prices", menu: { ...completeMenu, conflicts: ["Cochinita Pibil is listed at two prices."] }, sources: authoritativeSources, expected: true },
  { name: "unstable_duplicate_ids", menu: { ...completeMenu, sections: [{ ...completeMenu.sections[0], items: [{ ...completeMenu.sections[0].items[0], id: "mains" }] }] }, sources: authoritativeSources, expected: false },
];

/** Named deterministic contract set for the research/menu → microsite handoff. */
export const runResearchContractEvals = action({
  args: {},
  handler: async () => {
    const results = CASES.map((testCase) => {
      const handoff = prepareMenuGeneratorHandoff(testCase.menu, { highlights: [] }, testCase.sources);
      return {
        name: testCase.name,
        expectedPublishable: testCase.expected,
        actualPublishable: handoff.publishable,
        blockerCodes: handoff.blockers.map((blocker) => blocker.code),
        passed: handoff.publishable === testCase.expected,
      };
    });
    return {
      suite: "research-menu-microsite-contract.v1",
      passed: results.every((result) => result.passed),
      passCount: results.filter((result) => result.passed).length,
      total: results.length,
      results,
    };
  },
});
