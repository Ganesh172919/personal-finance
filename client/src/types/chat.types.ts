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
import type { EvidenceItem } from "@/types/evidence.types";

// Models binary and document attachments associated with chat messages.
// Points to underlying workspace file records, names, mime types, and byte sizes.
// Equips UI components with the metadata required to preview or download files.
/** File attachment in a chat message (references a workspace file) */
export interface IChatAttachment {
  workspaceFileId: string;
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

// Represents an interactive conversational thread conducted with AI agents.
// Tracks session creation timestamps, message counts, and AI runtime session IDs.
// Serves as the high-level grouping entity displayed in chat navigation sidebars.
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

// Comprehensive diagnostic and contextual metadata payload attached to chat messages.
// Encompasses generated documents, plans, tool requests, traces, and feedback tags.
// Powers rich client-side message widgets including citations, actions, and debug logs.
export interface IChatMessageMetadata {
  generatedDocuments?: Array<{ workspaceFileId: string; fileId: string; title: string; filename: string; mimeType: string; sizeBytes: number; format?: string; pageCount?: number }>;
  localDocument?: { title: string; content: string; kind?: "text" };
  attachments?: IChatAttachment[];
  analysisType?: string;
  agentsInvolved?: string[];
  priority?: 'low' | 'medium' | 'high';
  actionable?: boolean;
  plan?: Plan;
  toolCalls?: ToolCall[];
  agentOutputId?: string;
  /** Persisted thumbs feedback for this response (survives reload). */
  feedback?: { rating: "up" | "down"; reasonCode?: string; hasCorrection?: boolean; updatedAt?: string };
  promptVersion?: string;
  routingVersion?: string;
  taskIds?: string[];
  appliedTaskIds?: string[];
  detailedAnalysis?: Record<string, unknown>;
  evidence?: EvidenceItem[];
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
  recoveredFailureCount?: number;
  recoveredFromCheckpoint?: boolean;
}

// Models an individual turn within a conversational chat dialogue sequence.
// Captures sender role attribution, text content, associated metadata, and timestamps.
// Serves as the fundamental message unit rendered inside conversational bubble feeds.
export interface IChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: IChatMessageMetadata;
  createdAt: Date | string;
}

// Encapsulates the response payload returned after transmitting a user chat turn.
// Bundles the confirmed user message record alongside the synthesized assistant reply.
// Enables atomic state updates within client-side chat stores upon API completion.
export interface ISendMessageResponse {
  userMessage: IChatMessage;
  assistantMessage: IChatMessage;
}

// Represents a paginated collection of conversational chat session records.
// Combines an array of session overviews with standard page and limit metadata.
// Supports infinite scroll and lazy loading across user chat history panels.
export interface IPaginatedSessions {
  sessions: IChatSession[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Structures paginated retrieval envelopes containing historical chat message items.
// Returns chronologically ordered message lists alongside paging counter metadata.
// Powers message history windowing and backward scroll pagination in chat streams.
export interface IPaginatedMessages {
  messages: IChatMessage[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
