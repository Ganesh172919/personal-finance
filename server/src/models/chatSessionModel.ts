import { Schema, model, Document, Types } from "mongoose";

/**
 * ChatSession Model
 * Represents a conversation thread between a user and the AI
 */
export interface IChatSession {
  userId: Types.ObjectId;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
  messageCount: number;
  isArchived: boolean;
  summary?: string;
  summaryUpdatedAt?: Date;
}

export interface IChatSessionDocument extends IChatSession, Document {
  _id: Types.ObjectId;
}

const chatSessionSchema = new Schema<IChatSessionDocument>(
  {
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
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient querying of user's sessions sorted by recency
chatSessionSchema.index({ userId: 1, lastMessageAt: -1 });

const ChatSessionModel = model<IChatSessionDocument>("ChatSession", chatSessionSchema);
export default ChatSessionModel;
