import { Schema, model, Document, Types } from "mongoose";

export type ExportJobType = "transactions_csv" | "monthly_summary_pdf";
export type ExportJobStatus = "queued" | "running" | "succeeded" | "failed";

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
  startedAt?: Date;
  finishedAt?: Date;
  error?: string;
  requestId?: string;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IExportJobDocument extends Omit<IExportJob, "createdAt" | "updatedAt">, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

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
    startedAt: { type: Date },
    finishedAt: { type: Date },
    error: { type: String, trim: true, maxlength: 2000 },
    requestId: { type: String, trim: true, maxlength: 120 },
    idempotencyKey: { type: String, trim: true, maxlength: 128 },
  },
  { timestamps: true }
);

exportJobSchema.index({ orgId: 1, createdByUserId: 1, createdAt: -1 });
exportJobSchema.index({ orgId: 1, status: 1, createdAt: -1 });
exportJobSchema.index(
  { orgId: 1, createdByUserId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string" },
    },
  }
);

const ExportJobModel = model<IExportJobDocument>("ExportJob", exportJobSchema);
export default ExportJobModel;
