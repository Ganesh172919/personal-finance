import { Schema, model, Document, Types } from "mongoose";

// Defines the execution status values for an integration data synchronization run.
// Distinguishes between queued execution, active sync, success completion, and failures.
// Controls scheduling workflows and automated retry claim logic for connectors.
export type IntegrationSyncRunStatus = "queued" | "running" | "succeeded" | "failed";

// Defines the attributes tracking an individual synchronization job execution.
// Records synced item counts, execution durations, retry attempts, and triggering actors.
// Preserves historical audit traces of connector sync activity for debugging and metrics.
export interface IIntegrationSyncRun {
  orgId: Types.ObjectId;
  connectorKey: string;
  status: IntegrationSyncRunStatus;
  recordsSynced: number;
  attempts?: number;
  nextAttemptAt?: Date;
  startedAt?: Date;
  finishedAt?: Date;
  error?: string;
  requestId?: string;
  triggeredByUserId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Combines sync run domain attributes with Mongoose Document properties.
// Exposes unique object identifier, document timestamps, and database operations.
// Represents the strongly-typed document returned by integration sync queries.
export interface IIntegrationSyncRunDocument extends IIntegrationSyncRun, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema for integration sync run history records.
// Validates status enums, tracks attempt counts, and stores error messages.
// Includes timestamps to measure end-to-end sync run performance.
const integrationSyncRunSchema = new Schema<IIntegrationSyncRunDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    connectorKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 120, index: true },
    status: { type: String, enum: ["queued", "running", "succeeded", "failed"], required: true, index: true },
    recordsSynced: { type: Number, required: true, min: 0, default: 0 },
    attempts: { type: Number, min: 0, default: 0 },
    nextAttemptAt: { type: Date },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    error: { type: String, trim: true, maxlength: 400 },
    requestId: { type: String, trim: true, maxlength: 120 },
    triggeredByUserId: { type: Schema.Types.ObjectId, ref: "User", required: false },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Configures performance indexes for historical queries and worker task polling.
// Provides efficient lookup paths for tenant connector runs and status filtering.
// Implements a partial filter index for claiming queued synchronization tasks.
integrationSyncRunSchema.index({ orgId: 1, connectorKey: 1, createdAt: -1 });
integrationSyncRunSchema.index({ orgId: 1, status: 1, createdAt: -1 });
integrationSyncRunSchema.index({ status: 1, nextAttemptAt: 1 }, { partialFilterExpression: { status: "queued" }, name: "queued_claim" });

// Compiles and exports the Mongoose model for integration sync run execution records.
// Provides data access methods to queue jobs, track progress, and record completion stats.
// Used by background sync processors and administrative status dashboards.
const IntegrationSyncRunModel = model<IIntegrationSyncRunDocument>("IntegrationSyncRun", integrationSyncRunSchema);
export default IntegrationSyncRunModel;
