# Insta Quote AI Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with a fresh review after each checkpoint. Steps use checkbox syntax for tracking.

**Goal:** Build a small Next.js application that extracts auditable line items from uploaded PDFs, persists documents/results in Supabase, and shows both successful extraction and human-readable refusals in the browser.

**Architecture:** The server exposes separate deterministic and Gemini routes. The Smart route uses deterministic parsing only and returns a clear `NO_TEXT_LAYER` error with an AI recommendation when selectable text is unavailable. The explicit Gemini route handles scanned, hybrid, or difficult PDFs. Both paths validate that every emitted quantity has page and exact evidence text before persisting the document, line items, and refusals.

**Tech Stack:** Next.js App Router, TypeScript, React, pdfjs-dist, @supabase/supabase-js, Zod, Vitest, Testing Library, CSS, pnpm.

## Global Constraints

- Never emit a numeric line item without a 1-based page number and exact source text.
- Refuse ambiguous, missing, contradictory, or unverifiable quantities.
- A refusal for one page or row must not remove valid results from other pages.
- The current Supabase schema has no user/tenant column; this take-home uses the publishable key with explicitly marked demo-only public policies.
- Do not add OCR or LLM extraction inside the deterministic parser.
- Gemini is an explicit AI document path; it must never replace evidence validation or refusal handling.
- Do not introduce or require a service-role key for this take-home; keep Supabase calls in the server route.
- The six sample PDFs were used as local manual acceptance fixtures but are intentionally not committed to the repository.

---

## File Map

Create the following files:

- package.json, tsconfig.json, next.config.ts, .env.example, .gitignore: project/tooling configuration.
- app/page.tsx, app/globals.css: upload page and result presentation.
- app/api/extract/route.ts: multipart upload boundary and orchestration.
- app/api/documents/route.ts, app/api/documents/[id]/route.ts: read persisted extraction results.
- app/api/extract/ai/route.ts, app/api/extract/image/route.ts, src/lib/gemini-image-extractor.ts: guarded AI extraction for any PDF, with the image route retained as a compatibility alias.
- src/domain/extraction.ts: shared Zod schemas and TypeScript types.
- src/lib/pdf-text.ts: page-preserving PDF text extraction.
- src/lib/line-item-parser.ts: deterministic candidate parsing and refusal rules.
- src/lib/extraction-service.ts: document lifecycle, parsing, and persistence orchestration.
- src/lib/supabase-admin.ts: server-only Supabase client.
- src/lib/errors.ts: typed user-safe error mapping.
- tests/line-item-parser.test.ts, tests/pdf-text.test.ts, tests/extraction-service.test.ts: focused refusal and integration tests.
- README.md: setup, limitations, sample results, and verification instructions.

Keep supabase/schema.sql as the source of truth for tables. Do not add a second incompatible schema.

## Data Contract

Define these types and Zod schemas in src/domain/extraction.ts:

    type Evidence = {
      page: number;
      sourceText: string;
    };

    type LineItem = {
      description: string;
      quantity: number;
      unit?: string;
      evidence: Evidence;
    };

    type Refusal = {
      page?: number;
      sourceText?: string;
      reason: string;
      userMessage: string;
    };

    type ExtractionResult = {
      documentId: string;
      fileName: string;
      status: 'completed' | 'completed_with_refusals' | 'failed';
      pagesProcessed: number;
      items: LineItem[];
      refusals: Refusal[];
    };

The API must return { data: ExtractionResult } for success and { error: { code, message, details? } } for a controlled failure.

## Task 1: Bootstrap the Next.js project

**Files:** package/config files listed in the file map.

- [ ] Create a minimal Next.js TypeScript App Router project without authentication, database migrations, or unrelated UI libraries.
- [ ] Add scripts: dev, build, lint, test, and typecheck.
- [ ] Add .env.example containing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
- [ ] Add .env*, node_modules, .next, coverage output, and build artifacts to .gitignore.
- [ ] Verify pnpm install, pnpm typecheck, and pnpm build from a clean checkout.

**Acceptance:** The empty app builds and starts locally; no secret is committed.

