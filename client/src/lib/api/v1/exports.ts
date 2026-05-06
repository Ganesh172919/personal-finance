/**
 * @fileoverview V1 Data Export API
 *
 * Manages asynchronous data export jobs. Users can request exports of
 * their financial data (transactions, reports, etc.) which are processed
 * server-side and made available for download as files.
 *
 * Key concepts:
 * - **Export Jobs**: Each export request creates a job that progresses
 *   through statuses (pending -> processing -> completed -> failed).
 *   Jobs are listed and fetched by ID.
 * - **File Download**: Once completed, the export file can be downloaded
 *   as a Blob. The `downloadExportFile` function bypasses the standard
 *   `apiClient` to handle binary responses directly via `fetch`, manually
 *   setting the org header and credentials.
 * - **Content-Disposition Parsing**: The server may include a filename in
 *   the `Content-Disposition` header; the helper parses it with UTF-8
 *   decoding support and falls back to a generated name.
 * - **Browser Download Trigger**: `triggerBrowserDownload` creates a
 *   temporary `<a>` element to trigger the browser's native download
 *   dialog, then cleans up the object URL.
 */

import { buildApiUrl } from "@/lib/apiBase";
import { parseApiError } from "@/lib/apiError";
import { getActiveOrgId } from "@/lib/orgContext";

import { apiClient } from "../core";

import type {
  CreateExportRequest,
  CreateExportResponse,
  ExportJob,
  ExportJobStatus,
  ExportJobType,
  GetExportResponse,
  ListExportsResponse,
} from "@/types/apiTypes";

export type { ExportJob, ExportJobStatus, ExportJobType, ListExportsResponse };

/** List export jobs, optionally filtered by status and limited in count. */
export async function listExports(query?: { status?: ExportJobStatus; limit?: number }): Promise<ListExportsResponse> {
  const params = new URLSearchParams();
  if (query?.status) params.set("status", query.status);
  if (typeof query?.limit === "number") params.set("limit", String(query.limit));
  const suffix = params.toString();
  const endpoint = suffix ? `/v1/exports?${suffix}` : "/v1/exports";
  return apiClient(endpoint);
}

/** Create a new export job (processed asynchronously on the server). */
export async function createExport(body: CreateExportRequest): Promise<CreateExportResponse> {
  return apiClient("/v1/exports", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Fetch the status and metadata of a single export job. */
export async function getExportById(id: string): Promise<GetExportResponse> {
  return apiClient(`/v1/exports/${id}`);
}

/**
 * Parse a filename from the Content-Disposition header.
 * Handles both `filename="foo.csv"` and `filename*=UTF-8''foo%20bar.csv` forms.
 */
const parseFilenameFromContentDisposition = (value: string | null) => {
  if (!value) return null;
  const match = /filename\*?=(?:UTF-8''|"?)([^";]+)"?/i.exec(value);
  if (!match) return null;
  // Attempt URI decoding for UTF-8 encoded filenames; fall back to raw match.
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

/**
 * Download the export file as a Blob.
 * Uses raw `fetch` instead of `apiClient` because the response is binary
 * and needs special handling for Content-Disposition parsing.
 */
export async function downloadExportFile(id: string): Promise<{ blob: Blob; filename: string; contentType: string }> {
  // Manually set auth headers since we're bypassing apiClient.
  const headers = new Headers();
  const activeOrgId = getActiveOrgId();
  if (activeOrgId) headers.set("X-Org-Id", activeOrgId);

  const response = await fetch(buildApiUrl(`/v1/exports/${id}/download`), {
    method: "GET",
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  const contentType = response.headers.get("Content-Type") || "application/octet-stream";
  const filenameFromHeader = parseFilenameFromContentDisposition(response.headers.get("Content-Disposition"));
  const fallbackFilename = `export-${id}`;
  const blob = await response.blob();

  return {
    blob,
    filename: filenameFromHeader || fallbackFilename,
    contentType,
  };
}

/**
 * Trigger a browser download dialog for a Blob.
 * Creates a temporary object URL and hidden <a> element, clicks it,
 * then cleans up both the element and the URL.
 */
export const triggerBrowserDownload = (params: { blob: Blob; filename: string }) => {
  const url = URL.createObjectURL(params.blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = params.filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
};


