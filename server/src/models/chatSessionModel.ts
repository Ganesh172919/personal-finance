import { Schema, model, Document, Types } from "mongoose";

/**
 * ChatSession Model
 * Represents a conversation thread between a user and the AI
 */
export interface IChatSession {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
  messageCount: number;
  isArchived: boolean;
  summary?: string;
  summaryUpdatedAt?: Date;
  aiSessionId?: string;
  aiSessionStatus?: string;
  aiSessionPhase?: string;
  aiSessionUpdatedAt?: Date;
  aiRequestId?: string;
}

export interface IChatSessionDocument extends IChatSession, Document {
  _id: Types.ObjectId;
}

const chatSessionSchema = new Schema<IChatSessionDocument>(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    userId: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true,
      index: true 
    },
    title: { 
      type: String, 
      required: true,
      default: 'New Chat',
      maxlength: 200
    },
    lastMessageAt: { 
      type: Date, 
      default: Date.now 
    },
    messageCount: { 
      type: Number, 
      default: 0 
    },
    isArchived: {
      type: Boolean,
      default: false
    },
    summary: {
      type: String,
      default: ""
    },
    summaryUpdatedAt: {
      type: Date
    },
    aiSessionId: {
      type: String,
      index: true
    },
    aiSessionStatus: {
      type: String
    },
    aiSessionPhase: {
      type: String
    },
    aiSessionUpdatedAt: {
      type: Date
    },
    aiRequestId: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient querying of user's sessions sorted by recency
chatSessionSchema.index({ orgId: 1, userId: 1, lastMessageAt: -1 });

const ChatSessionModel = model<IChatSessionDocument>("ChatSession", chatSessionSchema);
export default ChatSessionModel;
