# Document Reprocess Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users re-run an existing PDF through its original Smart or Gemini extraction mode while preserving the existing document identity and readable refusal/error behavior.

**Architecture:** Add an explicit `force` form flag to both extraction endpoints. Normal requests keep the current hash/mode cache behavior; forced requests remove the existing result rows and re-run the selected service. Add a browser action that re-uploads the currently selected file with `force=true` and the existing mode. Keep the extraction services and evidence/refusal validation unchanged.

**Tech Stack:** Next.js App Router route handlers, TypeScript, React client state, Supabase, Vitest.

## Global Constraints

- Never emit a quantity without page and exact source evidence.
- Preserve the distinction between deterministic Smart extraction and Gemini AI extraction.
- AI results remain marked for human review.
- Refusals and provider errors must reach the UI with their real user-facing messages.
- Do not expose secrets or retain PDF binaries in the browser beyond the current file selection.

---

### Task 1: Add a pure forced-cache decision helper

**Files:**
- Create: `src/lib/reprocess.ts`
- Create: `tests/reprocess.test.ts`

**Interfaces:**
- Produces `shouldReuseDocument(status: string, force: boolean): boolean` for both API routes.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { shouldReuseDocument } from "@/src/lib/reprocess";

describe("shouldReuseDocument", () => {
  it("reuses completed results when force is false", () => {
    expect(shouldReuseDocument("completed", false)).toBe(true);
    expect(shouldReuseDocument("completed_with_refusals", false)).toBe(true);
  });

  it("bypasses a completed result when force is true", () => {
    expect(shouldReuseDocument("completed", true)).toBe(false);
  });

  it("never reuses failed results", () => {
    expect(shouldReuseDocument("failed", false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run `pnpm vitest run tests/reprocess.test.ts`. Expected: module/function not found.

- [ ] **Step 3: Implement the helper**

```ts
export function shouldReuseDocument(status: string, force: boolean): boolean {
  return !force && status !== "failed";
}
```

- [ ] **Step 4: Run the focused test**

Run `pnpm vitest run tests/reprocess.test.ts`. Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reprocess.ts tests/reprocess.test.ts
git commit -m "test: define forced document reprocessing behavior"
```

### Task 2: Add force handling to extraction APIs

**Files:**
- Modify: `app/api/extract/route.ts`
- Modify: `app/api/extract/image/route.ts`

**Interfaces:**
- Consumes optional multipart field `force` with value `"true"`.
- Produces response metadata `reused: false` for forced requests.

- [ ] **Step 1: Add the force flag and cache branch**

Parse `const force = formData.get("force") === "true"`. Replace each `existing.data && existing.data.status !== "failed"` cache check with `existing.data && shouldReuseDocument(existing.data.status, force)`. If force is true and an existing row is present, delete its `line_items` and `refusals`, then update that document row to `status: "processing"` and `pages_processed: 0`. Keep the existing failed-row retry deletion path for non-forced requests.

- [ ] **Step 2: Preserve document identity when forced**

Add `documentId?: string` to both service input types. When it is present, the service updates that existing row's `file_name`, `file_hash`, `status: "processing"`, and `pages_processed: 0` instead of inserting a row; when absent, preserve the current insert behavior. Pass the existing ID from each forced endpoint. On extraction failure, update the same row to `failed`; on success, update it to the completed status. The endpoint response must return the same document ID and `reused: false`.

- [ ] **Step 3: Run API-adjacent tests and typecheck**

Run `pnpm test -- tests/reprocess.test.ts`, `pnpm typecheck`, and `pnpm lint`. Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/extract/route.ts app/api/extract/image/route.ts src/lib/reprocess.ts
git commit -m "feat: bypass extraction cache on forced reprocess"
```

### Task 3: Add the UI reprocess action

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes the current selected `File` and a history document's `processing_mode`.
- Produces a readable loading, success, refusal, or error state using the existing result display.

- [ ] **Step 1: Add a `reprocessDocument` client handler**

Require a currently selected file. Build `FormData` with the file and `force=true`, post to `/api/extract` for deterministic mode or `/api/extract/ai` for AI mode, then refresh the result and document history. Reuse the existing API error parsing so refusal/provider messages are not replaced by a generic error.

- [ ] **Step 2: Render an accessible action**

Add a `Read again` button to each history row when a selected file is available. Disable it while processing and expose the state via button text and `aria-busy`. If no file is selected, show a short explanation that the original PDF must be selected again because the server does not retain the upload binary.

- [ ] **Step 3: Run lint and typecheck**

Run `pnpm typecheck` and `pnpm lint`. Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add read again action to document history"
```

### Task 4: Update documentation and verify the complete feature

**Files:**
- Modify: `docs/PROJECT_OVERVIEW.md`
- Modify: `README.md`

- [ ] **Step 1: Document cache versus forced reprocessing**

State that normal same-file/same-mode uploads reuse saved results, while `Read again` explicitly bypasses that cache and requires the file to be selected in the browser.

- [ ] **Step 2: Run the full verification suite**

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` sequentially. Expected: all pass.

- [ ] **Step 3: Inspect the staged diff for secrets and whitespace errors**

Run `git diff --cached --check` and scan the staged diff for API keys, service-role credentials, passwords, and tokens without printing any matching secret values.

- [ ] **Step 4: Commit and push**

```bash
git add README.md docs/PROJECT_OVERVIEW.md
git commit -m "docs: describe document reprocessing"
git push origin main
```

- [ ] **Step 5: Verify the remote branch**

Run `git status --short`, `git log -1 --oneline`, and `git ls-remote origin refs/heads/main`. Expected: clean worktree and remote SHA equal to the latest local commit.
