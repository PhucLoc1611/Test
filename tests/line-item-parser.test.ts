import { describe, expect, it } from "vitest";
import { parsePage } from "@/src/lib/line-item-parser";

describe("parsePage", () => {
  it("extracts a clear quantity with exact page evidence", () => {
    const result = parsePage({
      page: 2,
      text: "Concrete blocks 24 each",
    });

    expect(result.items).toEqual([
      {
        description: "Concrete blocks",
        quantity: 24,
        unit: "each",
        evidence: { page: 2, sourceText: "Concrete blocks 24 each", sourceType: "text" },
      },
    ]);
    expect(result.refusals).toHaveLength(0);
  });

  it("refuses a row without a quantity", () => {
    const result = parsePage({ page: 1, text: "Delivery address Auckland" });

    expect(result.items).toHaveLength(0);
    expect(result.refusals[0]).toMatchObject({
      page: 1,
      reason: "QUANTITY_NOT_FOUND",
    });
  });

  it("refuses a row with multiple plausible quantities", () => {
    const result = parsePage({ page: 1, text: "Roofing screws 10 boxes 250 each" });

    expect(result.items).toHaveLength(0);
    expect(result.refusals[0]).toMatchObject({
      reason: "AMBIGUOUS_QUANTITY",
    });
  });

  it("keeps valid rows when another row is refused", () => {
    const result = parsePage({
      page: 3,
      text: "\nTimber 12 lengths\nUnlabelled material row\n",
    });

    expect(result.items[0]?.quantity).toBe(12);
    expect(result.refusals).toHaveLength(1);
  });

  it("never emits a quantity that is absent from source text", () => {
    const result = parsePage({ page: 1, text: "Bricks twelve pallets" });

    for (const item of result.items) {
      expect(item.evidence.sourceText).toContain(String(item.quantity));
    }
  });

  it("uses x/y coordinates to select quantity and unit from a table row", () => {
    const result = parsePage({
      page: 1,
      text: "1 GIB board 2400x1200 48 sheet $24.90 $1,195.20",
      textItems: [
        { text: "1", x: 10, y: 100 },
        { text: "GIB board 2400x1200", x: 30, y: 100 },
        { text: "48", x: 300, y: 100 },
        { text: "sheet", x: 340, y: 100 },
        { text: "$24.90", x: 400, y: 100 },
        { text: "$1,195.20", x: 470, y: 100 },
      ],
    });

    expect(result.items[0]).toMatchObject({ description: "GIB board 2400x1200", quantity: 48, unit: "sheet" });
    expect(result.items[0]?.evidence.sourceText).toContain("48 sheet");
    expect(result.refusals).toHaveLength(0);
  });

  it("groups nearby baselines into one coordinate row", () => {
    const result = parsePage({
      page: 1,
      text: "1 GIB board 2400x1200 48 sheet $24.90 $1,195.20",
      textItems: [
        { text: "1", x: 10, y: 100 },
        { text: "GIB board 2400x1200", x: 30, y: 101 },
        { text: "48", x: 300, y: 100 },
        { text: "sheet", x: 340, y: 101 },
        { text: "$24.90", x: 400, y: 100 },
        { text: "$1,195.20", x: 470, y: 101 },
      ],
    });

    expect(result.items[0]).toMatchObject({ description: "GIB board 2400x1200", quantity: 48, unit: "sheet" });
    expect(result.refusals).toHaveLength(0);
  });

  it("does not use flattened text to guess a coordinate row", () => {
    const result = parsePage({
      page: 1,
      text: "GIB board 2400x1200 48 12",
      textItems: [
        { text: "GIB board 2400x1200", x: 30, y: 100 },
        { text: "48", x: 300, y: 100 },
        { text: "12", x: 400, y: 100 },
      ],
    });

    expect(result.items).toHaveLength(0);
    expect(result.refusals[0]?.reason).toBe("AMBIGUOUS_COORDINATE_QUANTITY");
  });

  it("ignores a unit word in the description and uses the unit after quantity", () => {
    const result = parsePage({
      page: 1,
      text: "5 Plasterboard screws 32mm (box of 1000) 8 box $42.00 $336.00",
      textItems: [
        { text: "5", x: 10, y: 100 },
        { text: "Plasterboard screws 32mm (box of 1000)", x: 30, y: 100 },
        { text: "8", x: 300, y: 100 },
        { text: "box", x: 340, y: 100 },
        { text: "$42.00", x: 400, y: 100 },
        { text: "$336.00", x: 470, y: 100 },
      ],
    });

    expect(result.items[0]).toMatchObject({ description: "Plasterboard screws 32mm (box of 1000)", quantity: 8, unit: "box" });
    expect(result.refusals).toHaveLength(0);
  });

  it("handles a description that ends with the same unit as the unit column", () => {
    const result = parsePage({
      page: 1,
      text: "4 Wet area membrane roll 2 roll $189.00 $378.00",
      textItems: [
        { text: "4", x: 10, y: 100 },
        { text: "Wet area membrane roll", x: 30, y: 100 },
        { text: "2", x: 300, y: 100 },
        { text: "roll", x: 340, y: 100 },
        { text: "$189.00", x: 400, y: 100 },
        { text: "$378.00", x: 470, y: 100 },
      ],
    });

    expect(result.items[0]).toMatchObject({ description: "Wet area membrane roll", quantity: 2, unit: "roll" });
    expect(result.refusals).toHaveLength(0);
  });
});
