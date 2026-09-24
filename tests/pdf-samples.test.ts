import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { extractTextByPage, NoTextLayerError } from "@/src/lib/pdf-text";

describe("provided PDF samples", () => {
  it("extracts page text from all supplied samples without inventing pages", async () => {
    const samples = (await readdir("pdf")).filter((file) => file.endsWith(".pdf"));
    expect(samples).toHaveLength(6);
    const scanSamples: string[] = [];

    for (const sample of samples) {
      try {
        const result = await extractTextByPage(await readFile(`pdf/${sample}`));
        expect(result.pages.length, sample).toBeGreaterThan(0);
        expect(result.pages.every((page) => page.page > 0 && page.text.length > 0), sample).toBe(true);
      } catch (error) {
        expect(error, sample).toBeInstanceOf(NoTextLayerError);
        scanSamples.push(sample);
      }
    }

    console.log(`Samples without a text layer: ${scanSamples.join(", ") || "none"}`);
  }, 15_000);
});
