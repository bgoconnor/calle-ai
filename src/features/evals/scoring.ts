import type { EvalMenu, EvalMenuItem, EvalScore } from "./types";

const key = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, " ").trim();
const items = (menu: EvalMenu) => menu.sections.flatMap((section) => section.items);

export function scoreMenu(output: EvalMenu, truth: EvalMenu): EvalScore {
  const expected = new Map(items(truth).map((item) => [key(item.name.original), item]));
  const actual = new Map(items(output).map((item) => [key(item.name.original), item]));
  const matched = [...actual.entries()].filter(([name]) => expected.has(name));
  const unsupportedItems = [...actual.entries()].filter(([name]) => !expected.has(name)).map(([, item]) => item.name.original);
  const missingItems = [...expected.entries()].filter(([name]) => !actual.has(name)).map(([, item]) => item.name.original);
  const priced = matched.filter(([name]) => expected.get(name)?.price);
  const wrongPrices = priced
    .filter(([name, item]) => item.price !== expected.get(name)?.price)
    .map(([, item]) => item.name.original);
  const allActual = items(output);
  const translated = allActual.filter((item) =>
    item.name.es.trim() && item.name.en.trim() &&
    (!item.description || (item.description.es.trim() && item.description.en.trim())),
  );
  const preserved = allActual.filter((item) => {
    const originalField = item.name.sourceLanguage === "es" ? item.name.es : item.name.en;
    const originalDescription = item.description
      ? (item.description.sourceLanguage === "es" ? item.description.es : item.description.en)
      : null;
    return originalField === item.name.original && (!item.description || originalDescription === item.description.original);
  });
  const itemPrecision = actual.size ? matched.length / actual.size : 0;
  const itemRecall = expected.size ? matched.length / expected.size : 0;
  const priceAccuracy = priced.length ? (priced.length - wrongPrices.length) / priced.length : 1;
  const translationCoverage = allActual.length ? translated.length / allActual.length : 0;
  const sourcePreservation = allActual.length ? preserved.length / allActual.length : 0;
  const overall = itemPrecision * .3 + itemRecall * .3 + priceAccuracy * .15 + translationCoverage * .15 + sourcePreservation * .1;

  return {
    overall,
    itemPrecision,
    itemRecall,
    priceAccuracy,
    translationCoverage,
    sourcePreservation,
    unsupportedItems,
    missingItems,
    wrongPrices,
  };
}

export const percent = (value: number) => `${Math.round(value * 100)}%`;
