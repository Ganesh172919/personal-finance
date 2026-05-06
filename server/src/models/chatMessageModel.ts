/**
 * @fileoverview ChatMessage Model
 *
 * This module defines the ChatMessage schema and model for the Personal Finance application.
 * Each ChatMessage represents a single turn in a conversation between a user and the AI
 * assistant. Messages are grouped into ChatSession documents and carry rich metadata
 * about the AI's processing, tool usage, workflow traces, and file attachments.
 *
 * KEY FEATURES:
 * - Two message roles: "user" (human input) and "assistant" (AI response)
 * - Organization-scoped via orgId (multi-tenancy)
 * - Linked to a parent ChatSession via sessionId
 * - Rich metadata envelope for AI processing details:
 *   - File attachments with workspace file tracking
 *   - Sub-agent coordination (agentsInvolved, workflowTrace)
 *   - Tool call logging (toolCalls)
 *   - Execution plans and detailed analysis results
 *   - Performance metrics (aiCoreDurationMs, llmCallCount, cacheHit)
 *   - Autopilot run tracking for automated workflows
 *   - Task and action linking for follow-up operations
 *
 * HOW IT FITS INTO THE SYSTEM:
 * - Belongs to a ChatSession (sessionId) which groups messages into conversations
 * - The AI controller creates assistant messages after processing user input
 * - Metadata fields enable the UI to render rich responses (tool call visualizations,
 *   workflow traces, file attachments, action buttons)
 * - Performance metrics (duration, LLM call count, cache hits) support observability
 *
 * @module models/chatMessageModel
 */

import { Schema, model, Document, Types } from "mongoose"; // MongoDB ODM

/**
 * ChatMessage Metadata Interface
 *
 * A flexible envelope that captures context about how the AI processed a message.
 * This metadata is optional and primarily populated for assistant messages.
 * User messages typically have minimal or no metadata.
 */
export interface IChatMessageMetadata {
  // ---------------------------------------------------------------
  // File attachments
  // ---------------------------------------------------------------

  /**
   * Files attached to this message (e.g., CSV uploads, receipts).
   * Each attachment links to a workspace file and includes original filename,
   * MIME type, and size for display and download purposes.
   */
  attachments?: Array<{
    workspaceFileId: string; // ID in the workspace file storage system
    fileId: string; // Unique file identifier
    originalName: string; // Original filename as uploaded by the user
    mimeType: string; // MIME type (e.g., "text/csv", "image/png")
    sizeBytes: number; // File size in bytes
  }>;

  // ---------------------------------------------------------------
  // Analysis and agent coordination
  // ---------------------------------------------------------------

  /** The type of analysis performed (e.g., "spending_breakdown", "budget_forecast") */
  analysisType?: string;

  /** List of AI sub-agents that contributed to generating this response */
  agentsInvolved?: string[];

  /** Priority level assigned to this message for processing or display */
  priority?: 'low' | 'medium' | 'high';

  /** Whether the AI response contains actionable items the user can act on */
  actionable?: boolean;

  // ---------------------------------------------------------------
  // Execution details
  // ---------------------------------------------------------------

  /**
   * The AI's execution plan for multi-step operations.
   * Stored as a flexible object since plan structures vary by task type.
   */
  plan?: Record<string, unknown>;

  /**
   * Log of tool/API calls made by the AI during response generation.
   * Each entry captures what tool was called, with what inputs, and what was returned.
   * Used for rendering tool call visualizations in the UI and for debugging.
   */
  toolCalls?: Array<Record<string, unknown>>;

  /** Reference to the AI agent output record for detailed post-hoc inspection */
  agentOutputId?: string;

  // ---------------------------------------------------------------
  // Autopilot (automated workflow) tracking
  // ---------------------------------------------------------------

  /** ID of the autopilot run if this message was generated as part of an automated workflow */
  autopilotRunId?: string;

  /** Current status of the associated autopilot run (e.g., "running", "completed", "failed") */
  autopilotRunStatus?: string;

  // ---------------------------------------------------------------
  // Detailed results
  // ---------------------------------------------------------------

  /** Full analysis results stored as a flexible object for complex data structures */
  detailedAnalysis?: Record<string, unknown>;

