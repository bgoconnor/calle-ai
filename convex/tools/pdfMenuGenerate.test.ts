import assert from "node:assert/strict";
import test from "node:test";
import { generatePdfMenu } from "./pdfMenuGenerate.ts";

test("renders only normalized items and preserves prices", async () => {
  const result = await generatePdfMenu({}, {
    normalizedMenuArtifactId: "menu-7",
    bilingualContentArtifactId: "copy-4",
    normalizedMenu: { sections: [{ id: "mains", originalName: "Mains", items: [
      { id: "taco", originalName: "Taco", originalDescription: null, price: "$7.50" },
    ] }] },
    bilingualContent: { items: [
      { menuItemId: "taco", name: { en: "Taco", es: "Taco" }, description: null },
      { menuItemId: "invented", name: { en: "Invented", es: "Inventado" }, description: null },
    ] },
  });
  const pdf = Buffer.from(result.dataUrl.split(",")[1], "base64").toString("latin1");
  assert.equal(result.itemCount, 1);
  assert.deepEqual(result.sourceArtifactIds, ["menu-7", "copy-4"]);
  assert.match(pdf, /Taco \$7\.50/);
  assert.doesNotMatch(pdf, /Invented/);
});

test("reports missing localization without blocking printable original text", async () => {
  const result = await generatePdfMenu({}, {
    normalizedMenuArtifactId: "menu-1",
    bilingualContentArtifactId: "copy-1",
    normalizedMenu: { sections: [{ id: "soups", items: [
      { id: "soup", originalName: "Sopa", originalDescription: "Caldo", price: null },
    ] }] },
    bilingualContent: { items: [] },
  });
  assert.deepEqual(result.warnings, ["No bilingual handoff for item soup; original text retained."]);
});

test("refuses an empty normalized menu", async () => {
  await assert.rejects(() => generatePdfMenu({}, {
    normalizedMenuArtifactId: "menu-empty",
    bilingualContentArtifactId: "copy-empty",
    normalizedMenu: { sections: [] },
    bilingualContent: { items: [] },
  }), /at least one normalized menu item/);
});
