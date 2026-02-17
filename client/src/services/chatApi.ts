import { apiClient } from "@/lib/apiClient";
import type {
  IChatSession,
  ISendMessageResponse,
  IPaginatedSessions,
  IPaginatedMessages
} from "@/types/chat.types";

/**
 * Chat API Service
 * Handles all chat-related API calls
 */

export async function fetchSessions(page = 1, limit = 50): Promise<IPaginatedSessions> {
  return apiClient<IPaginatedSessions>(`/chat/sessions?page=${page}&limit=${limit}`);
}

export async function fetchSession(sessionId: string): Promise<IChatSession> {
  return apiClient<IChatSession>(`/chat/sessions/${sessionId}`);
}

export async function createSession(): Promise<IChatSession> {
  return apiClient<IChatSession>("/chat/sessions", {
    method: "POST"
  });
}

export async function deleteSession(sessionId: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/chat/sessions/${sessionId}`, {
    method: "DELETE"
  });
}

export async function renameSession(sessionId: string, title: string): Promise<IChatSession> {
  return apiClient<IChatSession>(`/chat/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify({ title })
  });
}

export async function fetchMessages(
  sessionId: string,
  page = 1,
  limit = 50
): Promise<IPaginatedMessages> {
  return apiClient<IPaginatedMessages>(
    `/chat/sessions/${sessionId}/messages?page=${page}&limit=${limit}`
  );
}

export async function sendMessage(
  sessionId: string,
  content: string,
  options?: { narrative?: boolean }
): Promise<ISendMessageResponse> {
  const payload: { content: string; options?: { narrative?: boolean } } = { content };
  if (typeof options?.narrative === "boolean") {
    payload.options = { narrative: options.narrative };
  }

  return apiClient<ISendMessageResponse>(`/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
