import type { IWorkflowTraceEntry } from "@/types";
import type { Plan } from "@/types/ai.types";

import { apiClient } from "./core";

export type WorkspaceFileKind =
  | "document"
  | "spreadsheet"
  | "image"
  | "code"
  | "data"
  | "archive"
  | "other";

export type WorkspaceFileStatus = "uploaded" | "processed" | "error";

export interface WorkspaceFileAnalysis {
  summary: string;
  response: string;
  plan?: Plan;
  analysisType?: string;
  agentsInvolved?: string[];
  workflowTrace?: IWorkflowTraceEntry[];
  fallbackUsed?: boolean;
  llmCallCount?: number;
  requestId?: string;
  updatedAt?: string;
}

export interface WorkspaceFileRecord {
  id: string;
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  extension?: string;
  kind: WorkspaceFileKind;
  status: WorkspaceFileStatus;
  extractedPreview?: string;
  extractedText?: string;
  extractionWarnings: string[];
  lastAnalyzedAt?: string;
  analysis?: WorkspaceFileAnalysis;
  createdAt?: string;
  updatedAt?: string;
}

export async function uploadWorkspaceFiles(files: File[]): Promise<{
  files: WorkspaceFileRecord[];
  request_id?: string;
}> {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));

  return apiClient("/files", {
    method: "POST",
    body: form,
  });
}

export async function listWorkspaceFiles(params: { page?: number; limit?: number; search?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.search) qs.set("search", params.search);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiClient<{
    files: WorkspaceFileRecord[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
    request_id?: string;
  }>(`/files${suffix}`);
}

export async function getWorkspaceFile(id: string) {
  return apiClient<{ file: WorkspaceFileRecord; request_id?: string }>(`/files/${id}`);
}

export async function analyzeWorkspaceFile(id: string, prompt?: string) {
  return apiClient<{ file: WorkspaceFileRecord; request_id?: string; cache_hit?: boolean }>(`/files/${id}/analyze`, {
    method: "POST",
    body: JSON.stringify(prompt?.trim() ? { prompt: prompt.trim() } : {}),
  });
}

export async function deleteWorkspaceFile(id: string) {
  return apiClient<{ file_id: string; request_id?: string }>(`/files/${id}`, {
    method: "DELETE",
  });
}
