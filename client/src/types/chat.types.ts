/**
 * @fileoverview Chat Type Definitions
 *
 * TypeScript interfaces for the AI chat system: sessions, messages,
 * attachments, and message metadata. These types are used by the chat
 * store, API client, and chat UI components.
 *
 * MESSAGE METADATA:
 * The `IChatMessageMetadata` interface is intentionally large — it captures
 * all possible metadata the AI system can attach to a response, including
 * analysis results, tool calls, workflow traces, and debugging info.
 * Most fields are optional because different response types populate
 * different metadata fields.
 *
 * @module types/chat.types
 */

import type { Plan, ToolCall } from "@/types/ai.types";

/** File attachment in a chat message (references a workspace file) */
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
  aiSessionId?: string;
  aiSessionStatus?: string;
  aiSessionPhase?: string;
  aiRequestId?: string;
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
  evidence?: Array<{
    id?: string;
    type?: string;
    label?: string;
    snippet?: string;
    entity_id?: string;
  }>;
  confidence?: {
    score?: number;
    label?: string;
    notes?: string[];
    coverage?: Record<string, unknown>;
  };
  suggestedActions?: Array<{
    title?: string;
    why?: string;
    priority?: "low" | "medium" | "high";
    entity_id?: string;
  }>;
  linkedEntityIds?: Record<string, string[]>;
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
  sessionId?: string;
  sessionStatus?: string;
  workflowPhase?: string;
  activeProvider?: string;
  activeModel?: string;
  activeKeyId?: string;
  fallbackPath?: string[];
  recoveredFailures?: Array<Record<string, unknown>>;
  recoveredFromCheckpoint?: boolean;
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
