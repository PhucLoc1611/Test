import type { LineItem, PdfPage, PdfTextItem, Refusal } from "@/src/domain/extraction";

type NumberToken = {
  raw: string;
  value: number;
  index: number;
};

type PositionedToken = NumberToken & { x: number; y: number };

const UNIT_WORDS = new Set([
  "each",
  "ea",
  "unit",
  "units",
  "box",
  "boxes",
  "pack",
  "packs",
  "piece",
  "pieces",
  "pc",
  "pcs",
  "sheet",
  "sheets",
  "bag",
  "bags",
  "pallet",
  "pallets",
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

function positionedTokens(items: PdfTextItem[]): PositionedToken[] {
  return items.flatMap((item) => [...item.text.matchAll(/\S+/g)].map((match) => ({
    raw: match[0],
    value: Number(match[0].replace(",", ".")),
    index: match.index ?? 0,
    x: item.x + (match.index ?? 0),
    y: item.y,
  })));
}

function parseCoordinateRow(page: PdfPage, row: PdfTextItem[]): { item?: LineItem; refusal?: Refusal } {
  const ordered = positionedTokens([...row].sort((left, right) => left.x - right.x));
  const sourceText = [...row].sort((left, right) => left.x - right.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
  if (!sourceText || HEADER_WORDS.test(sourceText)) return {};

  const unitTokens = ordered.filter((token) => UNIT_WORDS.has(token.raw.toLowerCase().replace(/[,:;]+$/, "")));
  if (unitTokens.length !== 1) return parseLine(page, sourceText);

  const unitToken = unitTokens[0];
  const quantityCandidates = ordered.filter((token) =>
    token.x < unitToken.x && /^\d+(?:[.,]\d+)?$/.test(token.raw),
  );
  const quantity = quantityCandidates.at(-1);
  if (!quantity) {
    return refusalResult(page, sourceText, "QUANTITY_NOT_FOUND", "We found a unit but no clearly preceding quantity, so we left this line out.");
  }

  const descriptionTokens = ordered
    .filter((token) => token.x < quantity.x)
    .map((token) => token.raw);
  if (/^\d+$/.test(descriptionTokens[0] ?? "")) descriptionTokens.shift();
  const description = descriptionTokens.join(" ").replace(/[|,:;\-]+$/, "").trim();
  if (!description) {
    return refusalResult(page, sourceText, "DESCRIPTION_NOT_FOUND", "We found a quantity but could not identify its description, so we left this line out.");
  }

  return {
    item: {
      description,
      quantity: quantity.value,
      unit: unitToken.raw.replace(/[,:;]+$/, ""),
      evidence: { page: page.page, sourceText, sourceType: "text" },
    },
  };
}

function refusalResult(page: PdfPage, sourceText: string, reason: string, userMessage: string): { refusal: Refusal } {
  return { refusal: refusal(page.page, sourceText, reason, userMessage) };
}

export function parsePage(page: PdfPage): { items: LineItem[]; refusals: Refusal[] } {
  const items: LineItem[] = [];
  const refusals: Refusal[] = [];

  if (page.textItems?.length) {
    const rows = new Map<number, PdfTextItem[]>();
    for (const textItem of page.textItems) {
      const row = rows.get(textItem.y) ?? [];
      row.push(textItem);
      rows.set(textItem.y, row);
    }
    for (const row of rows.values()) {
      const parsed = parseCoordinateRow(page, row);
      if (parsed.item) items.push(parsed.item);
      if (parsed.refusal) refusals.push(parsed.refusal);
    }
    return { items, refusals };
  }

  for (const rawLine of page.text.split(/\r?\n/)) {
    const parsed = parseLine(page, rawLine);
    if (parsed.item) items.push(parsed.item);
    if (parsed.refusal) refusals.push(parsed.refusal);
  }

  return { items, refusals };
}
