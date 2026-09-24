import { NextResponse } from "next/server";
import { toPublicError } from "@/src/lib/errors";
import { listDocuments } from "@/src/lib/document-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const documents = await listDocuments();
    return NextResponse.json({ data: documents });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json(
      { error: { code: publicError.code, message: publicError.message, details: publicError.details } },
      { status: publicError.status },
    );
  }
}
