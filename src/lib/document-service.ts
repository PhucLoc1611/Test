import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  ExtractionResultSchema,
  type ExtractionResult,
} from "@/src/domain/extraction";
import { PublicError } from "@/src/lib/errors";
import { createSupabaseClient } from "@/src/lib/supabase-client";

const DocumentIdSchema = z.string().uuid();

type DocumentDependencies = { supabase?: SupabaseClient };

function ensureDatabaseResult<T>(result: { data: T | null; error: { message: string } | null }, operation: string): T {
  if (result.error) {
    if (/column .* does not exist/i.test(result.error.message)) {
      throw new PublicError(
        "DATABASE_SCHEMA_OUTDATED",
        "Supabase is using an older schema. Run the migration in supabase/migrations/20260924_document_extraction_modes.sql, then retry.",
        500,
        result.error.message,
      );
    }
    throw new PublicError("DATABASE_ERROR", `Could not ${operation} the document.`, 500, result.error.message);
  }
  if (!result.data) {
    throw new PublicError("DOCUMENT_NOT_FOUND", "That document could not be found.", 404);
  }
  return result.data;
}

export async function getDocumentResult(
  documentId: string,
  dependencies: DocumentDependencies = {},
): Promise<ExtractionResult> {
  const id = DocumentIdSchema.safeParse(documentId);
  if (!id.success) {
    throw new PublicError("INVALID_DOCUMENT_ID", "The document ID is not valid.", 400);
  }

  const supabase = dependencies.supabase ?? createSupabaseClient();
  const documentQuery = await supabase
    .from("documents")
    .select("id, file_name, document_type, processing_mode, status, pages_processed")
    .eq("id", id.data)
    .maybeSingle();
  const document = ensureDatabaseResult(documentQuery, "load");

  const [itemsQuery, refusalsQuery] = await Promise.all([
    supabase
      .from("line_items")
      .select("description, quantity, unit, page, source_text, source_type, confidence")
      .eq("document_id", id.data)
      .order("page", { ascending: true }),
    supabase
      .from("refusals")
      .select("page, source_text, reason, user_message")
      .eq("document_id", id.data)
      .order("page", { ascending: true, nullsFirst: false }),
  ]);

  const items = ensureDatabaseResult(itemsQuery, "load line items for");
  const refusals = ensureDatabaseResult(refusalsQuery, "load refusals for");

  return ExtractionResultSchema.parse({
    documentId: document.id,
    fileName: document.file_name,
    documentType: document.document_type,
    processingMode: document.processing_mode ?? "deterministic",
    status: document.status,
    pagesProcessed: document.pages_processed,
    items: items.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity),
      ...(item.unit ? { unit: item.unit } : {}),
      evidence: {
        page: item.page,
        sourceText: item.source_text,
        sourceType: item.source_type ?? "text",
        ...(item.confidence === null || item.confidence === undefined ? {} : { confidence: Number(item.confidence) }),
      },
    })),
    refusals: refusals.map((refusal) => ({
      ...(refusal.page ? { page: refusal.page } : {}),
      ...(refusal.source_text ? { sourceText: refusal.source_text } : {}),
      reason: refusal.reason,
      userMessage: refusal.user_message,
    })),
  });
}

export async function listDocuments(dependencies: DocumentDependencies = {}) {
  const supabase = dependencies.supabase ?? createSupabaseClient();
  const result = await supabase
    .from("documents")
    .select("id, file_name, document_type, processing_mode, status, pages_processed, created_at")
    .order("created_at", { ascending: false });
  return ensureDatabaseResult(result, "list");
}
