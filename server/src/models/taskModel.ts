import { Schema, model, Document, Types } from "mongoose";

// Defines status, priority, category kind, and recurrence cadences for action tasks.
// Categorizes tasks into functional financial domains such as budget, debt, and cashflow.
// Used by AI planner recommendations and task management dashboard workflows.
export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "open" | "completed" | "dismissed";
export type TaskKind = "cashflow" | "budget" | "debt" | "invest" | "goal" | "education" | "generic";
export type TaskRecurrenceCadence = "none" | "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

// Defines recurrence parameters for periodic financial action tasks.
// Tracks execution cadence, next due date projection, parent task IDs, and generation rank.
// Enables automated spawning of follow-up tasks upon cycle completion.
export interface ITaskRecurrence {
  cadence: TaskRecurrenceCadence;
  nextDueDate?: Date;
  parentTaskId?: string;
  generation?: number;
}

// Defines the provenance links attributing a task to its originating AI context.
// Captures generating agent output IDs, chat message references, and client request IDs.
// Provides traceability back to the conversational insight that produced the action item.
export interface ITaskSource {
  agentOutputId?: Types.ObjectId;
  chatMessageId?: Types.ObjectId;
  requestId?: string;
}

// Captures user-submitted evidence confirming task completion and execution notes.
// Stores completion timestamps, qualitative observations, and recorded mutation effects.
// Feeds user execution verification signals back to AI reinforcement learning loops.
export interface ITaskCompletionEvidence {
  note?: string;
  completedAt?: Date;
  effects?: Array<Record<string, unknown>>;
}

// Summarizes financial state changes applied directly as a consequence of task completion.
// Tracks modified transaction keys, updated savings goals, adjusted debt balances, and flags.
// Enables transactional rollback and provides transparency on task-induced profile mutations.
export interface ITaskAppliedSummary {
  transactions: string[];
  goals: string[];
  debts: string[];
  profileUpdated: boolean;
}

// Defines lifecycle states for automated execution of task-recommended financial actions.
// Distinguishes between pending execution, successful profile mutation, and failure codes.
// Guarantees reliable asynchronous execution with idempotency tracking.
export type TaskApplyStatus = "pending" | "succeeded" | "failed";

// Defines the complete domain interface for user financial action tasks.
// Encapsulates actionable steps, expected financial impact, recurrence rules, and audit links.
// Serves as the central entity for AI-recommended personal finance guidance.
export interface ITask {
  _id: string;
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  source?: ITaskSource;
  bucket: 7 | 30 | 365;
  title: string;
  why: string;
  steps: string[];
  priority: TaskPriority;
  expected_impact: string;
  kind: TaskKind;
  dueDate?: Date;
  status: TaskStatus;
  completedAt?: Date;
  completionEvidence?: ITaskCompletionEvidence;
  appliedAt?: Date;
  appliedSummary?: ITaskAppliedSummary;
  applyStatus?: TaskApplyStatus;
  applyErrorCode?: string;
  applyIdempotencyKey?: string;
  actionLinkId?: string;
  outcomeRefs?: string[];
  recurrence?: ITaskRecurrence;
}

// Combines task attributes with Mongoose Document methods using string primary keys.
// Exposes custom string IDs, document lifecycle hooks, and automated timestamps.
// Represents a persistent action task document returned by database queries.
export interface ITaskDocument extends Omit<ITask, "_id">, Document<string> {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
}

// Configures the Mongoose schema mapping for the financial action task collection.
// Enforces validation rules on bucket horizons, task priorities, kinds, and recurrence.
// Automatically manages creation and modification timestamps across task changes.
const taskSchema = new Schema<ITaskDocument>(
  {
    _id: { type: String, required: true },
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    source: {
      agentOutputId: { type: Schema.Types.ObjectId, ref: "AgentOutput" },
      chatMessageId: { type: Schema.Types.ObjectId, ref: "ChatMessage" },
      requestId: { type: String }
    },
    bucket: { type: Number, enum: [7, 30, 365], required: true },
    title: { type: String, required: true },
    why: { type: String, required: true },
    steps: { type: [String], default: [] },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    expected_impact: { type: String, required: true },
    kind: {
      type: String,
      enum: ["cashflow", "budget", "debt", "invest", "goal", "education", "generic"],
      default: "generic"
    },
    dueDate: { type: Date },
    status: { type: String, enum: ["open", "completed", "dismissed"], default: "open" },
    completedAt: { type: Date },
    completionEvidence: {
      note: { type: String, trim: true, maxlength: 1000 },
      completedAt: { type: Date },
      effects: { type: [Schema.Types.Mixed], default: [] }
    },
    appliedAt: { type: Date },
    appliedSummary: {
      transactions: { type: [String], default: [] },
      goals: { type: [String], default: [] },
      debts: { type: [String], default: [] },
      profileUpdated: { type: Boolean, default: false }
    },
    applyStatus: { type: String, enum: ["pending", "succeeded", "failed"] },
    applyErrorCode: { type: String, trim: true, maxlength: 80 },
    applyIdempotencyKey: { type: String, trim: true, maxlength: 128 },
    actionLinkId: { type: String, trim: true, maxlength: 128 },
    outcomeRefs: { type: [String], default: [] },
    recurrence: {
      cadence: {
        type: String,
        enum: ["none", "daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"],
        default: "none",
      },
      nextDueDate: { type: Date },
      parentTaskId: { type: String, trim: true },
      generation: { type: Number, default: 1 },
    },
  },
  { timestamps: true }
);

// Configures compound database indexes for task filtering, scheduling, and deduplication.
// Optimizes user agenda queries filtering by status and ordered by upcoming due dates.
// Establishes a sparse index on applyIdempotencyKey to prevent duplicate action runs.
taskSchema.index({ orgId: 1, userId: 1, status: 1, dueDate: 1 });
taskSchema.index({ orgId: 1, userId: 1, updatedAt: -1 });
taskSchema.index({ orgId: 1, userId: 1, "source.agentOutputId": 1, updatedAt: -1 });
taskSchema.index({ orgId: 1, userId: 1, applyIdempotencyKey: 1 }, { sparse: true });

// Compiles and exports the Mongoose model for financial action task items.
// Exposes data access methods to query, complete, dismiss, or schedule user tasks.
// Drives the core action-oriented financial improvement roadmap for users.
const TaskModel = model<ITaskDocument>("Task", taskSchema);
export default TaskModel;
