import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ExtractionResultSchema,
  type ExtractionResult,
  type DocumentType,
  type Refusal,
} from "@/src/domain/extraction";
import { extractTextByPage, NoTextLayerError } from "@/src/lib/pdf-text";
import { PublicError } from "@/src/lib/errors";
import { parsePage } from "@/src/lib/line-item-parser";
import { createSupabaseClient } from "@/src/lib/supabase-client";

type ProcessInput = {
  fileName: string;
  buffer: Buffer;
  fileHash: string;
  documentId?: string;
};

type ProcessDependencies = {
  supabase?: SupabaseClient;
  extract?: typeof extractTextByPage;
};

function databaseError(error: { message: string } | null, operation: string): void {
  if (error) {
    throw new PublicError("DATABASE_ERROR", `Could not ${operation} the extraction result.`, 500, error.message);
  }
}

export async function processDocument(
  input: ProcessInput,
  dependencies: ProcessDependencies = {},
): Promise<ExtractionResult> {
  const supabase = dependencies.supabase ?? createSupabaseClient();
  const extract = dependencies.extract ?? extractTextByPage;

  let documentId = input.documentId;
  if (documentId) {
    const reset = await supabase
      .from("documents")
      .update({
        file_name: input.fileName,
        file_hash: input.fileHash,
        document_type: "text_pdf",
        status: "processing",
        pages_processed: 0,
      })
      .eq("id", documentId);
    databaseError(reset.error, "reset");
  } else {
    const created = await supabase
      .from("documents")
      .insert({
        file_name: input.fileName,
        file_hash: input.fileHash,
        document_type: "text_pdf",
        status: "processing",
        pages_processed: 0,
      })
      .select("id, file_name")
      .single();
    databaseError(created.error, "create");

    if (!created.data) {
      throw new PublicError("DATABASE_ERROR", "Could not create the extraction result.", 500);
    }

    documentId = created.data.id as string;
  }
  let pagesProcessed = 0;
  let items: ExtractionResult["items"] = [];
  let refusals: Refusal[] = [];
  let documentType: DocumentType = "text_pdf";

  try {
    const extracted = await extract(input.buffer);
    pagesProcessed = extracted.pages.length + extracted.refusals.filter((refusal) => refusal.page).length;
    refusals = [...extracted.refusals];

    for (const page of extracted.pages) {
      const parsed = parsePage(page);
      items = [...items, ...parsed.items];
      refusals = [...refusals, ...parsed.refusals];
    }
  } catch (error) {
    if (error instanceof NoTextLayerError) {
      documentType = "scanned_pdf";
      refusals = [
        {
          reason: error.code,
          userMessage: "This PDF appears to be scanned and has no selectable text, so no quantities were guessed.",
        },
      ];
    } else {
      await supabase.from("documents").update({ status: "failed" }).eq("id", documentId);
      throw error;
    }
  }

  if (documentType !== "scanned_pdf" && refusals.some((refusal) => refusal.reason === "PAGE_HAS_NO_TEXT")) {
    documentType = "hybrid_pdf";
  }

  if (items.length > 0) {
    const itemInsert = await supabase.from("line_items").insert(
      items.map((item) => ({
        document_id: documentId,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit ?? null,
        page: item.evidence.page,
        source_text: item.evidence.sourceText,
        source_type: item.evidence.sourceType,
        confidence: item.evidence.confidence ?? null,
      })),
    );
    databaseError(itemInsert.error, "save line items for");
  }

  if (refusals.length > 0) {
    const refusalInsert = await supabase.from("refusals").insert(
      refusals.map((refusal) => ({
        document_id: documentId,
        page: refusal.page ?? null,
        source_text: refusal.sourceText ?? null,
        reason: refusal.reason,
        user_message: refusal.userMessage,
      })),
    );
    databaseError(refusalInsert.error, "save refusals for");
  }

  const status = refusals.length > 0 ? "completed_with_refusals" : "completed";
  const updated = await supabase
    .from("documents")
    .update({ status, pages_processed: pagesProcessed, document_type: documentType })
    .eq("id", documentId);
  databaseError(updated.error, "complete");

  return ExtractionResultSchema.parse({
    documentId,
    fileName: input.fileName,
    documentType,
    processingMode: "deterministic",
    status,
    pagesProcessed,
    items,
    refusals,
  });
}