## Task 2: Add the typed extraction contract and Supabase client

**Files:** src/domain/extraction.ts, src/lib/supabase-admin.ts, src/lib/errors.ts.

- [ ] Implement the Zod schemas described above, including positive page numbers and finite numeric quantities.
- [ ] Implement createSupabaseClient() using @supabase/supabase-js and the two NEXT_PUBLIC_SUPABASE variables.
- [ ] Throw a controlled configuration error when either Supabase environment variable is absent.
- [ ] Keep the database client imported only by server-side modules.
- [ ] Map database errors to safe messages without returning stack traces or secrets.

**Interfaces:**

    export function createSupabaseAdminClient(): SupabaseClient;
    export function toPublicError(error: unknown): {
      code: string;
      message: string;
      details?: string;
    };

**Acceptance:** TypeScript rejects invalid extraction results and server code can create a Supabase client from environment variables.

## Task 3: Implement page-preserving PDF text extraction

**Files:** src/lib/pdf-text.ts, tests/pdf-text.test.ts.

- [ ] Implement extractTextByPage(buffer: Buffer): Promise<PdfPage[]>.
- [ ] Define PdfPage as { page: number; text: string }.
- [ ] Validate the PDF magic bytes before invoking the PDF library.
- [ ] Preserve page boundaries and enough original line text for evidence.
- [ ] Classify text, scanned, and hybrid PDFs and route scanned/hybrid files to AI without inventing quantities.
- [ ] Allow the service layer to continue when an individual page fails.

**Acceptance:** Each extracted page has a 1-based page number; AI output has the same evidence contract and uncertain values become refusals instead of invented data.

## Task 4: Implement deterministic line-item parsing

**Files:** src/lib/line-item-parser.ts, tests/line-item-parser.test.ts.

- [ ] Implement:

    export function parsePage(page: PdfPage): {
      items: LineItem[];
      refusals: Refusal[];
    };

- [ ] Identify candidate rows containing a description and a clear numeric quantity.
- [ ] Support integer and decimal quantities and optional units.
- [ ] Use the complete original candidate row as evidence.sourceText.
- [ ] Verify String(quantity) or an equivalent normalized numeric token occurs in the source text before emitting an item.
- [ ] Refuse rows with no quantity, multiple plausible quantities, contradictory quantities, or values that cannot be tied to the row.
- [ ] Ignore document totals, subtotals, dates, invoice numbers, and page numbers unless the row clearly represents a line item.
- [ ] Keep valid rows when neighboring rows are refused.

**Required tests:**

- A clear row emits one item with matching quantity, page, and source text.
- A missing quantity emits only a refusal.
- A row with two ambiguous numbers emits only a refusal.
- A valid row remains in the result when another row on the same page is refused.
- No emitted item can contain a quantity absent from its evidence text.

**Acceptance:** Parser behavior is deterministic and all refusal rules are directly tested.

## Task 5: Build extraction orchestration and Supabase persistence

**Files:** src/lib/extraction-service.ts, tests/extraction-service.test.ts.

- [ ] Implement:

    export async function processDocument(input: {
      fileName: string;
      buffer: Buffer;
    }): Promise<ExtractionResult>;

- [ ] Insert a documents row with status processing.
- [ ] Extract pages and parse each page independently.
- [ ] Insert every valid item into line_items with document_id, page, source_text, description, quantity, and unit.
- [ ] Insert every refusal into refusals, preserving page/source text when available.
- [ ] Set document status to completed when there are no refusals, otherwise completed_with_refusals.
- [ ] On a controlled document-level failure, update status to failed and return a safe error.
- [ ] Use the existing foreign keys and on delete cascade; do not issue destructive cleanup against unrelated documents.

**Acceptance:** A mixed document persists valid items and refusals independently, and the returned result matches the persisted records.

## Checkpoint 1: Backend correctness

- [ ] pnpm test passes.
- [ ] pnpm typecheck passes.
- [ ] A parser test proves the evidence invariant.
- [ ] Supabase errors do not expose credentials or stack traces.
- [ ] The service handles partial page failures without discarding successful pages.

## Task 6: Add the upload API route

