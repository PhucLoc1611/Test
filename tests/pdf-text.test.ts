import { describe, expect, it } from "vitest";
import { assertPdfBuffer } from "@/src/lib/pdf-text";

describe("PDF input validation", () => {
  it("accepts a PDF magic header", () => {
    expect(() => assertPdfBuffer(Buffer.from("%PDF-1.7"))).not.toThrow();
  });

  it("rejects content that is not a PDF", () => {
    expect(() => assertPdfBuffer(Buffer.from("not a pdf"))).toThrow("INVALID_PDF");
  });
});
