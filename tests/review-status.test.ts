import { describe, expect, it } from "vitest";
import { requiresHumanReview } from "@/src/lib/review-status";

describe("requiresHumanReview", () => {
  it("requires review for every AI result, even when no refusal was returned", () => {
    expect(requiresHumanReview({ processingMode: "ai", refusalCount: 0 })).toBe(true);
  });

  it("allows a fully deterministic result without refusals to be completed", () => {
    expect(requiresHumanReview({ processingMode: "deterministic", refusalCount: 0 })).toBe(false);
  });

  it("requires review when deterministic extraction contains refusals", () => {
    expect(requiresHumanReview({ processingMode: "deterministic", refusalCount: 1 })).toBe(true);
  });
});
