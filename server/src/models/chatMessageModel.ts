import { Schema, model, Document, Types } from "mongoose";

/**
 * ChatMessage Model
 * Represents individual messages within a chat session
 */
export interface IChatMessageMetadata {
  attachments?: Array<{
    workspaceFileId: string;
    fileId: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  analysisType?: string;
  agentsInvolved?: string[];
  priority?: 'low' | 'medium' | 'high';
  actionable?: boolean;
  plan?: Record<string, unknown>;
  toolCalls?: Array<Record<string, unknown>>;
  agentOutputId?: string;
  autopilotRunId?: string;
  autopilotRunStatus?: string;
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
  aiCoreDurationMs?: number;
  cacheHit?: boolean;
}

export interface IChatMessage {
  orgId: Types.ObjectId;
  sessionId: Types.ObjectId;
  userId: Types.ObjectId;
  role: 'user' | 'assistant';
  content: string;
  metadata?: IChatMessageMetadata;
  createdAt: Date;
}

export interface IChatMessageDocument extends IChatMessage, Document {
  _id: Types.ObjectId;
}

const chatMessageSchema = new Schema<IChatMessageDocument>(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    sessionId: { 
      type: Schema.Types.ObjectId, 
      ref: 'ChatSession', 
      required: true,
      index: true
    },
    userId: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    role: { 
      type: String, 
      enum: ['user', 'assistant'],
      required: true 
    },
    content: { 
      type: String, 
      required: true 
    },
    metadata: {
      attachments: {
        type: [Schema.Types.Mixed],
        default: [],
      },
      analysisType: String,
      agentsInvolved: [String],
      priority: { 
        type: String, 
        enum: ['low', 'medium', 'high'] 
      },
      actionable: Boolean,
      plan: {
        type: Schema.Types.Mixed,
        default: undefined
      },
      toolCalls: {
        type: [Schema.Types.Mixed],
        default: []
      },
      agentOutputId: String,
      autopilotRunId: String,
      autopilotRunStatus: String,
      detailedAnalysis: {
        type: Schema.Types.Mixed,
        default: {}
      },
      workflowTrace: {
        type: [Schema.Types.Mixed],
        default: []
      },
      fallbackUsed: Boolean,
      llmCallCount: Number,
      requestId: String,
      actionLinkId: String,
      linkedTaskIds: [String],
      aiCoreDurationMs: Number,
      cacheHit: Boolean
    }
  },
  {
    timestamps: true
  }
);

// Compound index for efficient message retrieval within a session
chatMessageSchema.index({ orgId: 1, sessionId: 1, createdAt: 1 });

const ChatMessageModel = model<IChatMessageDocument>("ChatMessage", chatMessageSchema);
export default ChatMessageModel;
