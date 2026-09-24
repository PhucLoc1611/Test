export type ExtractionMode = "deterministic" | "ai";

export function chooseExtractionMode(input: {
  hasTextPages: boolean;
  hasPagesWithoutText: boolean;
}): ExtractionMode {
  return input.hasTextPages && !input.hasPagesWithoutText ? "deterministic" : "ai";
}
