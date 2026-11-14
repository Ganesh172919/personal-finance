import { Schema, model, Document, Types } from "mongoose";

// Enumerates supported asynchronous data export generation formats.
// Includes raw transaction CSV datasets and formatted monthly summary PDFs.
// Governs worker pipeline selection and output file compilation routines.
export type ExportJobType = "transactions_csv" | "monthly_summary_pdf";
// Represents processing lifecycle states for background data export tasks.
// Tracks progression from initial queueing, active worker execution, to completion.
// Used by export polling endpoints and queue claim query filters.
export type ExportJobStatus = "queued" | "running" | "succeeded" | "failed";

// Defines TypeScript contract representing an asynchronous export task.
// Stores export format, status, generated file metadata, error logs, and retry state.
// Encapsulates parameters and worker telemetry across the export lifecycle.
export interface IExportJob {
  orgId: Types.ObjectId;
  createdByUserId: Types.ObjectId;
  type: ExportJobType;
  status: ExportJobStatus;
  params: Record<string, unknown>;
  fileId?: Types.ObjectId;
  filename?: string;
  contentType?: string;
  bytes?: number;
  attempts?: number;
  nextAttemptAt?: Date;
  startedAt?: Date;
  finishedAt?: Date;
  error?: string;
  requestId?: string;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Extends IExportJob with Mongoose Document methods and ObjectId primary key.
// Enables runtime database querying, persistence methods, and schema validation.
// Represents individual export job documents inside MongoDB database storage.
export interface IExportJobDocument extends Omit<IExportJob, "createdAt" | "updatedAt">, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Mongoose schema definition governing asynchronous export job persistence.
// Enforces type and status enumerations, file metadata constraints, and user keys.
// Automatically manages createdAt and updatedAt timestamps for job auditing.
const exportJobSchema = new Schema<IExportJobDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["transactions_csv", "monthly_summary_pdf"], required: true, index: true },
    status: { type: String, enum: ["queued", "running", "succeeded", "failed"], required: true, default: "queued", index: true },
    params: { type: Schema.Types.Mixed, default: {} },
    fileId: { type: Schema.Types.ObjectId },
    filename: { type: String, trim: true, maxlength: 200 },
    contentType: { type: String, trim: true, maxlength: 120 },
    bytes: { type: Number, min: 0 },
    attempts: { type: Number, min: 0, default: 0 },
    nextAttemptAt: { type: Date },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    error: { type: String, trim: true, maxlength: 2000 },
    requestId: { type: String, trim: true, maxlength: 120 },
    idempotencyKey: { type: String, trim: true, maxlength: 128 },
  },
  { timestamps: true }
);

// Compound, partial, and unique indexes optimizing export worker task claiming.
// Accelerates queue polling for ready jobs using the specialized queued_claim index.
// Prevents duplicate export generation via unique idempotencyKey partial filtering.
exportJobSchema.index({ orgId: 1, createdByUserId: 1, createdAt: -1 });
exportJobSchema.index({ orgId: 1, status: 1, createdAt: -1 });
exportJobSchema.index({ status: 1, nextAttemptAt: 1 }, { partialFilterExpression: { status: "queued" }, name: "queued_claim" });
exportJobSchema.index(
  { orgId: 1, createdByUserId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string" },
    },
  }
);

// Instantiates Mongoose model bound to MongoDB "ExportJob" collection.
// Provides strongly typed querying, job claiming, and status update operations.
// Consumed by export controllers, background worker daemons, and download endpoints.
const ExportJobModel = model<IExportJobDocument>("ExportJob", exportJobSchema);
// Exports compiled ExportJobModel instance as default module export.
// Imported by export routers, background job runners, and scheduled export tasks.
// Serves as central database access gateway for managing export tasks.
export default ExportJobModel;