  /**
   * Trace of the multi-agent workflow showing each agent's execution timeline.
   * Enables the UI to render a visual timeline of how the AI composed its response
   * across multiple specialist agents.
   */
  workflowTrace?: Array<{
    agent: string; // Agent identifier (e.g., "budget_analyst", "transaction_search")
    startedAt: string; // ISO 8601 timestamp when this agent started processing
    endedAt: string; // ISO 8601 timestamp when this agent finished
    status: string; // Execution status (e.g., "completed", "failed", "skipped")
    error?: string; // Error message if the agent failed
  }>;

  // ---------------------------------------------------------------
  // Performance and reliability metrics
  // ---------------------------------------------------------------

  /** Whether a fallback model or strategy was used (e.g., primary model was unavailable) */
  fallbackUsed?: boolean;

  /** Number of LLM API calls made to generate this response (higher for complex multi-step tasks) */
  llmCallCount?: number;

  /** Total time in milliseconds the AI core service spent processing this message */
  aiCoreDurationMs?: number;

  /** Whether the response was served from cache (true) or generated fresh (false/undefined) */
  cacheHit?: boolean;

  // ---------------------------------------------------------------
  // Tracing and linking
  // ---------------------------------------------------------------

  /** Unique request ID for distributed tracing across services */
  requestId?: string;

  /** Link to an action the user can take from this message (e.g., "review flagged transaction") */
  actionLinkId?: string;

  /** IDs of tasks spawned from this message that the user can track */
  linkedTaskIds?: string[];
}

/**
 * ChatMessage Interface
 *
 * Defines the structure of a chat message document in MongoDB.
 */
export interface IChatMessage {
  orgId: Types.ObjectId; // Organization that owns this message (multi-tenancy)
  sessionId: Types.ObjectId; // Parent ChatSession this message belongs to
  userId: Types.ObjectId; // User who sent or triggered this message
  role: 'user' | 'assistant'; // Message sender: human user or AI assistant
  content: string; // The message text (user input or AI response)
  metadata?: IChatMessageMetadata; // Optional rich metadata about AI processing
  createdAt: Date; // When the message was created (auto-managed by Mongoose timestamps)
}

/**
 * ChatMessage Document Interface
 *
 * Extends IChatMessage with Mongoose Document methods and _id field.
 * This is the actual document type returned from MongoDB queries.
 */
export interface IChatMessageDocument extends IChatMessage, Document {
  _id: Types.ObjectId; // MongoDB ObjectId primary key
}

/**
 * ChatMessage Schema Definition
 *
 * Defines the structure, validation rules, and defaults for chat message documents.
 * The metadata sub-document uses a flexible schema (Schema.Types.Mixed) for several
 * fields to accommodate varying AI response structures without schema migrations.
 */
