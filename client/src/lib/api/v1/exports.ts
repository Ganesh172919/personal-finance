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

// Retrieves all asynchronous data export jobs filtered by processing status.
// Formulates query parameters for execution status and maximum record limits.
// Dispatches an authenticated GET request returning past and pending export jobs.
/** List export jobs, optionally filtered by status and limited in count. */
export async function listExports(query?: { status?: ExportJobStatus; limit?: number }): Promise<ListExportsResponse> {
  const params = new URLSearchParams();
  if (query?.status) params.set("status", query.status);
  if (typeof query?.limit === "number") params.set("limit", String(query.limit));
  const suffix = params.toString();
  const endpoint = suffix ? `/exports?${suffix}` : "/exports";
  return apiClient(endpoint);
}

// Initiates an asynchronous server-side data export job for requested financial domains.
// Serializes export parameters including formats, date ranges, and categories.
// Dispatches an authenticated POST request queuing the background generation task.
/** Create a new export job (processed asynchronously on the server). */
export async function createExport(body: CreateExportRequest): Promise<CreateExportResponse> {
  return apiClient("/exports", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Fetches the current processing status and download metadata for an export job.
// Inspects progression states from pending through completed or failed.
// Dispatches an authenticated GET request addressing the specific export identifier.
/** Fetch the status and metadata of a single export job. */
export async function getExportById(id: string): Promise<GetExportResponse> {
  return apiClient(`/exports/${id}`);
}

// Extracts the encoded attachment filename from a response Content-Disposition header.
// Supports standard quoted strings and RFC-5987 UTF-8 percent-encoded filename variants.
// Returns the decoded string or null if no valid filename attribute is present.
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

// Downloads the completed binary export file as an in-memory Blob object.
// Attaches active organization authentication headers while bypassing default JSON parsing.
// Extracts content types and attachment filenames directly from response headers.
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

  const response = await fetch(buildApiUrl(`/exports/${id}/download`), {
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

// Triggers native browser file download handling for an in-memory binary Blob.
// Creates a temporary anchor element pointing to an ephemeral object URL.
// Revokes the allocated object URL immediately following anchor dispatch.
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

// Defines supported external delivery targets for automated recurring export jobs.
// Supports direct email dispatch, external webhook streaming, and cloud bucket uploads.
// Guides outbound transport adapter configuration during scheduled report dispatch.
export type ScheduledExportDestination = "email" | "webhook" | "cloud_storage";

// Encapsulates configuration parameters for remote automated export destinations.
// Defines webhook endpoints, cloud storage bucket names, regions, and custom filenames.
// Secures transport parameters for external delivery to Amazon S3 or Google Cloud Storage.
export interface ScheduledExportDestinationConfig {
  webhook_url?: string;
  has_auth_header?: boolean;
  cloud_provider?: "s3" | "gcs";
  bucket_name?: string;
  bucket_region?: string;
  bucket_prefix?: string;
  custom_filename?: string;
}

// Represents a persistent scheduled export rule with automated cadence configuration.
// Tracks execution frequency, target destinations, delivery audit logs, and error states.
// Drives scheduled export administration and recurring report management dashboards.
export interface ScheduledExport {
  id: string;
  name: string;
  type: "transactions_csv" | "monthly_summary_pdf";
  frequency: "weekly" | "monthly";
  destination?: ScheduledExportDestination;
  destination_config?: ScheduledExportDestinationConfig;
  delivery_email?: string;
  status: "active" | "paused" | "running";
  params: Record<string, unknown>;
  last_run_at: string | null;
  next_run_at: string | null;
  last_delivery_status: "success" | "failed" | "none";
  last_delivery_details?: Record<string, unknown>;
  last_error: string | null;
  created_at: string | null;
  updated_at?: string | null;
}

// Encapsulates the response payload containing active scheduled export rules.
// Delivers scheduled export collections alongside tracking request identifiers.
// Powers administration tables displaying automated recurring export jobs.
export interface ListScheduledExportsResponse {
  schedules: ScheduledExport[];
  request_id?: string;
}

// Defines parameters required to establish a new recurring data export schedule.
// Encapsulates export format types, frequency cadences, and destination parameters.
// Submits automation specifications to register recurring data extraction jobs.
export interface CreateScheduledExportRequest {
  name: string;
  type: "transactions_csv" | "monthly_summary_pdf";
  frequency: "weekly" | "monthly";
  destination?: ScheduledExportDestination;
  destination_config?: ScheduledExportDestinationConfig;
  delivery_email?: string;
  params?: Record<string, unknown>;
}

// Defines mutable attributes for modifying an existing scheduled export configuration.
// Allows partial updates for delivery destinations, cadence frequencies, or pause states.
// Validates modified schedule parameters prior to persisting rule updates.
export interface UpdateScheduledExportRequest {
  name?: string;
  frequency?: "weekly" | "monthly";
  destination?: ScheduledExportDestination;
  destination_config?: ScheduledExportDestinationConfig;
  delivery_email?: string;
  status?: "active" | "paused";
  params?: Record<string, unknown>;
}

// Queries all recurring scheduled export jobs configured for the active organization.
// Dispatches an authenticated GET request loading active and paused export schedules.
// Powers overview tables displaying recurring report automation rules.
export async function listScheduledExports(): Promise<ListScheduledExportsResponse> {
  return apiClient("/exports/schedules");
}

// Registers a new automated recurring export rule for transactions or monthly summaries.
// Dispatches an authenticated POST request with scheduling and delivery criteria.
// Returns the newly provisioned scheduled export entity with calculated run times.
export async function createScheduledExport(
  body: CreateScheduledExportRequest,
): Promise<{ schedule: ScheduledExport; request_id?: string }> {
  return apiClient("/exports/schedules", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Modifies parameters or toggles active status on an existing export schedule by ID.
// Dispatches an authenticated PATCH request transmitting updated destination or timing rules.
// Returns the updated schedule definition to sync client automation state.
export async function updateScheduledExport(
  id: string,
  body: UpdateScheduledExportRequest,
): Promise<{ schedule: ScheduledExport; request_id?: string }> {
  return apiClient(`/exports/schedules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// Permanently removes a scheduled recurring export rule identified by its ID.
// Dispatches an authenticated DELETE request unlinking the automated schedule.
// Cancels future automated report generation and cleans up recurring timers.
export async function deleteScheduledExport(
  id: string,
): Promise<{ success: boolean; deleted_id: string; request_id?: string }> {
  return apiClient(`/exports/schedules/${id}`, {
    method: "DELETE",
  });
}

// Triggers an immediate ad-hoc execution run of a configured export schedule.
// Dispatches an authenticated POST request initiating export compilation and delivery.
// Returns delivery confirmation metrics, generated file checksums, and job references.
export async function triggerScheduledExportNow(id: string): Promise<{
  result: {
    success: boolean;
    destination?: string;
    delivery_email?: string;
    webhook_url?: string;
    cloud_uri?: string;
    checksum_sha256?: string;
    size_bytes?: number;
    email_mode?: string;
    job_id?: string;
  };
  schedule?: ScheduledExport;
  request_id?: string;
}> {
  return apiClient(`/exports/schedules/${id}/run`, {
    method: "POST",
  });
}



