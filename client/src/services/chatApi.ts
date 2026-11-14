/**
 * @fileoverview Chat API Service
 *
 * Handles all chat-related API calls: session CRUD, message sending,
 * and conversation insights. Used by the chatStore for server communication.
 *
 * MESSAGE SENDING:
 * The sendMessage function supports optional file attachments and narrative
 * mode. Files must be uploaded to the workspace first (via files API),
 * then their IDs are included in the message payload.
 *
 * CONVERSATION INSIGHTS:
 * The fetchConversationInsights function triggers a cross-conversation
 * analysis that identifies patterns across all of a user's chat sessions.
 *
 * @module services/chatApi
 */

import { apiClient } from "@/lib/apiClient";
import { idempotencyHeaders } from "@/lib/idempotency";
import type {
  IChatSession,
  ISendMessageResponse,
  IPaginatedSessions,
  IPaginatedMessages
} from "@/types/chat.types";
import type { IWorkflowTraceEntry } from "@/types";
import type { Plan } from "@/types/ai.types";

/** Fetch paginated chat sessions for the current user */
// Fetches paginated chat conversation sessions for the authenticated user.
// Accepts pagination bounds controlling page index and item limits.
// Returns a paginated wrapper containing session metadata and total counts.
export async function fetchSessions(page = 1, limit = 50): Promise<IPaginatedSessions> {
  return apiClient<IPaginatedSessions>(`/chat/sessions?page=${page}&limit=${limit}`);
}

/** Fetch a single session by ID */
// Retrieves a single conversation session by its unique identifier.
// Returns comprehensive session metadata including title and message count.
// Throws an ApiError if the target conversation does not exist or lacks access.
export async function fetchSession(sessionId: string): Promise<IChatSession> {
  return apiClient<IChatSession>(`/chat/sessions/${sessionId}`);
}

/** Create a new chat session */
// Dispatches an API call to instantiate a new conversation thread.
// Establishes initial server-side records for chat history tracking.
// Returns the newly initialized session model for selection and routing.
export async function createSession(): Promise<IChatSession> {
  return apiClient<IChatSession>("/chat/sessions", {
    method: "POST"
  });
}

/** Delete a chat session and all its messages */
// Permanently removes a conversation session and all associated messages.
// Issues a DELETE request targeting the designated session identifier.
// Returns a confirmation payload upon successful backend deletion.
export async function deleteSession(sessionId: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/chat/sessions/${sessionId}`, {
    method: "DELETE"
  });
}

/** Rename a chat session title */
// Updates the display title for a specific conversation session.
// Sends a PATCH request containing the updated title string.
// Returns the modified session object with updated metadata.
export async function renameSession(sessionId: string, title: string): Promise<IChatSession> {
  return apiClient<IChatSession>(`/chat/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify({ title })
  });
}

/** Fetch paginated messages for a session */
// Retrieves paginated message history associated with a conversation session.
// Supports page and limit query parameters for incremental pagination.
// Returns messages sorted chronologically alongside pagination bounds.
export async function fetchMessages(
  sessionId: string,
  page = 1,
  limit = 50
): Promise<IPaginatedMessages> {
  return apiClient<IPaginatedMessages>(
    `/chat/sessions/${sessionId}/messages?page=${page}&limit=${limit}`
  );
}

/**
 * Send a message in a chat session.
 * Returns both the user message and the AI assistant response.
 *
 * @param sessionId - The chat session ID
 * @param content - Message text
 * @param options.narrative - Request narrative-style response
 * @param options.fileIds - Workspace file IDs to attach as context
 */
// Sends a user message to the backend conversational agent pipeline.
// Attaches optional file context IDs, idempotency tokens, and flags.
// Returns the synchronized user message and generated assistant reply.
export async function sendMessage(
  sessionId: string,
  content: string,
  options?: { narrative?: boolean; fileIds?: string[]; idempotencyKey?: string; regenerateOf?: string; bypassCache?: boolean }
): Promise<ISendMessageResponse> {
  const payload: {
    content: string;
    fileIds?: string[];
    options?: { narrative?: boolean; regenerate_of?: string; bypass_cache?: boolean };
  } = { content };
  // Only include fileIds if there are actual attachments
  if (Array.isArray(options?.fileIds) && options.fileIds.length > 0) {
    payload.fileIds = options.fileIds;
  }
  // Only include options if narrative is specified
  if (typeof options?.narrative === "boolean") {
    payload.options = { narrative: options.narrative };
  }
  // Regenerate: link to the previous output and skip the response cache (server also forces a cache bypass).
  if (options?.regenerateOf) {
    payload.options = { ...payload.options, regenerate_of: options.regenerateOf, bypass_cache: true };
  } else if (options?.bypassCache) {
    payload.options = { ...payload.options, bypass_cache: true };
  }

  return apiClient<ISendMessageResponse>(`/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: idempotencyHeaders(options?.idempotencyKey),
    body: JSON.stringify(payload)
  });
}

/** Response from the cross-conversation insights endpoint */
// Schema representing the cross-conversation analytical report payload.
// Encapsulates high-level insights, action plans, and execution traces.
// Reports aggregate metrics over the set of analyzed historical sessions.
export interface ConversationInsightsResponse {
  success: boolean;
  response: string;
  plan?: Plan;
  analysis_type?: string;
  agents_involved?: string[];
  workflow_trace?: IWorkflowTraceEntry[];
  fallback_used?: boolean;
  llm_call_count?: number;
  request_id?: string;
  cache_hit?: boolean;
  generated_at?: string;
  sessions_considered: number;
}

/**
 * Fetch cross-conversation insights.
 * Analyzes all user chat sessions to identify patterns and provide
 * holistic financial recommendations.
 */
// Requests synthesis of cross-conversation financial patterns and trends.
// Supports forced cache invalidation and tenant-specific org headers.
// Returns aggregated AI insights derived across multiple chat sessions.
export async function fetchConversationInsights(options?: { refresh?: boolean; orgId?: string }): Promise<ConversationInsightsResponse> {
  return apiClient<ConversationInsightsResponse>(`/chat/insights/conversation${options?.refresh ? "?refresh=1" : ""}`, {
    ...(options?.orgId ? { headers: { "X-Org-Id": options.orgId } } : {}),
  });
}
