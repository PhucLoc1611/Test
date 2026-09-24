import { NextResponse } from "next/server";
import { processImageDocument } from "@/src/lib/image-extraction-service";
import { toPublicError, PublicError } from "@/src/lib/errors";
import { assertPdfBuffer } from "@/src/lib/pdf-text";
import { getFileHash } from "@/src/lib/file-hash";
import { createSupabaseClient } from "@/src/lib/supabase-client";
import { getDocumentResult } from "@/src/lib/document-service";
import { extractTextByPage, NoTextLayerError } from "@/src/lib/pdf-text";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const uploaded = formData.get("file");
    if (!(uploaded instanceof File)) throw new PublicError("FILE_REQUIRED", "Choose a PDF document first.", 400);
    if (uploaded.size === 0) throw new PublicError("FILE_EMPTY", "The selected file is empty.", 400);
    if (uploaded.size > MAX_FILE_SIZE) throw new PublicError("FILE_TOO_LARGE", "The PDF must be smaller than 10 MB.", 400);
    if (uploaded.type && uploaded.type !== "application/pdf") {
      throw new PublicError("FILE_TYPE_NOT_ALLOWED", "Only PDF files can be processed by the AI API.", 400);
    }

    const buffer = Buffer.from(await uploaded.arrayBuffer());
    assertPdfBuffer(buffer);
    const fileHash = getFileHash(buffer);
    let documentType: "text_pdf" | "scanned_pdf" | "hybrid_pdf" = "scanned_pdf";
    try {
      const inspection = await extractTextByPage(buffer);
      documentType = inspection.refusals.length > 0 ? "hybrid_pdf" : "text_pdf";
    } catch (error) {
      if (!(error instanceof NoTextLayerError)) throw error;
    }
    const supabase = createSupabaseClient();
    const existing = await supabase
      .from("documents")
      .select("id, status")
      .eq("file_hash", fileHash)
      .eq("processing_mode", "ai")
      .maybeSingle();
    if (existing.error) {
      if (/column .* does not exist/i.test(existing.error.message)) {
        throw new PublicError(
          "DATABASE_SCHEMA_OUTDATED",
          "Supabase is using an older schema. Run the migration in supabase/migrations/20260924_document_extraction_modes.sql, then retry.",
          500,
          existing.error.message,
        );
      }
      throw new PublicError("DATABASE_ERROR", "Could not check AI processing history.", 500, existing.error.message);
    }
    if (existing.data && existing.data.status !== "failed") {
      const result = await getDocumentResult(existing.data.id, { supabase });
      return NextResponse.json({ data: result, meta: { mode: "ai", endpoint: "image", reused: true } });
    }

    if (existing.data?.status === "failed") {
      const removed = await supabase.from("documents").delete().eq("id", existing.data.id);
      if (removed.error) {
        throw new PublicError("DATABASE_ERROR", "The previous failed AI attempt could not be retried.", 500, removed.error.message);
      }
    }

    const result = await processImageDocument(
      { fileName: uploaded.name, buffer, fileHash, processingMode: "ai", documentType },
      { supabase },
    );
    return NextResponse.json({ data: result, meta: { mode: "ai", endpoint: "image", reused: false } });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json(
      { error: { code: publicError.code, message: publicError.message, details: publicError.details } },
      { status: publicError.status },
    );
  }
}
