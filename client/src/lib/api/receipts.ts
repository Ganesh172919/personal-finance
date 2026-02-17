import { apiClient } from "./core";

export type ReceiptParseResponse = {
  receipt_id: string;
  file_id: string;
  extracted: Record<string, any>;
  confidence: Record<string, any>;
  warnings: string[];
  request_id?: string;
  success?: boolean;
};

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

export async function confirmReceipt(receiptId: string, payload: ReceiptConfirmPayload): Promise<any> {
  return apiClient(`/receipts/${receiptId}/confirm`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

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

export async function getReceiptById(receiptId: string): Promise<{ receipt: ReceiptRecord; request_id?: string }> {
  return apiClient(`/receipts/${receiptId}`);
}

export async function deleteReceipt(receiptId: string): Promise<{ receipt_id: string; request_id?: string }> {
  return apiClient(`/receipts/${receiptId}`, { method: "DELETE" });
}
