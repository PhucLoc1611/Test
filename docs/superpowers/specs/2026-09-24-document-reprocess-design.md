# Document reprocess design

## Goal

Allow a user to read an already processed document again when the source file or extraction result deserves a fresh attempt, without creating duplicate history rows.

## User flow

Each previously processed document gets a `Read again` action. The action keeps the document's existing extraction method:

- Smart extraction keeps using the deterministic text parser.
- Gemini extraction keeps using the AI parser.

While reprocessing, the action shows a loading state and prevents duplicate clicks. The result and any refusals replace the previous result. A failure remains visible with its actual user-facing reason.

## API and data flow

The extraction endpoints accept an explicit `force` flag. Without it, the existing file-hash and processing-mode cache behavior remains unchanged. With `force=true`, the endpoint:

1. Finds the existing document by `file_hash` and `processing_mode`.
2. Deletes its old line items and refusals.
3. Re-runs the selected extraction service against the uploaded file.
4. Updates the existing document status and pages processed.

The existing document ID is retained so history links and the UI remain stable. A failed previous attempt is still retryable. The server must never expose or accept the Gemini key from the browser.

## UI contract

The history row exposes `Read again` for completed, completed-with-refusals, and failed documents where the original file is available to the current page. The browser re-uploads the selected file with the document ID and `force=true`; because the server does not retain the PDF binary, a reprocess requires the user to select the file again or keep the current file in the page state.

The UI continues to distinguish:

- successful extraction;
- successful extraction with refusals;
- failed extraction with the real reason;
- reprocessed result, with a short confirmation that the cache was bypassed.

## Safety rules

- Reprocessing must not weaken evidence validation or refusal rules.
- AI results remain marked as requiring human review.
- Old results are removed only after the replacement request has reached the processing stage; if the new attempt cannot start, the previous result should remain available where practical.
- Smart and Gemini results remain separate cache entries because they use different extraction logic.

## Tests

Add tests covering:

1. A normal request reuses a completed same-file/same-mode result.
2. `force=true` bypasses the cache and runs extraction again.
3. Reprocessing preserves the selected mode and document identity.
4. Refusals and provider errors still reach the UI as readable messages.
