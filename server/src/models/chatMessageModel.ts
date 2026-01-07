import { Schema, model, Document, Types } from "mongoose";

/**
 * ChatMessage Model
 * Represents individual messages within a chat session
 */
export interface IChatMessageMetadata {
  analysisType?: string;
  agentsInvolved?: string[];
  priority?: 'low' | 'medium' | 'high';
  actionable?: boolean;
}

export interface IChatMessage {
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
      analysisType: String,
      agentsInvolved: [String],
      priority: { 
        type: String, 
        enum: ['low', 'medium', 'high'] 
      },
      actionable: Boolean
    }
  },
  {
    timestamps: true
  }
);

// Compound index for efficient message retrieval within a session
chatMessageSchema.index({ sessionId: 1, createdAt: 1 });

const ChatMessageModel = model<IChatMessageDocument>("ChatMessage", chatMessageSchema);
export default ChatMessageModel;
