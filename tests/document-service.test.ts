import { describe, expect, it } from "vitest";
import { getDocumentResult } from "@/src/lib/document-service";

describe("getDocumentResult", () => {
  it("rejects an invalid document id before querying Supabase", async () => {
    await expect(getDocumentResult("not-a-uuid")).rejects.toMatchObject({
      code: "INVALID_DOCUMENT_ID",
      status: 400,
    });
  });
});
