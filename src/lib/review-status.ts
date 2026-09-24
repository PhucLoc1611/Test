export function requiresHumanReview(input: {
  processingMode: "deterministic" | "ai" | "image";
  refusalCount: number;
}): boolean {
  return input.processingMode === "ai" || input.processingMode === "image" || input.refusalCount > 0;
}
