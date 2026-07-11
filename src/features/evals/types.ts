export type EvalText = {
  sourceLanguage: "es" | "en";
  original: string;
  es: string;
  en: string;
};

export type EvalMenuItem = {
  id: string;
  name: EvalText;
  description: EvalText | null;
  price: string | null;
  sourceUrls: string[];
};

export type EvalMenu = {
  sections: Array<{
    id: string;
    name: EvalText;
    items: EvalMenuItem[];
  }>;
};

export type EvalRun = {
  id: string;
  label: string;
  runner: "baseline" | "agency";
  model: string;
  prompt: string;
  menu: EvalMenu;
  durationMs: number;
  costUsd: number;
  toolCalls: number;
};

export type EvalScore = {
  overall: number;
  itemPrecision: number;
  itemRecall: number;
  priceAccuracy: number;
  translationCoverage: number;
  sourcePreservation: number;
  unsupportedItems: string[];
  missingItems: string[];
  wrongPrices: string[];
};
