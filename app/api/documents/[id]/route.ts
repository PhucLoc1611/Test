import { NextResponse } from "next/server";
import { toPublicError } from "@/src/lib/errors";
import { getDocumentResult } from "@/src/lib/document-service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const result = await getDocumentResult(id);
    return NextResponse.json({ data: result });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json(
      { error: { code: publicError.code, message: publicError.message, details: publicError.details } },
      { status: publicError.status },
    );
  }
}
