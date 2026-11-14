import { Schema, model, Document, Types } from "mongoose";
import { orgScopePlugin } from "../utils/orgScopePlugin";

// Canonical list of categorized reason codes for negative AI feedback.
// Captures specific failure modes such as inaccuracy, irrelevance, or verbosity.
// Used for schema validation and continuous prompt optimization clustering.
export const AGENT_FEEDBACK_REASON_CODES = [
  "wrong_number",
  "irrelevant",
  "too_long",
  "unsafe",
  "unclear",
  "other",
] as const;
// Type union representing valid negative feedback reason identifiers.
// Derived directly from the AGENT_FEEDBACK_REASON_CODES constant array.
// Ensures strict typing for user feedback payloads and database records.
export type AgentFeedbackReasonCode = (typeof AGENT_FEEDBACK_REASON_CODES)[number];

// Defines administrative review status values for AI feedback triage.
// Tracks progress of user-flagged outputs through the evaluation pipeline.
// Includes pending triage, accepted for retraining, and rejected statuses.
export const AGENT_OUTPUT_REVIEW_STATUSES = ["pending", "accepted", "rejected"] as const;
// Type union representing administrative feedback review states.
// Inferred from the AGENT_OUTPUT_REVIEW_STATUSES immutable constant array.
// Applied to document properties tracking human-in-the-loop audit cycles.
export type AgentOutputReviewStatus = (typeof AGENT_OUTPUT_REVIEW_STATUSES)[number];

// Defines the maximum character length permitted for user-supplied corrections.
// Prevents oversized text payloads from bloating feedback database records.
// Enforced during Zod payload validation and Mongoose schema compilation.
export const AGENT_FEEDBACK_CORRECTION_MAX = 500;

// This interface matches the frontend's IAgentOutput AND the new Python response
// Defines TypeScript contract representing an AI agent execution output artifact.
// Encapsulates structured responses, workflow execution traces, and user feedback.
// Maps shared data contract between frontend UI and Python AI Core backend.
export interface IAgentOutput {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  sessionId: string;
  userInput: string;
  agentType: string; // The agent that *ran* (e.g., master, budget_planner)
  outputData: {
    response?: string; // The main text response (for comprehensive plan)
    title?: string;
    description?: string;
    action?: string; // Fallback action
    actionType?: string; // Primary action type (e.g., "invest", "review_budget")
    agent?: string; // The agent *name* (e.g., "investment_advisor")
    insights?: Array<{
      agent: string;
      title: string;
      description: string;
      actionType: string;
    }>;
    [key: string]: any; // Allow other properties
  };
  analysis_type: string;
  agents_involved: string[];
  workflow_trace?: Array<{
    agent: string;
    startedAt: string;
    endedAt: string;
    status: string;
    error?: string;
  }>;
  detailed_analysis?: Record<string, unknown>;
  fallback_used?: boolean;
  llm_call_count?: number;
  request_id?: string;
  feedback?: {
    rating: "up" | "down";
    note?: string;
    reasonCode?: AgentFeedbackReasonCode;
    /** Optional user-supplied correction (capped at AGENT_FEEDBACK_CORRECTION_MAX chars). */
    correction?: string;
    createdAt?: Date;
  };
  // Self-improvement loop attribution: which artifacts/model produced this output.
  promptVersion?: string;
  routingVersion?: string;
  agentName?: string;
  modelName?: string;
  provider?: string;
  cacheHit?: boolean;
  /** Admin review state for negative feedback (set to "pending" on a thumbs-down). */
  reviewStatus?: AgentOutputReviewStatus;
  reviewedAt?: Date;
  reviewedBy?: Types.ObjectId;
  /** Set when this output was produced by the Regenerate action on an earlier output. */
  regenerateOf?: Types.ObjectId;
  timestamp: Date;
  priority?: 'low' | 'medium' | 'high';
  actionable?: boolean;
}

