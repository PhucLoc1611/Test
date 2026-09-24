import { describe, expect, it } from "vitest";
import { chooseExtractionMode } from "@/src/lib/extraction-mode";

describe("chooseExtractionMode", () => {
  it("uses deterministic extraction for a fully text-based PDF", () => {
    expect(chooseExtractionMode({ hasTextPages: true, hasPagesWithoutText: false })).toBe("deterministic");
  });

  it("uses AI for a scanned PDF", () => {
    expect(chooseExtractionMode({ hasTextPages: false, hasPagesWithoutText: true })).toBe("ai");
  });

  it("uses AI for a hybrid PDF so image pages are not silently skipped", () => {
    expect(chooseExtractionMode({ hasTextPages: true, hasPagesWithoutText: true })).toBe("ai");
  });
});
