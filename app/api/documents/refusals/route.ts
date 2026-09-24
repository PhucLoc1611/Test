import { NextResponse } from "next/server";
import { toPublicError } from "@/src/lib/errors";
import { createSupabaseClient } from "@/src/lib/supabase-client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const reason = new URL(request.url).searchParams.get("reason");
    const supabase = createSupabaseClient();
    let query = supabase
      .from("refusals")
      .select("id, document_id, page, source_text, reason, user_message, documents(id, file_name, document_type, status, file_hash)")
      .order("created_at", { ascending: false });

    if (reason) query = query.eq("reason", reason);
    const result = await query;
    if (result.error) throw new Error(result.error.message);

    return NextResponse.json({ data: result.data ?? [] });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json(
      { error: { code: publicError.code, message: publicError.message, details: publicError.details } },
      { status: publicError.status },
    );
  }
}
