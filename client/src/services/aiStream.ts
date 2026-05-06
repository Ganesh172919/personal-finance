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

/**
 * Creates a streaming AI request.
 *
 * @param payload - The AI request payload (command, context, etc.)
 * @param signal - AbortSignal for cancellation (optional)
 * @returns Raw fetch Response (not parsed — caller reads the stream)
 */
export function createAiStreamRequest(
  payload: Record<string, unknown>,
  signal?: AbortSignal,
) {
  return fetch(buildApiUrl("/v1/ai/process/stream"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include", // Send JWT cookie for authentication
    signal,                 // AbortSignal for cancellation
  });
}
