# Insta Quote AI take-home

Small Next.js app for extracting auditable quantities from invoices, packing lists, and delivery dockets.

## Run locally

Requirements: Node.js and pnpm.

1. Run the SQL in `supabase/schema.sql` in the Supabase SQL Editor.
2. Copy `.env.example` to `.env` and set:

   ```text
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
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

## Behavior

The extraction path is deterministic. It reads the PDF text layer page-by-page and only emits a line item when it can identify a quantity and preserve the exact source line as evidence. Each item includes the 1-based page number and source text.

The parser refuses to guess when a line has no quantity, multiple plausible quantities, an unrecognised unit, or no clear description. Refusals are returned as normal extraction data and shown in the UI under **Could not extract**. A scanned/image-only PDF returns a successful result containing a refusal; it does not become a generic error and no quantity is invented.

## Supabase note

This take-home uses the Supabase publishable key because no authentication or tenant model is in scope. The schema therefore contains clearly marked demo-only public RLS policies so the API can persist results with the provided keys. For production, add an owner/tenant column, authentication, and per-user policies before storing customer documents.

The service-role key is not required and must not be added to the browser or committed to the repository.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm build
```

The six supplied PDFs in `pdf/` are the manual acceptance fixtures. The parser is intentionally conservative; layouts that are not confidently understood are refusals rather than guesses.