// Extends IAgentOutput interface with Mongoose Document methods and primary key.
// Enables document-level persistence methods and runtime schema validations.
// Provides strong typing across MongoDB queries targeting the AgentOutput table.
export interface IAgentOutputDocument extends IAgentOutput, Document {
  _id: Types.ObjectId;
}

// Mongoose schema configuration defining persistence rules for agent outputs.
// Stores serialized output payloads, workflow traces, and feedback metadata.
// Configured with timestamps and relaxed strictness for nested output schemas.
const agentOutputSchema = new Schema<IAgentOutputDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: { type: String, required: true },
    userInput: { type: String, required: true },
    agentType: { type: String, required: true },
    outputData: {
      type: Schema.Types.Mixed,
      required: true,
      default: {}
    },
    analysis_type: { type: String, required: true },
    agents_involved: [String],
    workflow_trace: {
      type: [Schema.Types.Mixed],
      default: []
    },
    detailed_analysis: {
      type: Schema.Types.Mixed,
      default: {}
    },
    fallback_used: { type: Boolean, default: false },
    llm_call_count: { type: Number, default: 0 },
    request_id: { type: String },
    feedback: {
      rating: { type: String, enum: ["up", "down"] },
      note: { type: String },
      reasonCode: { type: String, enum: AGENT_FEEDBACK_REASON_CODES },
      correction: { type: String, maxlength: AGENT_FEEDBACK_CORRECTION_MAX },
      createdAt: { type: Date, default: Date.now }
    },
    promptVersion: { type: String, maxlength: 80 },
    routingVersion: { type: String, maxlength: 80 },
    agentName: { type: String, maxlength: 120 },
    modelName: { type: String, maxlength: 160 },
    provider: { type: String, maxlength: 80 },
    cacheHit: { type: Boolean },
    reviewStatus: { type: String, enum: AGENT_OUTPUT_REVIEW_STATUSES },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    regenerateOf: { type: Schema.Types.ObjectId, ref: "AgentOutput" },
    timestamp: { type: Date, default: Date.now },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    actionable: { type: Boolean, default: false }
  },
  {
    timestamps: true,
    strict: false // Allow any fields inside outputData
  }
);

// Compound and sparse indexes optimizing agent output retrieval and audits.
// Accelerates user history timelines, feedback queues, and rating analytics.
// Ensures fast query response times across multi-tenant output collections.
agentOutputSchema.index({ orgId: 1, userId: 1, timestamp: -1 });
agentOutputSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
agentOutputSchema.index({ orgId: 1, userId: 1, request_id: 1, timestamp: -1 });
agentOutputSchema.index({ orgId: 1, userId: 1, actionable: 1, timestamp: -1 });
// Admin review queue: negative feedback awaiting review, newest first.
agentOutputSchema.index({ orgId: 1, reviewStatus: 1, "feedback.createdAt": -1 }, { sparse: true });
// Feedback analytics (rating breakdown over time).
agentOutputSchema.index({ orgId: 1, "feedback.rating": 1, createdAt: -1 }, { sparse: true });

// Tenant guard: unscoped reads/writes throw when ORG_SCOPE_ENFORCE / production (see utils/orgScopePlugin).
// Attaches organization scoping plugin enforcing multi-tenant write boundaries.
// Throws validation errors on unscoped database reads or writes in production.
// Guarantees strict organizational tenant isolation for AI output records.
agentOutputSchema.plugin(orgScopePlugin, { guardWrites: true });

// Instantiates Mongoose model bound to MongoDB "AgentOutput" collection.
// Provides strongly typed querying, creation, and updating operations.
// Central model for recording AI agent actions, recommendations, and traces.
const AgentOutputModel = model<IAgentOutputDocument>("AgentOutput", agentOutputSchema);
// Exports compiled AgentOutputModel as default module export.
// Imported by AI controllers, feedback handlers, and administrative review jobs.
// Serves as database access layer for all agent output artifact persistence.
export default AgentOutputModel;
