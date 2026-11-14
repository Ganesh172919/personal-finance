import { Schema, model, Document, Types } from "mongoose";

// Defines lifecycle status values for an automation workflow execution run.
// Distinguishes between queued execution, active runner processing, completion, and failures.
// Governs asynchronous job claiming, exponential backoff retries, and runner scheduling.
export type WorkflowRunStatus = "queued" | "running" | "succeeded" | "failed";

// Defines audit details for workflow actions skipped due to unmet preconditions.
// Captures the step index, action type name, and the specific conditional evaluation reason.
// Provides transparent execution diagnostics for troubleshooting conditional logic.
export interface IWorkflowRunSkippedAction {
  index: number;
  action_type: string;
  reason: string;
}

// Defines execution telemetry for duration delays applied during a workflow run.
// Captures action step index, scheduled delay seconds, and optional label descriptions.
// Preserves pause metrics for time-sensitive workflow sequences and drip cadences.
export interface IWorkflowRunExecutedDelay {
  index: number;
  duration_seconds: number;
  description?: string;
}

// Defines the aggregate outcome payload recorded upon workflow run completion.
// Tracks created task IDs, exported report references, and dispatched notification logs.
// Summarizes the total cumulative side effects produced across all workflow actions.
export interface IWorkflowRunResult {
  tasks_created: string[];
  exports_created?: string[];
  notifications_sent?: Array<{ channel: string; to: string; mode: string }>;
  actions_skipped?: IWorkflowRunSkippedAction[];
  delays_executed?: IWorkflowRunExecutedDelay[];
}

// Defines the domain attributes for an individual workflow execution run instance.
// Stores triggering user context, idempotency keys, execution attempts, and error traces.
// Serves as the immutable execution audit log for workflow automation activity.
export interface IWorkflowRun {
  orgId: Types.ObjectId;
  workflowId: Types.ObjectId;
  triggeredByUserId: Types.ObjectId;
  status: WorkflowRunStatus;
  idempotencyKey?: string;
  requestId?: string;
  triggerContext?: Record<string, unknown>;
  attempts?: number;
  nextAttemptAt?: Date;
  startedAt?: Date;
  finishedAt?: Date;
  result?: IWorkflowRunResult;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Merges workflow run domain attributes with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent workflow run document returned by execution audit queries.
export interface IWorkflowRunDocument extends IWorkflowRun, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema mapping for the workflow execution run collection.
// Enforces validation rules on status enums, execution attempts, and payload structures.
// Automatically manages creation and modification timestamps across run lifecycle transitions.
const workflowRunSchema = new Schema<IWorkflowRunDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    workflowId: { type: Schema.Types.ObjectId, ref: "Workflow", required: true, index: true },
    triggeredByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["queued", "running", "succeeded", "failed"], default: "queued", index: true },
    idempotencyKey: { type: String, trim: true, maxlength: 128 },
    requestId: { type: String, trim: true, maxlength: 128 },
    triggerContext: { type: Schema.Types.Mixed, default: {} },
    attempts: { type: Number, min: 0, default: 0 },
    nextAttemptAt: { type: Date },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    result: { type: Schema.Types.Mixed, default: {} },
    error: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

// Configures compound database indexes for workflow worker task polling and deduplication.
// Implements a partial filter index on queued status to accelerate worker job claims.
// Establishes a unique index on idempotency keys per workflow to prevent duplicate executions.
workflowRunSchema.index({ orgId: 1, createdAt: -1 });
workflowRunSchema.index({ workflowId: 1, createdAt: -1 });
workflowRunSchema.index({ status: 1, nextAttemptAt: 1 }, { partialFilterExpression: { status: "queued" }, name: "queued_claim" });
workflowRunSchema.index(
  { workflowId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string" },
    },
  }
);

// Compiles and exports the Mongoose model for automation workflow execution runs.
// Exposes data access methods to queue, claim, execute, and inspect workflow runs.
// Acts as the runtime persistence log for automated background job execution.
const WorkflowRunModel = model<IWorkflowRunDocument>("WorkflowRun", workflowRunSchema);
export default WorkflowRunModel;
