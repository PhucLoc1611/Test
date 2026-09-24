import { describe, expect, it } from "vitest";
import { shouldReuseDocument } from "@/src/lib/reprocess";

describe("shouldReuseDocument", () => {
  it("reuses completed results when force is false", () => {
    expect(shouldReuseDocument("completed", false)).toBe(true);
    expect(shouldReuseDocument("completed_with_refusals", false)).toBe(true);
  });

  it("bypasses a completed result when force is true", () => {
    expect(shouldReuseDocument("completed", true)).toBe(false);
  });

  it("never reuses failed results", () => {
    expect(shouldReuseDocument("failed", false)).toBe(false);
  });
});
