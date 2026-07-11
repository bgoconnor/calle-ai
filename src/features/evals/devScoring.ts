import type { ControlArtifact } from "../control-room";
import type { EvalMenu, EvalText } from "./types";

const fallbackText = (original: string): EvalText => ({
  original,
  sourceLanguage: "es",
  es: original,
  en: original,
});

export function adaptAgencyMenu(artifacts: ControlArtifact[]): EvalMenu | null {
  const normalized = [...artifacts].reverse().find((artifact) => artifact.kind === "normalized_menu")?.payload as any;
  const localized = [...artifacts].reverse().find((artifact) => artifact.kind === "bilingual_content")?.payload as any;
  if (!Array.isArray(normalized?.sections)) return null;
  const translations = new Map((localized?.items ?? []).map((item: any) => [item.menuItemId, item]));

  return {
    sections: normalized.sections.map((section: any) => ({
      id: String(section.id),
      name: fallbackText(String(section.originalName ?? section.id)),
      items: (section.items ?? []).map((item: any) => {
        const translation: any = translations.get(item.id);
        const sourceLanguage = translation?.sourceLanguage === "en" ? "en" : "es";
        const name = translation?.name
          ? { sourceLanguage, original: String(item.originalName), es: String(translation.name.es), en: String(translation.name.en) }
          : fallbackText(String(item.originalName));
        const description = translation?.description
          ? { sourceLanguage, original: String(item.originalDescription ?? ""), es: String(translation.description.es), en: String(translation.description.en) }
          : null;
        return {
          id: String(item.id),
          name,
          description,
          price: item.price == null ? null : String(item.price),
          sourceUrls: Array.isArray(item.sourceUrls) ? item.sourceUrls.map(String) : [],
        };
      }),
    })),
  };
}

export type MenuSummary = {
  sections: number;
  items: number;
  priced: number;
  sourced: number;
  bilingual: number;
  descriptions: number;
};

export function summarizeMenu(menu: EvalMenu | null | undefined): MenuSummary {
  const items = menu?.sections.flatMap((section) => section.items) ?? [];
  return {
    sections: menu?.sections.length ?? 0,
    items: items.length,
    priced: items.filter((item) => item.price).length,
    sourced: items.filter((item) => item.sourceUrls.length).length,
    bilingual: items.filter((item) => item.name.es.trim() && item.name.en.trim() && (!item.description || (item.description.es.trim() && item.description.en.trim()))).length,
    descriptions: items.filter((item) => item.description).length,
  };
}