**Files:** app/api/extract/route.ts.

- [ ] Accept only multipart/form-data with one file field.
- [ ] Reject missing files, non-PDF content types, invalid PDF magic bytes, and files over 10 MB with HTTP 400.
- [ ] Call processDocument() and return the typed success envelope.
- [ ] Return HTTP 200 with an explicit refusal for a readable PDF that has no text layer or contains an unsupported layout.
- [ ] Return HTTP 422 only when the PDF is structurally invalid and cannot be represented as a document result.
- [ ] Return HTTP 500 only for unexpected failures, using a non-generic but safe message.
- [ ] Never return either Supabase key, raw database error, or stack trace.

**Acceptance:** The route preserves the distinction between a valid extraction containing refusals and a request/system failure.

## Task 7: Add read APIs for persisted results

**Files:** src/lib/document-service.ts, app/api/documents/route.ts, app/api/documents/[id]/route.ts, tests/document-service.test.ts.

- [ ] Implement `GET /api/documents` to list document IDs, file names, statuses, processed page counts, and creation timestamps.
- [ ] Implement `GET /api/documents/:id` to return the complete extraction result, including evidence-backed line items and refusals.
- [ ] Validate UUIDs before querying Supabase and return HTTP 400 for invalid IDs or HTTP 404 for missing documents.
- [ ] Keep all reads server-side and return safe database errors.

**Acceptance:** A caller can retrieve a previously persisted result without re-uploading the PDF.

## Task 8: Build the browser UI

**Files:** app/page.tsx, app/globals.css.

- [ ] Add a PDF file picker and upload button.
- [ ] Show a loading state while extraction is running.
- [ ] Render extracted items in a table with description, quantity, unit, page, and exact source text.
- [ ] Render refusals in a separate clearly titled section such as “Could not extract”.
- [ ] Show the refusal page, source text, technical reason, and plain-language userMessage.
- [ ] Render API failures using the server-provided message/details instead of “Something went wrong”.
- [ ] Add empty states for a document with no items and a document with only refusals.
- [ ] Use React escaping by default; never inject PDF text with dangerouslySetInnerHTML.

**Acceptance:** A non-technical reviewer can tell which values were extracted, where they came from, and why another value was refused.

## Task 9: Verify against supplied PDFs and document limitations

**Files:** README.md, optionally small text fixtures under tests/fixtures/.

- [ ] Document setup, environment variables, Supabase schema execution, and local commands.
- [ ] Explain when the deterministic parser is used, when AI is used, and that both paths preserve evidence/refusals.
- [ ] Document the exact refusal behavior for scan-only PDFs, ambiguity, contradiction, and missing evidence.
- [ ] Test all six supplied PDFs manually through the UI when available locally; do not commit customer/sample documents.
- [ ] Record observed limitations honestly; do not claim support for layouts not verified.
- [ ] Run pnpm test, pnpm typecheck, pnpm lint, and pnpm build.

## Final acceptance criteria

- [ ] Every displayed numeric item has page evidence and exact source text.
- [ ] No guessed quantity is persisted or shown.
- [ ] Ambiguous/contradictory values are visible as refusals.
- [ ] Partial failures do not hide valid results.
- [ ] Supabase contains the document, item, and refusal records.
- [ ] UI shows real refusal/error reasons.
- [ ] README explains known uncertainty and unsupported cases.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| PDF layouts differ across the six samples | High | Inspect samples early; keep parser conservative and refuse unknown layouts. |
| PDF library loses original spacing | High | Preserve complete page line text and use that exact line as evidence. |
| Supabase RLS blocks browser access | Medium | Use the publishable-key client from the API route and apply the demo policies in supabase/schema.sql; never query Supabase directly from the browser. |
| One malformed page aborts the whole file | High | Parse pages independently and persist page-level refusals. |
| Upload abuse or oversized files | Medium | Enforce MIME, magic-byte, and 10 MB server-side limits. |

## Implementation handoff

Implement sequentially through Task 9, stopping at each checkpoint for review. Do not add additional AI/OCR paths, authentication, Storage, or unrelated product features within this take-home scope.
