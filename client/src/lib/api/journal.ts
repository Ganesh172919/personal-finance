import { apiClient } from "./core";

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

export async function recognizeHandwriting(
  file: File,
  params: { lang?: string; strokes?: unknown } = {}
): Promise<HandwritingRecognizeResponse> {
  const form = new FormData();
  form.append("file", file);
  if (params.lang) form.append("lang", params.lang);
  if (params.strokes !== undefined) {
    form.append("strokes", JSON.stringify(params.strokes));
  }

  return apiClient("/financial-journal/recognize-handwriting", {
    method: "POST",
    body: form,
  });
}

export async function listJournalEntries(params: { page?: number; limit?: number } = {}): Promise<any> {
  const qs = new URLSearchParams();
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiClient(`/financial-journal/entries${suffix}`);
}

export async function getJournalEntry(entryId: string): Promise<any> {
  return apiClient(`/financial-journal/entries/${entryId}`);
}

export async function generateJournalInsights(entryId: string): Promise<any> {
  return apiClient(`/financial-journal/entries/${entryId}/insights`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function patchJournalEntry(entryId: string, recognized_text: string): Promise<any> {
  return apiClient(`/financial-journal/entries/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify({ recognized_text }),
  });
}
