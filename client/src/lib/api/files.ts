/**
 * @fileoverview Workspace File Management API
 *
 * Manages user-uploaded files in the workspace. Supports uploading
 * documents, images, spreadsheets, and other file types, then running
 * AI-powered analysis on them to extract insights, summaries, and
 * actionable plans.
 *
 * Key concepts:
 * - **Workspace Files**: Uploaded files stored server-side with metadata
 *   (name, MIME type, size, kind classification). Files go through an
 *   extraction step to pull out text content and previews.
 * - **File Analysis**: An AI-powered endpoint that analyses file content
 *   and returns a summary, natural-language response, and optionally a
 *   structured plan. Results are cached -- subsequent calls for the same
 *   file return `cache_hit: true`.
 * - **File Kind**: Automatic classification of uploaded files into
 *   categories (document, spreadsheet, image, code, data, archive, other)
 *   based on MIME type and extension.
 * - **Multi-file Upload**: The upload endpoint accepts multiple files in
 *   a single request via FormData.
 *
 * All functions delegate to the shared `apiClient` for consistent
 * authentication, error handling, and organisation context.
 */

import type { IWorkflowTraceEntry } from "@/types";
import type { Plan } from "@/types/ai.types";

import { apiClient } from "./core";

/** Classification of a workspace file by its content type. */
export type WorkspaceFileKind =
  | "document"
  | "spreadsheet"
  | "image"
  | "code"
  | "data"
  | "archive"
  | "other";

export type WorkspaceFileStatus = "uploaded" | "processed" | "error";

/** AI analysis results attached to a workspace file after processing. */
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

/** Complete metadata record for a file stored in the workspace. */
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

/**
 * Upload one or more files to the workspace in a single request.
 * Each file is appended to the FormData under the same "files" key.
 */
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

/** List workspace files with optional pagination and text search. */
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

/** Fetch a single workspace file record by ID. */
export async function getWorkspaceFile(id: string) {
  return apiClient<{ file: WorkspaceFileRecord; request_id?: string }>(`/files/${id}`);
}

/**
 * Run AI analysis on a workspace file. Results are cached server-side;
 * subsequent calls for the same file return `cache_hit: true`.
 * An optional `prompt` can customise what the AI focuses on.
 */
export async function analyzeWorkspaceFile(id: string, prompt?: string) {
  return apiClient<{ file: WorkspaceFileRecord; request_id?: string; cache_hit?: boolean }>(`/files/${id}/analyze`, {
    method: "POST",
    body: JSON.stringify(prompt?.trim() ? { prompt: prompt.trim() } : {}),
  });
}

/** Permanently delete a workspace file and its analysis results. */
export async function deleteWorkspaceFile(id: string) {
  return apiClient<{ file_id: string; request_id?: string }>(`/files/${id}`, {
    method: "DELETE",
  });
}
