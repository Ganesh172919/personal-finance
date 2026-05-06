/**
 * @fileoverview ChatSession Model
 *
 * This module defines the ChatSession schema and model for the Personal Finance application.
 * A ChatSession represents a single conversation thread between a user and the AI assistant.
 * Each session groups a sequence of ChatMessage documents and tracks metadata about the
 * conversation's lifecycle, including its AI backend session state.
 *
 * KEY FEATURES:
 * - Conversation threading: Each session is a self-contained conversation
 * - Organization and user scoping (multi-tenancy via orgId)
 * - Session lifecycle tracking: title, message count, last activity, archival
 * - Auto-generated conversation summaries for quick context loading
 * - AI backend session mapping: links to the AI service's internal session tracking
 * - Soft archival: sessions can be archived without deletion
 *
 * HOW IT FITS INTO THE SYSTEM:
 * - ChatMessage documents reference a ChatSession via sessionId
 * - The AI controller creates/updates sessions when users interact with the assistant
 * - Session summaries are generated to provide context without loading full message history
 * - The AI session fields (aiSessionId, aiSessionStatus, etc.) track the state of the
 *   backend AI service's session, enabling multi-turn conversations and resumable workflows
 *
 * @module models/chatSessionModel
 */

import { Schema, model, Document, Types } from "mongoose"; // MongoDB ODM

/**
 * ChatSession Interface
 *
 * Defines the structure of a chat session document in MongoDB.
 */
export interface IChatSession {
  orgId: Types.ObjectId; // Organization that owns this chat session (multi-tenancy)
  userId: Types.ObjectId; // User who owns this conversation thread
  title: string; // Display title for the session (auto-generated or user-set)
  createdAt: Date; // When the session was created (auto-managed by Mongoose timestamps)
  updatedAt: Date; // When the session was last modified (auto-managed by Mongoose timestamps)
  lastMessageAt: Date; // Timestamp of the most recent message; used for sorting sessions by recency
  messageCount: number; // Running count of messages in this session; avoids expensive count queries
  isArchived: boolean; // Soft-delete flag; archived sessions are hidden from the default session list
  summary?: string; // AI-generated summary of the conversation for quick context loading
  summaryUpdatedAt?: Date; // When the summary was last regenerated
  aiSessionId?: string; // Identifier for the corresponding session in the AI backend service
  aiSessionStatus?: string; // Current status of the AI backend session (e.g., "active", "expired")
  aiSessionPhase?: string; // Current phase of the AI session (e.g., "planning", "executing", "idle")
  aiSessionUpdatedAt?: Date; // When the AI backend session state was last synced
  aiRequestId?: string; // ID of the most recent AI request; useful for debugging and tracing
}

/**
 * ChatSession Document Interface
 *
 * Extends IChatSession with Mongoose Document methods and _id field.
 * This is the actual document type returned from MongoDB queries.
 */
export interface IChatSessionDocument extends IChatSession, Document {
  _id: Types.ObjectId; // MongoDB ObjectId primary key
}

/**
 * ChatSession Schema Definition
 *
 * Defines the structure, validation rules, and defaults for chat session documents.
 */
