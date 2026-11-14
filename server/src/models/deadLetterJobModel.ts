/**
 * @fileoverview Persistent dead-letter collection for background jobs that exhausted their retries.
 * Rows survive restarts and can be replayed by an admin (POST /api/v1/admin/dead-letter-jobs/:id/replay).
 */
import { Schema, model, Document, Types } from "mongoose";

// Enumerates supported task worker categories routed to dead-letter storage.
// Encompasses failed workflows, sync jobs, data exports, and AI optimization tasks.
// Used for validation and filtering within administrative triage consoles.
export const DEAD_LETTER_JOB_KINDS = ["workflow_run", "integration_sync_run", "export_job", "scheduled_export", "ai_optimize"] as const;
// Type union representing recognized background job categories in dead-letter queue.
// Inferred directly from the DEAD_LETTER_JOB_KINDS immutable constant array.
// Enforces strict typing for failed job payloads and administrative retry routes.
export type DeadLetterJobKind = (typeof DEAD_LETTER_JOB_KINDS)[number];

// Defines TypeScript contract representing an exhausted background job record.
// Stores retry failure counts, error stack traces, job payload, and replay state.
// Persists terminal job failures across server restarts for manual intervention.
export interface IDeadLetterJob {
  kind: DeadLetterJobKind;
  jobId: Types.ObjectId;
  orgId?: Types.ObjectId;
  attempts: number;
  error: string;
  payload?: Record<string, unknown>;
  failedAt: Date;
  replayedAt?: Date;
  replayedBy?: Types.ObjectId;
}

// Extends IDeadLetterJob with Mongoose Document properties and ObjectId primary key.
// Enables runtime database querying, persistence methods, and schema validation.
// Represents individual dead-letter job documents inside MongoDB storage layer.
export interface IDeadLetterJobDocument extends IDeadLetterJob, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Mongoose schema definition governing persistent dead-letter job records.
// Enforces kind enumerations, foreign key linkages, and error message limits.
// Automatically tracks createdAt and updatedAt timestamps for forensic auditing.
const deadLetterJobSchema = new Schema<IDeadLetterJobDocument>(
  {
    kind: { type: String, enum: DEAD_LETTER_JOB_KINDS, required: true },
    jobId: { type: Schema.Types.ObjectId, required: true },
    orgId: { type: Schema.Types.ObjectId, ref: "Organization" },
    attempts: { type: Number, required: true, min: 0, default: 0 },
    error: { type: String, trim: true, maxlength: 2000, default: "" },
    payload: { type: Schema.Types.Mixed, default: {} },
    failedAt: { type: Date, required: true, default: Date.now },
    replayedAt: { type: Date },
    replayedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, collection: "dead_letter_jobs" }
);

// Compound indexes optimizing job replay deduplication and administrative triage.
// Enforces unique constraint preventing duplicate dead-letter records per job ID.
// Accelerates queries filtering unreplayed failures by organization and timestamp.
deadLetterJobSchema.index({ kind: 1, jobId: 1 }, { unique: true });
deadLetterJobSchema.index({ replayedAt: 1, failedAt: -1 });
deadLetterJobSchema.index({ orgId: 1, failedAt: -1 });

// Instantiates Mongoose model bound to MongoDB "dead_letter_jobs" collection.
// Provides strongly typed querying, job capture, and replay tracking capabilities.
// Consumed by job retry services, dead-letter controllers, and queue processors.
const DeadLetterJobModel = model<IDeadLetterJobDocument>("DeadLetterJob", deadLetterJobSchema);
// Exports compiled DeadLetterJobModel instance as default module export.
// Imported by background worker harnesses, dead letter routers, and admin APIs.
// Serves as central database access gateway for inspecting failed task executions.
export default DeadLetterJobModel;
