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

export async function listExports(query?: { status?: ExportJobStatus; limit?: number }): Promise<ListExportsResponse> {
  const params = new URLSearchParams();
  if (query?.status) params.set("status", query.status);
  if (typeof query?.limit === "number") params.set("limit", String(query.limit));
  const suffix = params.toString();
  const endpoint = suffix ? `/v1/exports?${suffix}` : "/v1/exports";
  return apiClient(endpoint);
}

export async function createExport(body: CreateExportRequest): Promise<CreateExportResponse> {
  return apiClient("/v1/exports", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getExportById(id: string): Promise<GetExportResponse> {
  return apiClient(`/v1/exports/${id}`);
}

const parseFilenameFromContentDisposition = (value: string | null) => {
  if (!value) return null;
  const match = /filename\*?=(?:UTF-8''|"?)([^";]+)"?/i.exec(value);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

export async function downloadExportFile(id: string): Promise<{ blob: Blob; filename: string; contentType: string }> {
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