const chatSessionSchema = new Schema<IChatSessionDocument>(
  {
    // ---------------------------------------------------------------
    // Multi-tenancy and ownership
    // ---------------------------------------------------------------

    // Organization that owns this session. Ensures data isolation between tenants.
    // Indexed to speed up queries filtered by organization.
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    // The user who owns this conversation. A user may have many sessions within an org.
    // Indexed for fast lookup of a user's session list.
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // ---------------------------------------------------------------
    // Session metadata
    // ---------------------------------------------------------------

    // Display title for the conversation. Defaults to "New Chat" and may be
    // auto-updated based on the first user message or manually renamed.
    title: {
      type: String,
      required: true,
      default: 'New Chat',
      maxlength: 200
    },

    // Timestamp of the last message in this session. Updated each time a new
    // message is appended. Used to sort the session list by recency.
    lastMessageAt: {
      type: Date,
      default: Date.now
    },

    // Denormalized message count. Incremented/decremented when messages are
    // added or removed, avoiding the need for a separate countDocuments() call.
    messageCount: {
      type: Number,
      default: 0
    },

    // Soft-delete flag. When true, the session is hidden from the default list
    // but preserved in the database for potential recovery or audit purposes.
    isArchived: {
      type: Boolean,
      default: false
    },

    // ---------------------------------------------------------------
    // Conversation summary (for context window management)
    // ---------------------------------------------------------------

    // AI-generated summary of the conversation so far. Used to provide context
    // to the AI without loading the full message history, which is critical
    // for long conversations that exceed the model's context window.
    summary: {
      type: String,
      default: ""
    },

    // Tracks when the summary was last regenerated so the system can decide
    // whether it needs to be refreshed before the next AI request.
    summaryUpdatedAt: {
      type: Date
    },

    // ---------------------------------------------------------------
    // AI backend session tracking
    // ---------------------------------------------------------------

    // Maps this chat session to the AI service's internal session identifier.
    // Enables the AI backend to maintain conversation state across requests.
    // Indexed for fast lookup when the AI service reports back with session events.
    aiSessionId: {
      type: String,
      index: true
    },

    // Current lifecycle status of the AI backend session (e.g., "active", "expired", "error").
    // Useful for detecting stale sessions that need to be re-initialized.
    aiSessionStatus: {
      type: String
    },

    // Current operational phase of the AI session (e.g., "planning", "executing", "idle").
    // Provides visibility into what the AI is doing during multi-step workflows.
    aiSessionPhase: {
      type: String
    },

    // Timestamp of the last update from the AI backend. Helps detect whether
    // the AI session state is stale and needs refreshing.
    aiSessionUpdatedAt: {
      type: Date
    },

    // ID of the most recent AI request. Enables tracing a specific AI response
    // back to the request that triggered it, useful for debugging and logging.
    aiRequestId: {
      type: String
    }
  },
  {
    timestamps: true // Automatically adds createdAt and updatedAt Date fields
  }
);

/**
 * Compound Index: orgId + userId + lastMessageAt (descending)
 *
 * The primary query pattern for listing a user's chat sessions.
 * Scopes to the organization (multi-tenancy), filters by user, and sorts
 * by the most recently active session first.
 */
chatSessionSchema.index({ orgId: 1, userId: 1, lastMessageAt: -1 });

/**
 * ChatSession Model
 *
 * Mongoose model for chat session documents.
 * Used for CRUD operations on chat session data and as the parent container
 * for ChatMessage documents in the AI conversation system.
 */
const ChatSessionModel = model<IChatSessionDocument>("ChatSession", chatSessionSchema);
export default ChatSessionModel;

/**
 * =============================================================================
 * END-OF-FILE SUMMARY
 * =============================================================================
 *
 * KEY TAKEAWAYS:
 *
 * 1. Conversation Container
 *    A ChatSession is the parent entity for a sequence of ChatMessage documents.
 *    It holds metadata (title, message count, last activity) that enables the UI
 *    to display a session list without loading individual messages.
 *
 * 2. Multi-Tenancy
 *    Every session is scoped to an organization (orgId) and a user (userId).
 *    This ensures conversations are isolated between tenants and between users
 *    within the same organization.
 *
 * 3. Summary for Context Management
 *    The `summary` field stores an AI-generated condensation of the conversation.
 *    This is critical for long-running conversations where the full message history
 *    would exceed the AI model's context window. The system can load just the
 *    summary plus recent messages to maintain coherent multi-turn dialogue.
 *
 * 4. AI Backend State Mirroring
 *    The `aiSession*` fields mirror the state of the AI service's internal session.
 *    This two-way mapping allows the frontend/backend to track what the AI is doing
 *    (planning, executing, idle) and detect stale or errored sessions that need
 *    re-initialization.
 *
 * 5. Soft Archival
 *    The `isArchived` flag provides a non-destructive way to hide old conversations.
 *    Archived sessions remain in the database for audit or recovery purposes.
 *
 * 6. Denormalized Counters
 *    `messageCount` and `lastMessageAt` are maintained in the session document
 *    to avoid expensive aggregation queries when listing sessions.
 *
 * 7. Relationships
 *    - orgId -> Organization (many sessions belong to one org)
 *    - userId -> User (many sessions belong to one user)
 *    - Referenced by: ChatMessage.sessionId (one session has many messages)
 *
 * =============================================================================
 */
