/**
 * @fileoverview Receipt OCR & Processing API
 *
 * Handles the end-to-end receipt processing pipeline: upload an image,
 * extract structured data via OCR, review/confirms the extracted fields,
 * and manage stored receipt records.
 *
 * Key concepts:
 * - **Two-phase workflow**: First `parseReceipt` uploads the image and
 *   returns extracted fields with confidence scores. Then `confirmReceipt`
 *   lets the user review and correct the data before it becomes a
 *   transaction.
 * - **Confidence & Warnings**: The parse response includes per-field
 *   confidence scores and warning strings so the UI can flag fields that
 *   need human review.
 * - **Receipt Status**: Receipts move through `"parsed"` -> `"confirmed"`
 *   once the user validates the extracted data.
 *
 * Uses `FormData` for the parse endpoint (multipart file upload) and
 * standard JSON for all other endpoints.
 */

import { apiClient } from "./core";

// Defines the response payload returned upon uploading and parsing a receipt image.
// Packages the extracted financial properties, model confidence scores, and syntax warnings.
// Powers visual OCR verification forms enabling user corrections before record commit.
/** Response returned after uploading and parsing a receipt image. */
export type ReceiptParseResponse = {
  receipt_id: string;
  file_id: string;
  extracted: Record<string, any>;
  confidence: Record<string, any>;
  warnings: string[];
  request_id?: string;
  success?: boolean;
};

// Submits an uploaded receipt document or image binary for OCR and entity extraction.
// Packages multipart form data with optional localization hints and currency targets.
// Dispatches an authenticated POST request returning structured OCR predictions.
/**
 * Upload a receipt image for OCR parsing.
 * Returns extracted fields (vendor, date, total, etc.) with confidence scores.
 * Optional `lang` and `currencyHint` help the parser disambiguate the content.
 */
export async function parseReceipt(
  file: File,
  params: { lang?: string; currencyHint?: string } = {}
): Promise<ReceiptParseResponse> {
  const form = new FormData();
  form.append("file", file);
  if (params.lang) form.append("lang", params.lang);
  if (params.currencyHint) form.append("currencyHint", params.currencyHint);

  return apiClient("/receipts/parse", {
    method: "POST",
    body: form,
  });
}

// Represents user-verified receipt fields submitted to finalize transaction ingestion.
// Enforces vendor identity, parsed transaction dates, tax sums, and line items.
// Converts optical character extraction artifacts into verified ledger entries.
/** User-validated receipt data sent to confirm/lock the parsed result. */
export type ReceiptConfirmPayload = {
  vendor: string;
  date: string; // YYYY-MM-DD
  total: number;
  tax?: number;
  currency?: string;
  category: string;
  description?: string;
  items?: Array<{ description: string; quantity?: number; unit_price?: number; total?: number }>;
};

// Submits finalized receipt transaction details following human review and correction.
// Changes receipt processing state to confirmed and links created ledger transactions.
// Dispatches an authenticated POST request to lock extracted financial parameters.
/**
 * Confirm/correct the extracted receipt data after user review.
 * This transitions the receipt status from "parsed" to "confirmed"
 * and may trigger transaction creation on the server.
 */
export async function confirmReceipt(receiptId: string, payload: ReceiptConfirmPayload): Promise<any> {
  return apiClient(`/receipts/${receiptId}/confirm`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Represents the sequential processing lifecycle state of an uploaded receipt file.
// Distinguishes newly parsed OCR drafts from verified and finalized user receipts.
// Governs transaction conversion permissions and editing behaviors across the UI.
/** Lifecycle status of a receipt: freshly parsed, or user-confirmed. */
export type ReceiptStatus = "parsed" | "confirmed";

// Represents an audit log entity tracking an uploaded receipt document in persistence.
// Maintains extraction payloads, confidence assessments, corrections, and linked files.
// Provides historical tracking across user verification and bookkeeping pipelines.
export type ReceiptRecord = {
  id: string;
  status: ReceiptStatus;
  extracted: Record<string, any>;
  confidence?: Record<string, any>;
  warnings?: string[];
  corrections?: Record<string, any>;
  transactionId?: string;
  fileId?: string;
  createdAt?: string;
  updatedAt?: string;
};

// Retrieves a paginated list of uploaded receipt documents with parsing metadata.
// Encodes pagination query parameters for offset and page length navigation.
// Dispatches an authenticated GET request fetching user receipt history collections.
/** List stored receipts with pagination support. */
export async function listReceipts(params: { page?: number; limit?: number } = {}): Promise<{
  receipts: ReceiptRecord[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const qs = new URLSearchParams();
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiClient(`/receipts${suffix}`);
}

// Fetches the complete record and optical extraction details for a single receipt ID.
// Includes extracted item breakdowns, confidence distributions, and linked transactions.
// Dispatches an authenticated GET request to render receipt detail inspection views.
/** Fetch a single receipt record by ID, including extracted data and confidence. */
export async function getReceiptById(receiptId: string): Promise<{ receipt: ReceiptRecord; request_id?: string }> {
  return apiClient(`/receipts/${receiptId}`);
}

// Permanently deletes an uploaded receipt document and its extracted OCR records.
// Removes parsed entity mappings while cleaning up related storage references.
// Dispatches an authenticated DELETE request with the target receipt identifier.
/** Permanently delete a receipt record by its ID. */
export async function deleteReceipt(receiptId: string): Promise<{ receipt_id: string; request_id?: string }> {
  return apiClient(`/receipts/${receiptId}`, { method: "DELETE" });
}
