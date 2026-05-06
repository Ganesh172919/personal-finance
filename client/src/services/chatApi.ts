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
import type {
  IChatSession,
  ISendMessageResponse,
  IPaginatedSessions,
  IPaginatedMessages
} from "@/types/chat.types";
import type { IWorkflowTraceEntry } from "@/types";
import type { Plan } from "@/types/ai.types";

/** Fetch paginated chat sessions for the current user */
export async function fetchSessions(page = 1, limit = 50): Promise<IPaginatedSessions> {
  return apiClient<IPaginatedSessions>(`/chat/sessions?page=${page}&limit=${limit}`);
}

/** Fetch a single session by ID */
export async function fetchSession(sessionId: string): Promise<IChatSession> {
  return apiClient<IChatSession>(`/chat/sessions/${sessionId}`);
}

/** Create a new chat session */
export async function createSession(): Promise<IChatSession> {
  return apiClient<IChatSession>("/chat/sessions", {
    method: "POST"
  });
}

/** Delete a chat session and all its messages */
export async function deleteSession(sessionId: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/chat/sessions/${sessionId}`, {
    method: "DELETE"
  });
}

/** Rename a chat session title */
export async function renameSession(sessionId: string, title: string): Promise<IChatSession> {
  return apiClient<IChatSession>(`/chat/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify({ title })
  });
}

/** Fetch paginated messages for a session */
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
export async function sendMessage(
  sessionId: string,
  content: string,
  options?: { narrative?: boolean; fileIds?: string[] }
): Promise<ISendMessageResponse> {
  const payload: { content: string; fileIds?: string[]; options?: { narrative?: boolean } } = { content };
  // Only include fileIds if there are actual attachments
  if (Array.isArray(options?.fileIds) && options.fileIds.length > 0) {
    payload.fileIds = options.fileIds;
  }
  // Only include options if narrative is specified
  if (typeof options?.narrative === "boolean") {
    payload.options = { narrative: options.narrative };
  }

  return apiClient<ISendMessageResponse>(`/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

/** Response from the cross-conversation insights endpoint */
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
  sessions_considered: number;
}

/**
 * Fetch cross-conversation insights.
 * Analyzes all user chat sessions to identify patterns and provide
 * holistic financial recommendations.
 */
export async function fetchConversationInsights(): Promise<ConversationInsightsResponse> {
  return apiClient<ConversationInsightsResponse>("/chat/insights/conversation");
}
