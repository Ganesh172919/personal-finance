import { Schema, model, Document, Types } from "mongoose";

// Enumerates payment dunning lifecycle states for delinquent subscriptions.
// Distinguishes active retry sequences from recovered accounts or exhausted retries.
// Used by billing controllers to gate subscription access during payment failures.
export type DunningStatus = "active" | "recovered" | "exhausted";

// Defines TypeScript interface for tracking payment retry attempts during dunning.
// Records attempt index, timestamp, outcome status, error details, and invoice.
// Provides historical audit logs of recovery workflows following card declines.
export interface IDunningRetryHistory {
  attempt: number;
  attemptedAt: Date;
  status: "failed" | "succeeded";
  failureReason?: string;
  invoiceNumber?: string;
}

// Defines TypeScript contract representing an active dunning management cycle.
// Tracks attempt counters, grace period deadlines, scheduled retries, and errors.
// Encapsulates tenant subscription recovery status and past retry history records.
export interface IDunning {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  status: DunningStatus;
  currentAttempt: number;
  maxAttempts: number;
  firstFailedAt: Date;
  gracePeriodExpiresAt: Date;
  nextRetryAt: Date;
  lastFailureReason: string;
  retryHistory: IDunningRetryHistory[];
  createdAt: Date;
  updatedAt: Date;
}

// Extends IDunning with Mongoose Document properties and ObjectId primary key.
// Enables runtime database querying, persistence methods, and schema validation.
// Represents individual dunning cycle documents within MongoDB collection.
export interface IDunningDocument extends IDunning, Document {
  _id: Types.ObjectId;
}

// Sub-document Mongoose schema recording historical payment retry attempts.
// Tracks attempt number, execution timestamps, failure reasons, and outcomes.
// Embedded inside the parent dunning schema without generating separate ObjectIds.
const dunningRetryHistorySchema = new Schema<IDunningRetryHistory>(
  {
    attempt: { type: Number, required: true },
    attemptedAt: { type: Date, required: true, default: Date.now },
    status: { type: String, enum: ["failed", "succeeded"], required: true },
    failureReason: { type: String },
    invoiceNumber: { type: String },
  },
  { _id: false }
);

// Mongoose schema definition governing subscription dunning recovery cycles.
// Enforces unique organization mapping, status enumerations, and retry limits.
// Automatically tracks record creation and modification timestamps for billing.
const dunningSchema = new Schema<IDunningDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["active", "recovered", "exhausted"], required: true, default: "active" },
    currentAttempt: { type: Number, required: true, default: 1 },
    maxAttempts: { type: Number, required: true, default: 3 },
    firstFailedAt: { type: Date, required: true, default: Date.now },
    gracePeriodExpiresAt: { type: Date, required: true },
    nextRetryAt: { type: Date, required: true },
    lastFailureReason: { type: String, required: true, default: "card_declined" },
    retryHistory: [dunningRetryHistorySchema],
  },
  { timestamps: true }
);

// Instantiates and exports compiled Mongoose model for "Dunning" collection.
// Provides strongly typed querying, retry scheduling, and recovery state updates.
// Consumed by billing retry cron jobs, payment webhooks, and dunning controllers.
export default model<IDunningDocument>("Dunning", dunningSchema);
