import { describe, expect, it } from "vitest";
import { assertPdfBuffer } from "@/src/lib/pdf-text";
import { toPublicError } from "@/src/lib/errors";

describe("PDF input validation", () => {
  it("accepts a PDF magic header", () => {
    expect(() => assertPdfBuffer(Buffer.from("%PDF-1.7"))).not.toThrow();
  });

  it("rejects content that is not a PDF", () => {
    expect(() => assertPdfBuffer(Buffer.from("not a pdf"))).toThrow("INVALID_PDF");
  });

  it("explains that AI is the next option when no text layer exists", () => {
    expect(toPublicError(new Error("NO_TEXT_LAYER"))).toMatchObject({
      code: "NO_TEXT_LAYER",
      status: 422,
    });
  });
});
