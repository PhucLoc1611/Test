import { NextResponse } from "next/server";
import { processDocument } from "@/src/lib/extraction-service";
import { toPublicError, PublicError } from "@/src/lib/errors";
import { assertPdfBuffer } from "@/src/lib/pdf-text";
import { getFileHash } from "@/src/lib/file-hash";
import { createSupabaseClient } from "@/src/lib/supabase-client";
import { getDocumentResult } from "@/src/lib/document-service";
import { extractTextByPage, NoTextLayerError } from "@/src/lib/pdf-text";
import { shouldReuseDocument } from "@/src/lib/reprocess";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const uploaded = formData.get("file");

    if (!(uploaded instanceof File)) {
      throw new PublicError("FILE_REQUIRED", "Choose a PDF file to analyse.", 400);
    }

    if (uploaded.size === 0) {
      throw new PublicError("FILE_EMPTY", "The selected file is empty.", 400);
    }

    if (uploaded.size > MAX_FILE_SIZE) {
      throw new PublicError("FILE_TOO_LARGE", "The PDF must be smaller than 10 MB.", 400);
    }

    if (uploaded.type && uploaded.type !== "application/pdf") {
      throw new PublicError("FILE_TYPE_NOT_ALLOWED", "Only PDF files can be analysed.", 400);
    }

    const buffer = Buffer.from(await uploaded.arrayBuffer());
    assertPdfBuffer(buffer);
    const fileHash = getFileHash(buffer);
    const force = formData.get("force") === "true";
    try {
      await extractTextByPage(buffer);
    } catch (error) {
      if (!(error instanceof NoTextLayerError)) throw error;
      throw new PublicError(
        "NO_TEXT_LAYER",
        "The text reader could not find selectable text in this PDF. Try Gemini AI for scanned or image-based documents.",
        422,
      );
    }

    const mode = "deterministic" as const;

    const supabase = createSupabaseClient();
    const existing = await supabase
      .from("documents")
      .select("id, status")
      .eq("file_hash", fileHash)
      .eq("processing_mode", mode)
      .maybeSingle();

    if (existing.error) {
      throw new PublicError("DATABASE_ERROR", "Could not check whether this document was already processed.", 500);
    }

    if (existing.data && shouldReuseDocument(existing.data.status, force)) {
      const result = await getDocumentResult(existing.data.id, { supabase });
      return NextResponse.json({ data: result, meta: { mode, reused: true } }, { status: 200 });
    }

    if (existing.data && force) {
      const clearedItems = await supabase.from("line_items").delete().eq("document_id", existing.data.id);
      if (clearedItems.error) throw new PublicError("DATABASE_ERROR", "The previous line items could not be cleared.", 500, clearedItems.error.message);
      const clearedRefusals = await supabase.from("refusals").delete().eq("document_id", existing.data.id);
      if (clearedRefusals.error) throw new PublicError("DATABASE_ERROR", "The previous refusals could not be cleared.", 500, clearedRefusals.error.message);
    }

    if (existing.data?.status === "failed" && !force) {
      const removed = await supabase.from("documents").delete().eq("id", existing.data.id);
      if (removed.error) {
        throw new PublicError("DATABASE_ERROR", "The previous failed attempt could not be retried.", 500, removed.error.message);
      }
    }

    const result = await processDocument({ fileName: uploaded.name, buffer, fileHash, documentId: force ? existing.data?.id : undefined }, { supabase });

    return NextResponse.json({ data: result, meta: { mode, reused: false } }, { status: 200 });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json(
      { error: { code: publicError.code, message: publicError.message, details: publicError.details } },
      { status: publicError.status },
    );
  }
}
