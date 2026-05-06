/**
 * @fileoverview Financial Journal API
 *
 * Provides a handwritten financial journal feature. Users can photograph
 * handwritten notes (e.g., expense logs in a physical notebook), and the
 * system uses OCR to recognise the text, extract structured financial
 * values, and store them as journal entries.
 *
 * Key concepts:
 * - **Handwriting Recognition**: Upload an image of handwritten notes;
 *   the server performs OCR and returns recognised text, detected numeric
 *   values, and per-field confidence scores.
 * - **Journal Entries**: Persisted records of recognised entries that can
 *   be listed, fetched, patched (corrected), and used to generate AI
 *   insights.
 * - **AI Insights**: Each entry can trigger a server-side AI analysis
 *   that produces personalised financial observations based on the entry
 *   content.
 *
 * Uses `FormData` for the handwriting endpoint (multipart file upload)
 * and standard JSON for all other endpoints.
 */

import { apiClient } from "./core";

/** Response from the handwriting recognition (OCR) endpoint. */
export type HandwritingRecognizeResponse = {
  entry_id: string;
  file_id: string;
  recognized_text: string;
  confidence: Record<string, any>;
  detected_values: Record<string, any>;
  warnings: string[];
  request_id?: string;
  success?: boolean;
};

/**
 * Upload a handwritten note image for OCR recognition.
 * `lang` hints the language; `strokes` can pass raw stylus/pen stroke data
 * for devices that capture it, improving recognition accuracy.
 */
export async function recognizeHandwriting(
  file: File,
  params: { lang?: string; strokes?: unknown } = {}
): Promise<HandwritingRecognizeResponse> {
  const form = new FormData();
  form.append("file", file);
  if (params.lang) form.append("lang", params.lang);
  // Stroke data is serialised as JSON within the multipart form.
  if (params.strokes !== undefined) {
    form.append("strokes", JSON.stringify(params.strokes));
  }

  return apiClient("/financial-journal/recognize-handwriting", {
    method: "POST",
    body: form,
  });
}

/** List journal entries with optional pagination. */
export async function listJournalEntries(params: { page?: number; limit?: number } = {}): Promise<any> {
  const qs = new URLSearchParams();
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiClient(`/financial-journal/entries${suffix}`);
}

/** Fetch a single journal entry by ID. */
export async function getJournalEntry(entryId: string): Promise<any> {
  return apiClient(`/financial-journal/entries/${entryId}`);
}

/**
 * Trigger server-side AI analysis on a journal entry to produce
 * personalised financial insights and observations.
 */
export async function generateJournalInsights(entryId: string): Promise<any> {
  return apiClient(`/financial-journal/entries/${entryId}/insights`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Correct or update the recognised text of an existing journal entry. */
export async function patchJournalEntry(entryId: string, recognized_text: string): Promise<any> {
  return apiClient(`/financial-journal/entries/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify({ recognized_text }),
  });
}
