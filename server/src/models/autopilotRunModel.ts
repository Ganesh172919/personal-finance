import { Schema, model, Document, Types } from "mongoose";

export type AutopilotRunStatus =
  | "planned"
  | "simulated"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "succeeded"
  | "failed";

export interface IAutopilotRun {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  goal: string;
  status: AutopilotRunStatus;
  ai?: Record<string, unknown>;
  toolCalls?: Array<Record<string, unknown>>;
  simulations?: Array<Record<string, unknown>>;
  approvals?: Record<string, unknown>;
  executions?: Array<Record<string, unknown>>;
  error?: string;
  requestId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAutopilotRunDocument extends IAutopilotRun, Document {
  _id: Types.ObjectId;
}

const autopilotRunSchema = new Schema<IAutopilotRunDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    goal: { type: String, required: true, trim: true, maxlength: 4000 },
    status: {
      type: String,
      enum: ["planned", "simulated", "awaiting_approval", "approved", "executing", "succeeded", "failed"],
      required: true,
      default: "planned",
      index: true,
    },
    ai: { type: Schema.Types.Mixed, default: {} },
    toolCalls: { type: [Schema.Types.Mixed], default: [] },
    simulations: { type: [Schema.Types.Mixed], default: [] },
    approvals: { type: Schema.Types.Mixed, default: {} },
    executions: { type: [Schema.Types.Mixed], default: [] },
    error: { type: String, trim: true, maxlength: 4000 },
    requestId: { type: String, trim: true, maxlength: 128 },
  },
  { timestamps: true }
);

autopilotRunSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
autopilotRunSchema.index({ orgId: 1, status: 1, createdAt: -1 });

const AutopilotRunModel = model<IAutopilotRunDocument>("AutopilotRun", autopilotRunSchema);
export default AutopilotRunModel;

