import { z } from "zod";

export const EvidenceSchema = z.object({
  page: z.number().int().positive(),
  sourceText: z.string().min(1),
  sourceType: z.enum(["text", "gemini_vision"]).default("text"),
  confidence: z.number().min(0).max(1).optional(),
});

export const LineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().finite(),
  unit: z.string().min(1).optional(),
  evidence: EvidenceSchema,
});

export const RefusalSchema = z.object({
  page: z.number().int().positive().optional(),
  sourceText: z.string().min(1).optional(),
  reason: z.string().min(1),
  userMessage: z.string().min(1),
});

export const ExtractionResultSchema = z.object({
  documentId: z.string().uuid(),
  fileName: z.string().min(1),
  documentType: z.enum(["text_pdf", "scanned_pdf", "hybrid_pdf"]),
  processingMode: z.enum(["deterministic", "ai", "image"]),
  status: z.enum(["completed", "completed_with_refusals", "failed"]),
  pagesProcessed: z.number().int().nonnegative(),
  items: z.array(LineItemSchema),
  refusals: z.array(RefusalSchema),
});

export type Evidence = z.infer<typeof EvidenceSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;
export type Refusal = z.infer<typeof RefusalSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
export type DocumentType = ExtractionResult["documentType"];
export type ProcessingMode = ExtractionResult["processingMode"];

export type PdfPage = {
  page: number;
  text: string;
};
