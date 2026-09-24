import type { PdfPage, Refusal } from "@/src/domain/extraction";
import path from "node:path";
import { pathToFileURL } from "node:url";

export class NoTextLayerError extends Error {
  readonly code = "NO_TEXT_LAYER";

  constructor() {
    super("This PDF does not contain selectable text.");
    this.name = "NoTextLayerError";
  }
}

export type PdfTextResult = {
  pages: PdfPage[];
  refusals: Refusal[];
};

export function assertPdfBuffer(buffer: Buffer): void {
  const header = buffer.subarray(0, 5).toString("ascii");
  if (header !== "%PDF-") {
    throw new Error("INVALID_PDF");
  }
}

export async function extractTextByPage(buffer: Buffer): Promise<PdfTextResult> {
  assertPdfBuffer(buffer);

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useWorkerFetch: false,
    standardFontDataUrl: pathToFileURL(
      path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts") + path.sep,
    ).href,
  }).promise;
  const pages: PdfPage[] = [];
  const refusals: Refusal[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    try {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = new Map<number, string[]>();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = "transform" in item ? Math.round(item.transform[5]) : 0;
        const current = lines.get(y) ?? [];
        current.push(item.str.trim());
        lines.set(y, current);
      }

      const text = [...lines.entries()]
        .sort(([left], [right]) => right - left)
        .map(([, values]) => values.join(" ").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n");

      if (text) pages.push({ page: pageNumber, text });
      else {
        refusals.push({
          page: pageNumber,
          reason: "PAGE_HAS_NO_TEXT",
          userMessage: "This page has no selectable text, so the text reader could not safely read quantities. Try Gemini AI for this PDF.",
        });
      }
    } catch {
      refusals.push({
        page: pageNumber,
        reason: "PAGE_TEXT_EXTRACTION_FAILED",
        userMessage: "The text reader could not read this page, so quantities on it were not extracted. Try Gemini AI for this PDF.",
      });
    }
  }

  if (pages.length === 0) throw new NoTextLayerError();
  return { pages, refusals };
}

export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  assertPdfBuffer(buffer);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useWorkerFetch: false,
    standardFontDataUrl: pathToFileURL(
      path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts") + path.sep,
    ).href,
  }).promise;
  return document.numPages;
}
