import { Schema, model, Document, Types } from "mongoose";

export type DunningStatus = "active" | "recovered" | "exhausted";

export interface IDunningRetryHistory {
  attempt: number;
  attemptedAt: Date;
  status: "failed" | "succeeded";
  failureReason?: string;
  invoiceNumber?: string;
}

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

export interface IDunningDocument extends IDunning, Document {
  _id: Types.ObjectId;
}

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

export default model<IDunningDocument>("Dunning", dunningSchema);
