export class PublicError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 500,
    readonly details?: string,
  ) {
    super(message);
    this.name = "PublicError";
  }
}

export function toPublicError(error: unknown): {
  code: string;
  message: string;
  details?: string;
  status: number;
} {
  if (error instanceof PublicError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      status: error.status,
    };
  }

  if (error instanceof Error && error.message === "INVALID_PDF") {
    return {
      code: "INVALID_PDF",
      message: "The uploaded file is not a valid PDF.",
      status: 422,
    };
  }

  if (error instanceof Error && /column .* does not exist/i.test(error.message)) {
    return {
      code: "DATABASE_SCHEMA_OUTDATED",
      message: "Supabase is using an older schema. Run supabase/migrations/20260924_document_extraction_modes.sql in the Supabase SQL Editor, then retry.",
      status: 500,
    };
  }

  return {
    code: "EXTRACTION_FAILED",
    message: "We could not process this document. Please try another PDF.",
    status: 500,
  };
}
