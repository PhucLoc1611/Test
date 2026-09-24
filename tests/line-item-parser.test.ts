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
});
