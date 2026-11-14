import mongoose, { Document, Schema, Types } from "mongoose";

// Defines status, frequency, destination, and file format classifications for scheduled exports.
// Distinguishes export intervals, delivery targets (email, webhook, S3/GCS), and run states.
// Used by scheduled background export processors and delivery status tracking.
export type ScheduledExportType = "transactions_csv" | "monthly_summary_pdf";
export type ScheduledExportFrequency = "weekly" | "monthly";
export type ScheduledExportStatus = "active" | "paused" | "running";
export type ScheduledExportDeliveryStatus = "success" | "failed" | "none";
export type ScheduledExportDestination = "email" | "webhook" | "cloud_storage";

// Defines destination credentials and endpoints for external export delivery.
// Stores webhook URLs, authorization headers, and cloud bucket parameters for S3 and GCS.
// Enables automated data transport directly to user-managed infrastructure.
export interface IScheduledExportDestinationConfig {
  webhookUrl?: string;
  authHeader?: string;
  cloudProvider?: "s3" | "gcs";
  bucketName?: string;
  bucketRegion?: string;
  bucketPrefix?: string;
  customFilename?: string;
}

// Defines the domain attributes for recurring data export configurations.
// Tracks execution frequencies, filter parameters, next scheduled run dates, and delivery logs.
// Serves as the configuration blueprint for automated periodic financial reporting.
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

// Combines scheduled export properties with Mongoose Document methods and lifecycle hooks.
// Exposes database primary keys, document timestamps, and ODM update helpers.
// Represents a persistent scheduled export document returned by database queries.
export type IScheduledExportDocument = IScheduledExport & Document;

// Configures the Mongoose schema mapping for the scheduled export configuration collection.
// Enforces validation rules on export types, delivery destinations, and next run timestamps.
// Automatically manages creation and modification timestamps across schedule changes.
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
      enum: ["active", "paused", "running"],
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

// Configures compound database indexes for scheduled worker polling and user views.
// Accelerates queries finding active exports scheduled for immediate execution.
// Optimizes user dashboard queries fetching export configurations sorted chronologically.
scheduledExportSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
scheduledExportSchema.index({ status: 1, nextRunAt: 1 });

// Compiles or retrieves the existing Mongoose model for scheduled data exports.
// Exposes data access methods to schedule, pause, resume, or execute report jobs.
// Drives automated weekly and monthly recurring PDF and CSV financial exports.
const ScheduledExportModel =
  mongoose.models.ScheduledExport ||
  mongoose.model<IScheduledExportDocument>("ScheduledExport", scheduledExportSchema);

export default ScheduledExportModel;
