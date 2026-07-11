export type NormalizedMenuForPdf = {
  sections?: Array<{
    id?: string;
    originalName?: string;
    items?: Array<{
      id?: string;
      originalName?: string;
      originalDescription?: string | null;
      price?: string | null;
    }>;
  }>;
};

export type BilingualContentForPdf = {
  items?: Array<{
    menuItemId?: string;
    name?: { en?: string | null; es?: string | null };
    description?: { en?: string | null; es?: string | null } | null;
  }>;
};

export type PdfMenuGenerateInput = {
  normalizedMenuArtifactId: string;
  bilingualContentArtifactId: string;
  normalizedMenu: NormalizedMenuForPdf;
  bilingualContent: BilingualContentForPdf;
};

export type PdfMenuGenerateOutput = {
  contract: "printable-menu-pdf.v1";
  filename: "menu.pdf";
  mediaType: "application/pdf";
  dataUrl: string;
  pageCount: number;
  itemCount: number;
  sourceArtifactIds: [string, string];
  warnings: string[];
};

type Line = { text: string; size: number; bold?: boolean; indent?: number };

const ascii = (value: unknown) => String(value ?? "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^\x20-\x7e]/g, "?");

const pdfEscape = (value: string) => ascii(value)
  .replace(/\\/g, "\\\\")
  .replace(/\(/g, "\\(")
  .replace(/\)/g, "\\)");

function wrap(text: string, width: number): string[] {
  const words = ascii(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    output += alphabet[a >> 2];
    output += alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)];
    output += b === undefined ? "=" : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)];
    output += c === undefined ? "=" : alphabet[c & 63];
  }
  return output;
}

function buildPdf(pages: Line[][]): string {
  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };
  const catalogId = add("");
  const pagesId = add("");
  const regularFontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds: number[] = [];
  for (const lines of pages) {
    let y = 756;
    const commands = lines.map((line) => {
      const cmd = `BT /${line.bold ? "F2" : "F1"} ${line.size} Tf ${54 + (line.indent ?? 0)} ${y} Td (${pdfEscape(line.text)}) Tj ET`;
      y -= line.size + (line.size >= 18 ? 10 : 5);
      return cmd;
    }).join("\n");
    const contentId = add(`<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

export async function generatePdfMenu(
  _context: unknown,
  input: PdfMenuGenerateInput,
): Promise<PdfMenuGenerateOutput> {
  const localized = new Map((input.bilingualContent.items ?? []).map((item) => [item.menuItemId, item]));
  const warnings: string[] = [];
  const lines: Line[] = [
    { text: "MENU", size: 26, bold: true },
    { text: "English / Espanol", size: 10 },
    { text: "", size: 5 },
  ];
  let itemCount = 0;
  for (const section of input.normalizedMenu.sections ?? []) {
    lines.push({ text: section.originalName || section.id || "Menu", size: 17, bold: true });
    for (const item of section.items ?? []) {
      if (!item.id || !item.originalName) continue;
      itemCount += 1;
      const translation = localized.get(item.id);
      if (!translation) warnings.push(`No bilingual handoff for item ${item.id}; original text retained.`);
      const names = [translation?.name?.en, translation?.name?.es, item.originalName]
        .filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
      const title = `${names.join(" / ")}${item.price ? `   ${item.price}` : ""}`;
      wrap(title, 68).forEach((text, index) => lines.push({ text, size: 11, bold: index === 0, indent: 8 }));
      const descriptions = [translation?.description?.en, translation?.description?.es, item.originalDescription]
        .filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
      descriptions.forEach((description) => wrap(description, 82).forEach((text) => lines.push({ text, size: 9, indent: 16 })));
      lines.push({ text: "", size: 4 });
    }
  }
  if (!itemCount) throw new Error("PDF menu requires at least one normalized menu item");
  const pages: Line[][] = [];
  let page: Line[] = [];
  let used = 0;
  for (const line of lines) {
    const height = line.size + (line.size >= 18 ? 10 : 5);
    if (page.length && used + height > 690) {
      pages.push(page);
      page = [{ text: "MENU - continued", size: 12, bold: true }];
      used = 30;
    }
    page.push(line);
    used += height;
  }
  if (page.length) pages.push(page);
  const pdf = buildPdf(pages);
  return {
    contract: "printable-menu-pdf.v1",
    filename: "menu.pdf",
    mediaType: "application/pdf",
    dataUrl: `data:application/pdf;base64,${base64(pdf)}`,
    pageCount: pages.length,
    itemCount,
    sourceArtifactIds: [input.normalizedMenuArtifactId, input.bilingualContentArtifactId],
    warnings,
  };
}
