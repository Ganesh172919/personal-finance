import { Schema, model, Document, Types } from "mongoose";

export type IntegrationSyncRunStatus = "queued" | "running" | "succeeded" | "failed";

export interface IIntegrationSyncRun {
  orgId: Types.ObjectId;
  connectorKey: string;
  status: IntegrationSyncRunStatus;
  recordsSynced: number;
  startedAt?: Date;
  finishedAt?: Date;
  error?: string;
  requestId?: string;
  triggeredByUserId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IIntegrationSyncRunDocument extends IIntegrationSyncRun, Document {
  _id: Types.ObjectId;
}

const integrationSyncRunSchema = new Schema<IIntegrationSyncRunDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    connectorKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 120, index: true },
    status: { type: String, enum: ["queued", "running", "succeeded", "failed"], required: true, index: true },
    recordsSynced: { type: Number, required: true, min: 0, default: 0 },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    error: { type: String, trim: true, maxlength: 400 },
    requestId: { type: String, trim: true, maxlength: 120 },
    triggeredByUserId: { type: Schema.Types.ObjectId, ref: "User", required: false },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

integrationSyncRunSchema.index({ orgId: 1, connectorKey: 1, createdAt: -1 });
integrationSyncRunSchema.index({ orgId: 1, status: 1, createdAt: -1 });

const IntegrationSyncRunModel = model<IIntegrationSyncRunDocument>("IntegrationSyncRun", integrationSyncRunSchema);
export default IntegrationSyncRunModel;
