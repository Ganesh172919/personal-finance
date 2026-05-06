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

/** Lifecycle status of a receipt: freshly parsed, or user-confirmed. */
export type ReceiptStatus = "parsed" | "confirmed";

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

/** Fetch a single receipt record by ID, including extracted data and confidence. */
export async function getReceiptById(receiptId: string): Promise<{ receipt: ReceiptRecord; request_id?: string }> {
  return apiClient(`/receipts/${receiptId}`);
}

/** Permanently delete a receipt record by its ID. */
export async function deleteReceipt(receiptId: string): Promise<{ receipt_id: string; request_id?: string }> {
  return apiClient(`/receipts/${receiptId}`, { method: "DELETE" });
}
