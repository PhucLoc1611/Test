# Insta Quote AI take-home

Small Next.js app for extracting auditable quantities from invoices, packing lists, and delivery dockets.

## Run locally

Requirements: Node.js and pnpm.

1. Run the SQL in `supabase/schema.sql` in the Supabase SQL Editor.
   If the tables already existed before the AI mode was added, run
   `supabase/migrations/20260924_document_extraction_modes.sql` instead.
2. Copy `.env.example` to `.env` and set:

   ```text
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
   GEMINI_API_KEY=...
   GEMINI_MODEL=gemini-3.5-flash
   GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite,gemini-3.6-flash
   ```

3. Install and start:

   ```bash
   pnpm install
   pnpm dev
   ```

Open `http://localhost:3000` and upload a PDF.

## Read extracted results through the API

The upload response contains `data.documentId`. Use it to retrieve the persisted result:

```bash
curl http://localhost:3000/api/documents/<document-id>
```

This returns the document status, pages processed, extracted line items with page/source evidence, and refusals. To list previously processed documents:

```bash
curl http://localhost:3000/api/documents
```

Refused documents can be queried for a separate OCR/review workflow:

```bash
curl "http://localhost:3000/api/documents/refusals?reason=NO_TEXT_LAYER"
```

Uploads are deduplicated by SHA-256 file hash. Uploading the same PDF again returns the saved extraction with `meta.reused: true` and does not run the parser again.

## AI extraction API

Any PDF can be sent to the server-only AI route. This is useful for scanned, hybrid, or difficult layouts:

```bash
curl -X POST -F "file=@pdf/KBS-10241.pdf" http://localhost:3000/api/extract/ai
```

The response is tagged with `meta.mode: "ai"`. The old `/api/extract/image` endpoint remains as a compatibility alias. Gemini is constrained to structured JSON, but its output is still treated as untrusted: quantities below 0.9 confidence or quantities that do not appear in the returned quote become refusals and are not saved as line items. The Gemini API key is never sent to the browser.

## Behavior

The default extraction path reads the PDF text layer page-by-page. Fully text-based PDFs use the deterministic parser; scanned or hybrid PDFs automatically use the stricter Gemini path. The explicit AI route can read any PDF. Each item includes the 1-based page number and source text.

The parser refuses to guess when a line has no quantity, multiple plausible quantities, an unrecognised unit, or no clear description. Refusals are returned as normal extraction data and shown in the UI under **Could not extract**. A scanned/image-only PDF is sent to AI by the default route; if AI cannot verify a value, the successful result contains a refusal and no quantity is invented.

## Supabase note

This take-home uses the Supabase publishable key because no authentication or tenant model is in scope. The schema therefore contains clearly marked demo-only public RLS policies so the API can persist results with the provided keys. For production, add an owner/tenant column, authentication, and per-user policies before storing customer documents.

The service-role key is not required and must not be added to the browser or committed to the repository.

## Troubleshooting Supabase 500 errors

If the API says `column documents.document_type does not exist`, the project is still using the old schema. Run the migration file above in Supabase SQL Editor and restart the Next.js dev server. The PDF.js `Unable to load font data` message is a warning from text inspection; it is not the cause of the database 500.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm build
```

The six supplied PDFs in `pdf/` are the manual acceptance fixtures. The parser is intentionally conservative; layouts that are not confidently understood are refusals rather than guesses.
