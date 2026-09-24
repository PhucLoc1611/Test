"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import type { ExtractionResult } from "@/src/domain/extraction";
import { requiresHumanReview } from "@/src/lib/review-status";
import "./globals.css";

type ApiError = { code: string; message: string; details?: string };
type DocumentSummary = {
  id: string;
  file_name: string;
  document_type: "text_pdf" | "scanned_pdf" | "hybrid_pdf";
  processing_mode: "deterministic" | "ai" | "image";
  status: string;
  pages_processed: number;
  created_at: string;
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [reused, setReused] = useState(false);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/documents");
      const body = (await response.json()) as { data?: DocumentSummary[]; error?: ApiError };
      if (!response.ok || !body.data) {
        setHistoryError(body.error?.message ?? "Saved documents could not be loaded.");
        return;
      }
      setDocuments(body.data);
      setHistoryError(null);
    } catch {
      setHistoryError("Saved documents could not be loaded. Check the API connection.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  async function loadSavedDocument(documentId: string) {
    setLoading(true);
    setError(null);
    setSelectedDocumentId(documentId);
    try {
      const response = await fetch(`/api/documents/${documentId}`);
      const body = (await response.json()) as { data?: ExtractionResult; error?: ApiError };
      if (!response.ok || !body.data) {
        setError(body.error ?? { code: "DOCUMENT_LOAD_FAILED", message: "The saved document could not be loaded." });
        return;
      }
      setResult(body.data);
      setReused(true);
    } catch {
      setError({ code: "NETWORK_ERROR", message: "We could not load the saved document." });
    } finally {
      setLoading(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setResult(null);
    setError(null);
    setReused(false);
  }

  async function onSubmit(event: { preventDefault: () => void }, mode: "text" | "image") {
    event.preventDefault();
    if (!file) {
      setError({ code: "FILE_REQUIRED", message: "Choose a PDF file first." });
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);
    setSelectedDocumentId(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const endpoint = mode === "image" ? "/api/extract/ai" : "/api/extract";
      const response = await fetch(endpoint, { method: "POST", body: formData });
      const body = (await response.json()) as { data?: ExtractionResult; meta?: { reused?: boolean; mode?: string }; error?: ApiError };

      if (!response.ok || !body.data) {
        setError(body.error ?? { code: "UNKNOWN_ERROR", message: "The document could not be processed." });
        return;
      }

      setResult(body.data);
      setReused(body.meta?.reused === true);
      setSelectedDocumentId(body.data.documentId);
      await loadDocuments();
    } catch {
      setError({
        code: "NETWORK_ERROR",
        message: "We could not reach the extraction service. Check your connection and try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <h1>Read a document without guessing.</h1>
        <p className="intro">
          Upload an invoice, packing list, or delivery docket. Every extracted quantity shows the page and exact text it came from.
        </p>

        <form className="upload-card" onSubmit={(event) => void onSubmit(event, "text")}>
          <label htmlFor="pdf-file">PDF document</label>
          <input id="pdf-file" type="file" accept="application/pdf,.pdf" onChange={onFileChange} />
          <p className="hint">The default route reads text PDFs directly and automatically sends scanned or hybrid pages to the stricter AI reader.</p>
          <button type="submit" disabled={loading}>
            {loading ? "Reading document…" : "Smart extract quantities"}
          </button>
          <button
            type="button"
            className="image-button"
            disabled={loading}
            onClick={(event) => {
              event.preventDefault();
              void onSubmit(event, "image");
            }}
          >
            {loading ? "Reading with AI…" : "Extract any PDF with Gemini AI"}
          </button>
          <p className="hint">Use this when you want Gemini to inspect every page, including text, scanned, and hybrid PDFs. Low-confidence or unverifiable values remain refusals.</p>
        </form>

        <HistoryPanel
          documents={documents}
          loading={historyLoading}
          error={historyError}
          selectedId={selectedDocumentId}
          onRefresh={() => void loadDocuments()}
          onSelect={(id) => void loadSavedDocument(id)}
        />

        {error && (
          <section className="notice error" aria-live="polite">
            <strong>{error.message}</strong>
            <span>{error.details ?? `Reference: ${error.code}`}</span>
          </section>
        )}

        {result && <Results result={result} />}
        {result && reused && <p className="reused-notice">This PDF was already processed. Showing the saved result without reading it again.</p>}
      </section>
    </main>
  );
}

function Results({ result }: { result: ExtractionResult }) {
  const needsReview = requiresHumanReview({ processingMode: result.processingMode, refusalCount: result.refusals.length });
  return (
    <section className="results" aria-live="polite">
      <div className="result-heading">
        <div>
          <p className="eyebrow">Extraction complete</p>
          <h2>{result.fileName}</h2>
        </div>
        <span className={`status ${needsReview ? "status-warning" : "status-ok"}`}>
          {result.processingMode === "ai" ? "Needs review — AI result" : result.refusals.length ? "Completed with refusals" : "Completed"}
        </span>
      </div>

      <p className="method-note">
        Scanned by: <strong>{formatProcessingMode(result.processingMode)}</strong>
        <span> · Document type: {result.documentType.replaceAll("_", " ")}</span>
      </p>

      <div className="summary-grid" aria-label="Extraction summary">
        <div className="summary-card">
          <span>Pages read</span>
          <strong>{result.pagesProcessed}</strong>
        </div>
        <div className="summary-card">
          <span>Quantities found</span>
          <strong>{result.items.length}</strong>
        </div>
        <div className={`summary-card ${result.refusals.length ? "summary-warning" : ""}`}>
          <span>Needs review</span>
          <strong>{needsReview ? (result.refusals.length || "AI") : 0}</strong>
        </div>
      </div>

      {result.items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Page</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item, index) => (
                <tr key={`${item.evidence.page}-${index}`}>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>{item.unit ?? "—"}</td>
                  <td><span className="page">{item.evidence.page}</span></td>
                    <td>
                      <span className="evidence-tag">{item.evidence.sourceType === "gemini_vision" ? "Gemini AI evidence" : "Text evidence"}</span>
                      <q>{item.evidence.sourceText}</q>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No quantities were extracted from this document.</p>
      )}

      {result.refusals.length > 0 && (
        <section className="refusals">
          <div>
            <p className="eyebrow">Needs review</p>
            <h2>Could not extract</h2>
          </div>
          {result.refusals.map((refusal, index) => (
            <article className="refusal" key={`${refusal.reason}-${index}`}>
              <div className="refusal-meta">{refusal.page ? `Page ${refusal.page}` : "Document"}</div>
              <strong>{refusal.userMessage}</strong>
              {refusal.sourceText && <q>{refusal.sourceText}</q>}
              <small>Reason: {refusal.reason}</small>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}

function HistoryPanel({
  documents,
  loading,
  error,
  selectedId,
  onRefresh,
  onSelect,
}: {
  documents: DocumentSummary[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onRefresh: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="history" aria-labelledby="history-heading">
      <div className="history-heading">
        <div>
          <p className="eyebrow">Saved results</p>
          <h2 id="history-heading">Previously processed</h2>
        </div>
        <button type="button" className="secondary-button" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error && <p className="history-error">{error}</p>}
      {!error && !loading && documents.length === 0 && <p className="empty">No saved documents yet.</p>}
      {documents.length > 0 && (
        <div className="history-list">
          {documents.map((document) => (
            <button
              type="button"
              className={`history-row ${selectedId === document.id ? "history-row-selected" : ""}`}
              key={document.id}
              onClick={() => onSelect(document.id)}
            >
              <span className="history-file">{document.file_name}</span>
              <span className="history-type">{document.document_type.replace("_", " ")}</span>
              <span className="history-method">{formatProcessingMode(document.processing_mode)}</span>
              <span className={`history-status ${document.status === "failed" ? "history-status-failed" : ""}`}>
                {document.status === "failed"
                  ? "Failed — upload to retry"
                  : requiresHumanReview({ processingMode: document.processing_mode, refusalCount: 0 })
                    ? "Needs review — AI result"
                    : document.status.replaceAll("_", " ")}
              </span>
              <span className="history-pages">{document.pages_processed} pages</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function formatProcessingMode(mode: "deterministic" | "ai" | "image") {
  return mode === "deterministic" ? "Deterministic text parser" : "Gemini AI";
}
