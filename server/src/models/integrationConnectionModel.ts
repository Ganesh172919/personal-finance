import { Schema, model, Document, Types } from "mongoose";

export type IntegrationConnectionStatus = "connected" | "syncing" | "error" | "disconnected";

export interface IIntegrationConnection {
  orgId: Types.ObjectId;
  connectorKey: string;
  status: IntegrationConnectionStatus;
  lastSyncAt?: Date;
  lastError?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IIntegrationConnectionDocument extends IIntegrationConnection, Document {
  _id: Types.ObjectId;
}

const integrationConnectionSchema = new Schema<IIntegrationConnectionDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    connectorKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    status: {
      type: String,
      enum: ["connected", "syncing", "error", "disconnected"],
      required: true,
      default: "disconnected",
    },
    lastSyncAt: { type: Date },
    lastError: { type: String, trim: true, maxlength: 400 },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

integrationConnectionSchema.index({ orgId: 1, connectorKey: 1 }, { unique: true });
integrationConnectionSchema.index({ orgId: 1, status: 1, updatedAt: -1 });

const IntegrationConnectionModel = model<IIntegrationConnectionDocument>(
  "IntegrationConnection",
  integrationConnectionSchema
);
export default IntegrationConnectionModel;