const chatMessageSchema = new Schema<IChatMessageDocument>(
  {
    // ---------------------------------------------------------------
    // Multi-tenancy and ownership
    // ---------------------------------------------------------------

    // Organization that owns this message. Ensures data isolation between tenants.
    // Indexed for queries that filter messages by organization.
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    // Parent chat session. Groups messages into a conversation thread.
    // Indexed because the most common query pattern is "get all messages in a session."
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'ChatSession',
      required: true,
      index: true
    },

    // User who sent or triggered this message. For "user" role messages this is the
    // human sender; for "assistant" role messages this is the user whose input triggered
    // the AI response (preserved for audit and personalization purposes).
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // ---------------------------------------------------------------
    // Message content
    // ---------------------------------------------------------------

    // The sender role. "user" = human input, "assistant" = AI-generated response.
    // No "system" role here; system prompts are handled separately in the AI layer.
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true
    },

    // The message body. For user messages this is the raw input text.
    // For assistant messages this is the AI's rendered response (may include markdown).
    content: {
      type: String,
      required: true
    },

    // ---------------------------------------------------------------
    // Rich metadata (primarily for assistant messages)
    // ---------------------------------------------------------------

    metadata: {
      // File attachments linked to this message (CSV uploads, receipts, etc.)
      attachments: {
        type: [Schema.Types.Mixed], // Mixed type to allow flexible attachment structures
        default: [],
      },

      // The category of analysis the AI performed
      analysisType: String,

      // List of sub-agents that collaborated on this response
      agentsInvolved: [String],

      // Processing/display priority
      priority: {
        type: String,
        enum: ['low', 'medium', 'high']
      },

      // Whether the response contains actionable items
      actionable: Boolean,

      // The AI's execution plan for multi-step operations
      plan: {
        type: Schema.Types.Mixed,
        default: undefined
      },

      // Log of tool/API calls made during response generation
      toolCalls: {
        type: [Schema.Types.Mixed],
        default: []
      },

      // Reference to the AI agent output record for post-hoc inspection
      agentOutputId: String,

      // Autopilot run identifiers for automated workflows
      autopilotRunId: String,
      autopilotRunStatus: String,

      // Full analysis results (flexible structure for varying analysis types)
      detailedAnalysis: {
        type: Schema.Types.Mixed,
        default: {}
      },

      // Multi-agent workflow trace showing execution timeline per agent
      workflowTrace: {
        type: [Schema.Types.Mixed],
        default: []
      },

      // Performance and reliability metrics
      fallbackUsed: Boolean, // Whether a fallback model was used
      llmCallCount: Number,  // Number of LLM API calls made
      aiCoreDurationMs: Number, // Total AI processing time in ms
      cacheHit: Boolean,     // Whether response was served from cache

      // Tracing and linking
      requestId: String,     // Distributed tracing request ID
      actionLinkId: String,  // Link to an actionable item in the UI
      linkedTaskIds: [String], // IDs of tasks spawned from this message
    }
  },
  {
    timestamps: true // Automatically adds createdAt and updatedAt Date fields
  }
);

/**
 * Compound Index: orgId + sessionId + createdAt (ascending)
 *
 * The primary query pattern for loading messages within a conversation.
 * Scopes to the organization (multi-tenancy), filters by session, and sorts
 * chronologically so messages render in order. This index covers the
 * "load conversation history" use case efficiently.
 */
chatMessageSchema.index({ orgId: 1, sessionId: 1, createdAt: 1 });

/**
 * ChatMessage Model
 *
 * Mongoose model for chat message documents.
 * Used for CRUD operations on chat message data within the AI conversation system.
 */
const ChatMessageModel = model<IChatMessageDocument>("ChatMessage", chatMessageSchema);
export default ChatMessageModel;

/**
 * =============================================================================
 * END-OF-FILE SUMMARY
 * =============================================================================
 *
 * KEY TAKEAWAYS:
 *
 * 1. Conversation Turn Record
 *    Each document represents a single turn in a user-AI conversation: either
 *    a user's input ("user" role) or the AI's response ("assistant" role).
 *    Messages are ordered by createdAt within their parent ChatSession.
 *
 * 2. Rich Metadata Envelope
 *    The `metadata` sub-document is the most complex part of this model. It
 *    captures everything about how the AI processed a request: which sub-agents
 *    were involved, what tools were called, how long it took, whether a cache
 *    was used, and what files were attached. This enables rich UI rendering
 *    and full observability into AI behavior.
 *
 * 3. Multi-Agent Workflow Tracing
 *    The `workflowTrace` array records the execution timeline of each sub-agent
 *    that contributed to a response. This allows the UI to show users a visual
 *    breakdown of how the AI composed its answer across specialist agents.
 *
 * 4. Performance Observability
 *    Fields like `aiCoreDurationMs`, `llmCallCount`, and `cacheHit` provide
 *    built-in performance metrics. These can be aggregated to monitor AI
 *    service health, optimize caching strategies, and identify slow queries.
 *
 * 5. Flexible Schema for AI Evolution
 *    Several metadata fields use Schema.Types.Mixed to accommodate varying
 *    response structures without requiring schema migrations as the AI
 *    capabilities evolve. This is a deliberate trade-off: flexibility over
 *    strict typing at the database level (TypeScript interfaces still enforce
 *    types at the application level).
 *
 * 6. Relationships
 *    - orgId -> Organization (multi-tenancy)
 *    - sessionId -> ChatSession (many messages belong to one session)
 *    - userId -> User (the human who sent or triggered the message)
 *
 * 7. Query Pattern
 *    The compound index (orgId + sessionId + createdAt) is optimized for the
 *    most common operation: loading all messages in a conversation in
 *    chronological order.
 *
 * =============================================================================
 */
