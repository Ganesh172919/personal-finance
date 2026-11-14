/**
 * @fileoverview AI Stream Service
 *
 * This module provides the HTTP request function for streaming AI responses.
 * It sends a POST request to the AI streaming endpoint and returns the
 * raw fetch Response (not parsed) so the caller can read the stream.
 *
 * WHY RETURN RAW RESPONSE?
 * The caller (useAIStream hook) needs access to response.body (ReadableStream)
 * to process SSE chunks incrementally. If we parsed the response here, we'd
 * lose the streaming capability.
 *
 * @module services/aiStream
 */

import { buildApiUrl } from "@/lib/apiBase";
import { buildApiRequestHeaders, fetchCsrfToken, getCsrfToken } from "@/lib/api/core";
import { getActiveOrgId } from "@/lib/orgContext";
import { getRequestContextRevision } from "@/lib/requestContext";

/**
 * Creates a streaming AI request.
 *
 * @param payload - The AI request payload (command, context, etc.)
 * @param signal - AbortSignal for cancellation (optional)
 * @returns Raw fetch Response (not parsed — caller reads the stream)
 */
// Initiates an HTTP streaming request to the backend AI inference pipeline.
// Injects contextual headers, CSRF tokens, and credentials into the raw request.
// Preserves the readable stream body for real-time Server-Sent Events decoding.
export async function createAiStreamRequest(
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  const contextRevision = getRequestContextRevision();
  const activeOrgId = getActiveOrgId();
  const userId = (() => {
    try { return window.localStorage.getItem("userId"); } catch { return null; }
  })();
  const checkContext = () => {
    if (signal?.aborted) throw new DOMException("Stream request cancelled", "AbortError");
    let currentUserId: string | null = null;
    try { currentUserId = window.localStorage.getItem("userId"); } catch { /* unavailable */ }
    if (contextRevision !== getRequestContextRevision() || activeOrgId !== getActiveOrgId() || userId !== currentUserId) {
      throw new Error("Account or workspace changed while starting the AI stream");
    }
  };

  // Unlike apiClient, the response body must remain untouched on success so
  // SSE tokens can be consumed incrementally. It still needs the same headers.
  if (!getCsrfToken()) await fetchCsrfToken();
  checkContext();
  const url = buildApiUrl("/ai/process/stream");
  const body = JSON.stringify(payload);
  const send = () => fetch(url, {
    method: "POST",
    headers: buildApiRequestHeaders("POST", { body }, activeOrgId).headers,
    body,
    credentials: "include",
    signal,
  });
  const response = await send();
  checkContext();
  if (response.status !== 403) return response;

  const error = await response.clone().json().catch(() => null);
  if (error?.code !== "CSRF_FAILED") return response;
  const refreshed = await fetchCsrfToken().catch(() => null);
  checkContext();
  if (!refreshed) return response;
  const retried = await send();
  checkContext();
  return retried;
}
