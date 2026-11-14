/**
 * @fileoverview Financial Journal API
 *
 * Provides a handwritten financial journal feature. Users can photograph
 * handwritten notes (e.g., expense logs in a physical notebook), and the
 * system uses OCR to recognise the text, extract structured financial
 * values, and store them as journal entries. Also provides offline stroke
 * queue batch synchronization and dense semantic vector search with cosine similarity.
 *
 * Key concepts:
 * - **Handwriting Recognition**: Upload an image of handwritten notes;
 *   the server performs OCR and returns recognised text, detected numeric
 *   values, and per-field confidence scores.
 * - **Journal Entries**: Persisted records of recognised entries that can
 *   be listed, fetched, patched (corrected), and used to generate AI insights.
 * - **Offline Stroke Sync**: Ingest queued offline strokes with clientDraftId
 *   deduplication and automatic intent and tag extraction.
 * - **Semantic Vector Search**: Cosine similarity query over normalized 64-dim
 *   note embeddings with category tag filtering and similarity scores.
 *
 * Uses `FormData` for the handwriting endpoint (multipart file upload)
 * and standard JSON for all other endpoints.
 */

import { apiClient } from "./core";

/** Response from the handwriting recognition (OCR) endpoint. */
// Models the structured response returned by optical handwriting recognition engines.
// Delivers transcribed text, confidence scores, detected monetary figures, and warnings.
// Evaluates emotional sentiment and notes whether semantic embeddings were computed.
export type HandwritingRecognizeResponse = {
  entry_id: string;
  file_id: string;
  recognized_text: string;
  confidence: Record<string, any>;
  detected_values: Record<string, any>;
  warnings: string[];
  tags?: string[];
  sentiment?: "optimistic" | "concerned" | "neutral" | "urgent";
  has_embedding?: boolean;
  request_id?: string;
  success?: boolean;
};

// Defines the payload structure for synchronizing offline handwritten journal drafts.
// Carries local draft IDs, titles, transcribed text, tags, and raw stylus stroke arrays.
// Facilitates offline-first journaling on mobile tablets and stylus devices.
export type SyncOfflineNotePayload = {
  clientDraftId: string;
  title?: string;
  recognizedText?: string;
  strokes?: unknown;
  tags?: string[];
  createdAt?: string;
};

// Models the batch ingestion confirmation response for offline journal synchronizations.
// Details total synchronized notes, skipped duplicate entries, and parsed intent models.
// Reconciles local client draft identifiers with newly assigned database record IDs.
export type SyncOfflineNotesResponse = {
  success: boolean;
  syncedCount: number;
  duplicatesSkipped: number;
  entries: Array<{
    id: string;
    clientDraftId: string;
    title: string;
    recognizedText: string;
    tags: string[];
    sentiment: "optimistic" | "concerned" | "neutral" | "urgent";
    parsedIntent: Record<string, any>;
    createdAt: string;
    isDuplicate: boolean;
  }>;
  request_id?: string;
};

// Represents an individual journal entry matched during semantic vector searches.
// Captures cosine similarity scores, recognized text excerpts, tags, and sentiments.
// Delivers ranked search matches for qualitative financial journal exploration.
export type JournalSearchResult = {
  id: string;
  title: string;
  clientDraftId?: string;
  recognizedText: string;
  tags: string[];
  sentiment: "optimistic" | "concerned" | "neutral" | "urgent";
  parsedIntent: Record<string, any>;
  similarityScore: number;
  createdAt: string;
};

// Encapsulates the complete semantic search query result envelope for journal notes.
// Reports query terms, similarity threshold cutoffs, total matches, and result items.
// Supplies the data contract powering semantic search cards in the journal dashboard.
export type JournalSearchResponse = {
  query: string;
  threshold: number;
  totalMatches: number;
  results: JournalSearchResult[];
  request_id?: string;
};

/**
 * Upload a handwritten note image for OCR recognition.
 * `lang` hints the language; `strokes` can pass raw stylus/pen stroke data
 * for devices that capture it, improving recognition accuracy.
 */
// Uploads a photographed handwritten note or stylus stroke payload for OCR extraction.
// Packages image binaries and optional vector stroke data within multipart FormData.
// Returns transcribed financial text and parsed figures ready for user validation.
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
// Queries a paginated collection of historical financial journal entry records.
// Supports standard page indexing and limit parameters to paginate entry feeds.
// Delivers chronological journal timelines for user review and personal reflection.
export async function listJournalEntries(params: { page?: number; limit?: number } = {}): Promise<any> {
  const qs = new URLSearchParams();
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiClient(`/financial-journal/entries${suffix}`);
}

/** Fetch a single journal entry by ID. */
// Fetches the complete persisted record for a specific financial journal entry.
// Returns recognized text, detected financial values, sentiment tags, and warnings.
// Powers single-entry reader screens and editing interfaces within the journal view.
export async function getJournalEntry(entryId: string): Promise<any> {
  return apiClient(`/financial-journal/entries/${entryId}`);
}

/**
 * Trigger server-side AI analysis on a journal entry to produce
 * personalised financial insights and observations.
 */
// Triggers backend AI analysis to synthesize financial reflections on a journal note.
// Dispatches an analytical request to uncover spending habits and emotional patterns.
// Generates personalized coaching feedback and actionable financial advice.
export async function generateJournalInsights(entryId: string): Promise<any> {
  return apiClient(`/financial-journal/entries/${entryId}/insights`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Correct or update the recognised text of an existing journal entry. */
// Updates or corrects the recognized text and categorical tags of a journal entry.
// Submits human corrections to fix OCR transcription errors or update entry titles.
// Ensures accurate underlying text records before executing semantic search indexing.
export async function patchJournalEntry(
  entryId: string,
  recognized_text: string,
  options: { tags?: string[]; title?: string } = {}
): Promise<any> {
  return apiClient(`/financial-journal/entries/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify({ recognized_text, ...options }),
  });
}

/**
 * Batch synchronize queued offline notes & stroke drafts.
 */
// Dispatches a batch synchronization payload containing queued offline journal drafts.
// Deduplicates submissions using clientDraftId to prevent duplicated sync writes.
// Ensures offline journal entries seamlessly synchronize once network connectivity restores.
export async function syncOfflineJournalNotes(
  notes: SyncOfflineNotePayload[]
): Promise<SyncOfflineNotesResponse> {
  return apiClient("/financial-journal/entries/batch-sync", {
    method: "POST",
    body: JSON.stringify({ notes }),
  });
}

/**
 * Search journal entries using dense 64-dimensional semantic embeddings
 * and cosine similarity ranking with optional category tag filter.
 */
// Searches handwritten journal notes using dense semantic embeddings and cosine distance.
// Supports custom similarity threshold filters, result limits, and categorical tags.
// Dispatches semantic vector queries to retrieve conceptually relevant past notes.
export async function searchJournalEntries(params: {
  query: string;
  threshold?: number;
  limit?: number;
  tag?: string;
}): Promise<JournalSearchResponse> {
  const qs = new URLSearchParams();
  qs.set("query", params.query);
  if (params.threshold !== undefined) qs.set("threshold", String(params.threshold));
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.tag) qs.set("tag", params.tag);
  return apiClient(`/financial-journal/semantic-search?${qs.toString()}`);
}
