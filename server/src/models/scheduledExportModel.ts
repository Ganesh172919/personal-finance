import mongoose, { Document, Schema, Types } from "mongoose";

export type ScheduledExportType = "transactions_csv" | "monthly_summary_pdf";
export type ScheduledExportFrequency = "weekly" | "monthly";
export type ScheduledExportStatus = "active" | "paused";
export type ScheduledExportDeliveryStatus = "success" | "failed" | "none";
export type ScheduledExportDestination = "email" | "webhook" | "cloud_storage";

export interface IScheduledExportDestinationConfig {
  webhookUrl?: string;
  authHeader?: string;
  cloudProvider?: "s3" | "gcs";
  bucketName?: string;
  bucketRegion?: string;
  bucketPrefix?: string;
  customFilename?: string;
}

export interface IScheduledExport {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  type: ScheduledExportType;
  frequency: ScheduledExportFrequency;
  destination: ScheduledExportDestination;
  destinationConfig?: IScheduledExportDestinationConfig;
  deliveryEmail?: string;
  status: ScheduledExportStatus;
  params: Record<string, unknown>;
  lastRunAt: Date | null;
  nextRunAt: Date;
  lastDeliveryStatus: ScheduledExportDeliveryStatus;
  lastDeliveryDetails?: Record<string, unknown>;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type IScheduledExportDocument = IScheduledExport & Document;

const scheduledExportSchema = new Schema<IScheduledExportDocument>(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    type: {
      type: String,
      enum: ["transactions_csv", "monthly_summary_pdf"],
      required: true,
    },
    frequency: {
      type: String,
      enum: ["weekly", "monthly"],
      required: true,
      default: "monthly",
    },
    destination: {
      type: String,
      enum: ["email", "webhook", "cloud_storage"],
      default: "email",
      index: true,
    },
    destinationConfig: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    deliveryEmail: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      enum: ["active", "paused"],
      default: "active",
      index: true,
    },
    params: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    lastRunAt: {
      type: Date,
      default: null,
    },
    nextRunAt: {
      type: Date,
      required: true,
      index: true,
    },
    lastDeliveryStatus: {
      type: String,
      enum: ["success", "failed", "none"],
      default: "none",
    },
    lastError: {
      type: String,
      default: null,
    },
    lastDeliveryDetails: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

scheduledExportSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
scheduledExportSchema.index({ status: 1, nextRunAt: 1 });

const ScheduledExportModel =
  mongoose.models.ScheduledExport ||
  mongoose.model<IScheduledExportDocument>("ScheduledExport", scheduledExportSchema);

export default ScheduledExportModel;
