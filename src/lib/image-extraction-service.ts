import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ExtractionResultSchema,
  type ExtractionResult,
} from "@/src/domain/extraction";
import { PublicError } from "@/src/lib/errors";
import { createSupabaseClient } from "@/src/lib/supabase-client";
import { extractImageDocument } from "@/src/lib/gemini-image-extractor";
import { getPdfPageCount } from "@/src/lib/pdf-text";

type ImageProcessInput = {
  fileName: string;
  buffer: Buffer;
  fileHash: string;
  processingMode?: "image" | "ai";
  documentType?: "text_pdf" | "scanned_pdf" | "hybrid_pdf";
};

type ImageDependencies = {
  supabase?: SupabaseClient;
  extract?: typeof extractImageDocument;
};

function databaseError(error: { message: string } | null, operation: string): void {
  if (error) {
    throw new PublicError("DATABASE_ERROR", `Could not ${operation} the AI extraction result.`, 500, error.message);
  }
}

export async function processImageDocument(
  input: ImageProcessInput,
  dependencies: ImageDependencies = {},
): Promise<ExtractionResult> {
  const supabase = dependencies.supabase ?? createSupabaseClient();
  const extract = dependencies.extract ?? extractImageDocument;
  const processingMode = input.processingMode ?? "image";
  const documentType = input.documentType ?? "scanned_pdf";
  const pagesProcessed = await getPdfPageCount(input.buffer);
  const created = await supabase
    .from("documents")
    .insert({
      file_name: input.fileName,
      file_hash: input.fileHash,
      processing_mode: processingMode,
      document_type: documentType,
      status: "processing",
      pages_processed: 0,
    })
    .select("id, file_name")
    .single();
  databaseError(created.error, "create");
  if (!created.data) throw new PublicError("DATABASE_ERROR", "Could not create the AI extraction result.", 500);

  const documentId = created.data.id as string;
  let extracted: Awaited<ReturnType<typeof extract>>;
  try {
    extracted = await extract(input.buffer);
  } catch (error) {
    await supabase.from("documents").update({ status: "failed" }).eq("id", documentId);
    throw error;
  }

  if (extracted.items.length > 0) {
    const items = await supabase.from("line_items").insert(
      extracted.items.map((item) => ({
        document_id: documentId,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit ?? null,
        page: item.evidence.page,
        source_text: item.evidence.sourceText,
        source_type: "gemini_vision",
        confidence: item.evidence.confidence ?? null,
      })),
    );
    databaseError(items.error, "save AI line items for");
  }

  if (extracted.refusals.length > 0) {
    const refusals = await supabase.from("refusals").insert(
      extracted.refusals.map((refusal) => ({
        document_id: documentId,
        page: refusal.page ?? null,
        source_text: refusal.sourceText ?? null,
        reason: refusal.reason,
        user_message: refusal.userMessage,
      })),
    );
    databaseError(refusals.error, "save image refusals for");
  }

  const status = extracted.refusals.length > 0 ? "completed_with_refusals" : "completed";
  const updated = await supabase
    .from("documents")
    .update({ status, pages_processed: pagesProcessed, document_type: documentType })
    .eq("id", documentId);
  databaseError(updated.error, "complete");

  return ExtractionResultSchema.parse({
    documentId,
    fileName: input.fileName,
    documentType,
    processingMode,
    status,
    pagesProcessed,
    items: extracted.items,
    refusals: extracted.refusals,
  });
}
