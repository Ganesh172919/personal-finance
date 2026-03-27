/**
 * Chat-related TypeScript interfaces
 */

import type { Plan, ToolCall } from "@/types/ai.types";

export interface IChatAttachment {
  workspaceFileId: string;
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface IChatSession {
  id: string;
  title: string;
  lastMessageAt: Date | string;
  messageCount: number;
  createdAt: Date | string;
}

export interface IChatMessageMetadata {
  attachments?: IChatAttachment[];
  analysisType?: string;
  agentsInvolved?: string[];
  priority?: 'low' | 'medium' | 'high';
  actionable?: boolean;
  plan?: Plan;
  toolCalls?: ToolCall[];
  agentOutputId?: string;
  taskIds?: string[];
  appliedTaskIds?: string[];
  detailedAnalysis?: Record<string, unknown>;
  workflowTrace?: Array<{
    agent: string;
    startedAt: string;
    endedAt: string;
    status: string;
    error?: string;
  }>;
  fallbackUsed?: boolean;
  llmCallCount?: number;
  requestId?: string;
  actionLinkId?: string;
  linkedTaskIds?: string[];
  taskApplyRequestId?: string;
  aiCoreDurationMs?: number;
  cacheHit?: boolean;
}

export interface IChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: IChatMessageMetadata;
  createdAt: Date | string;
}

export interface ISendMessageResponse {
  userMessage: IChatMessage;
  assistantMessage: IChatMessage;
}

export interface IPaginatedSessions {
  sessions: IChatSession[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface IPaginatedMessages {
  messages: IChatMessage[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
