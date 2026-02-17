import { Schema, model, Document, Types } from "mongoose";

export type UsageFeature = "monthly_ai_calls" | "scenario_depth" | "ocr_quota" | "export_access";

export interface IUsageEvent {
  userId: Types.ObjectId;
  feature: UsageFeature;
  units: number;
  periodKey: string;
  requestId?: string;
  idempotencyKey?: string;
  context?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUsageEventDocument extends IUsageEvent, Document {
  _id: Types.ObjectId;
}

const usageEventSchema = new Schema<IUsageEventDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    feature: {
      type: String,
      enum: ["monthly_ai_calls", "scenario_depth", "ocr_quota", "export_access"],
      required: true,
      index: true,
    },
    units: { type: Number, required: true, min: 0 },
    periodKey: { type: String, required: true, trim: true, maxlength: 16, index: true },
    requestId: { type: String, trim: true, maxlength: 128 },
    idempotencyKey: { type: String, trim: true, maxlength: 128 },
    context: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

usageEventSchema.index({ userId: 1, feature: 1, periodKey: 1, createdAt: -1 });
usageEventSchema.index(
  { userId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string" },
    },
  }
);

const UsageEventModel = model<IUsageEventDocument>("UsageEvent", usageEventSchema);
export default UsageEventModel;
