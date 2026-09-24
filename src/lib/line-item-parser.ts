import type { LineItem, PdfPage, Refusal } from "@/src/domain/extraction";

type NumberToken = {
  raw: string;
  value: number;
  index: number;
};

const UNIT_WORDS = new Set([
  "each",
  "ea",
  "unit",
  "units",
  "box",
  "boxes",
  "pack",
  "packs",
  "length",
  "lengths",
  "kg",
  "g",
  "t",
  "m",
  "mm",
  "m2",
  "m²",
  "m3",
  "m³",
]);

const HEADER_WORDS = /^(date|delivery date|invoice|invoice no|invoice number|page|subtotal|total|gst|tax|amount|address)\b/i;

function numberTokens(line: string): NumberToken[] {
  return [...line.matchAll(/\b\d+(?:[.,]\d+)?\b/g)].map((match) => ({
    raw: match[0],
    value: Number(match[0].replace(",", ".")),
    index: match.index ?? 0,
  }));
}

function refusal(page: number, sourceText: string, reason: string, userMessage: string): Refusal {
  return { page, sourceText, reason, userMessage };
}

function parseLine(page: PdfPage, rawLine: string): { item?: LineItem; refusal?: Refusal } {
  const sourceText = rawLine.trim();
  if (!sourceText) return {};

  if (HEADER_WORDS.test(sourceText)) return {};

  const tokens = numberTokens(sourceText);
  if (tokens.length === 0) {
    return {
      refusal: refusal(
        page.page,
        sourceText,
        "QUANTITY_NOT_FOUND",
        "We could not find a clear numeric quantity on this line, so it was left out.",
      ),
    };
  }

  if (tokens.length > 1) {
    return {
      refusal: refusal(
        page.page,
        sourceText,
        "AMBIGUOUS_QUANTITY",
        "This line contains more than one possible quantity, so we did not guess which one to use.",
      ),
    };
  }

  const token = tokens[0];
  const before = sourceText.slice(0, token.index).trim();
  const after = sourceText.slice(token.index + token.raw.length).trim();
  const afterWords = after.split(/\s+/).filter(Boolean);
  const unit = afterWords[0]?.replace(/[,:;]+$/, "");
  const description = before.replace(/[|,:;\-]+$/, "").trim();

  if (!description) {
    return {
      refusal: refusal(
        page.page,
        sourceText,
        "DESCRIPTION_NOT_FOUND",
        "We found a number but could not identify what it measures, so we left it out.",
      ),
    };
  }

  if (unit && !UNIT_WORDS.has(unit.toLowerCase())) {
    return {
      refusal: refusal(
        page.page,
        sourceText,
        "UNRECOGNISED_UNIT",
        "We found a quantity but could not confidently identify its unit, so we left this line out.",
      ),
    };
  }

  if (!sourceText.includes(token.raw)) {
    return {
      refusal: refusal(
        page.page,
        sourceText,
        "EVIDENCE_NOT_VERIFIED",
        "The extracted quantity could not be verified against the original line.",
      ),
    };
  }

  return {
    item: {
      description,
      quantity: token.value,
      ...(unit ? { unit } : {}),
      evidence: { page: page.page, sourceText, sourceType: "text" },
    },
  };
}

export function parsePage(page: PdfPage): { items: LineItem[]; refusals: Refusal[] } {
  const items: LineItem[] = [];
  const refusals: Refusal[] = [];

  for (const rawLine of page.text.split(/\r?\n/)) {
    const parsed = parseLine(page, rawLine);
    if (parsed.item) items.push(parsed.item);
    if (parsed.refusal) refusals.push(parsed.refusal);
  }

  return { items, refusals };
}
