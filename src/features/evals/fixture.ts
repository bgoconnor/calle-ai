import type { EvalMenu, EvalRun, EvalText } from "./types";

const text = (original: string, sourceLanguage: "es" | "en", es: string, en: string): EvalText => ({ original, sourceLanguage, es, en });
const prompt = "Create a comprehensive, normalized, bilingual menu for Yucatasia. Preserve source wording and prices; translate each item into the other language.";

export const groundTruth: EvalMenu = {
  sections: [{
    id: "especialidades",
    name: text("Especialidades", "es", "Especialidades", "Specialties"),
    items: [
      { id: "cochinita-pibil", name: text("Cochinita Pibil", "es", "Cochinita Pibil", "Cochinita Pibil"), description: text("Cerdo marinado en achiote", "es", "Cerdo marinado en achiote", "Pork marinated in achiote"), price: "$18", sourceUrls: ["https://example.com/official-menu"] },
      { id: "relleno-negro", name: text("Relleno Negro", "es", "Relleno Negro", "Relleno Negro"), description: text("Pavo en recado negro", "es", "Pavo en recado negro", "Turkey in recado negro"), price: "$21", sourceUrls: ["https://example.com/official-menu"] },
      { id: "poc-chuc", name: text("Poc Chuc", "es", "Poc Chuc", "Poc Chuc"), description: text("Cerdo asado con cítricos", "es", "Cerdo asado con cítricos", "Citrus-marinated grilled pork"), price: "$20", sourceUrls: ["https://example.com/official-menu"] },
      { id: "panuchos", name: text("Panuchos", "es", "Panuchos", "Panuchos"), description: text("Tortillas rellenas de frijol", "es", "Tortillas rellenas de frijol", "Bean-filled tortillas"), price: "$14", sourceUrls: ["https://example.com/official-menu"] },
    ],
  }],
};

export const sampleRuns: EvalRun[] = [
  {
    id: "sample-baseline",
    label: "Single-call baseline",
    runner: "baseline",
    model: "Same OpenAI model · no tools",
    prompt,
    durationMs: 7_800,
    costUsd: .012,
    toolCalls: 0,
    menu: { sections: [{ id: "menu", name: text("Menu", "en", "Menú", "Menu"), items: [
      { id: "cochinita", name: text("Cochinita Pibil", "es", "Cochinita Pibil", "Cochinita Pibil"), description: null, price: "$16", sourceUrls: [] },
      { id: "panuchos", name: text("Panuchos", "es", "Panuchos", "Panuchos"), description: null, price: null, sourceUrls: [] },
      { id: "yucatan-burrito", name: text("Yucatán Burrito", "en", "Burrito yucateco", "Yucatán Burrito"), description: null, price: "$15", sourceUrls: [] },
    ] }] },
  },
  {
    id: "sample-agency",
    label: "Calle AI agent team",
    runner: "agency",
    model: "Same OpenAI model · Linkup enabled",
    prompt,
    durationMs: 43_200,
    costUsd: .083,
    toolCalls: 2,
    menu: groundTruth,
  },
];
