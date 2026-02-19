import { Schema, model, Document, Types } from "mongoose";

export type ToolExecutionStatus = "running" | "succeeded" | "failed";

export interface IToolExecution {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  tool: string;
  toolCallId: string;
  idempotencyKey: string;
  status: ToolExecutionStatus;
  requestId?: string;
  toolCall?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IToolExecutionDocument extends IToolExecution, Document {
  _id: Types.ObjectId;
}

const toolExecutionSchema = new Schema<IToolExecutionDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tool: { type: String, required: true, trim: true, maxlength: 120, index: true },
    toolCallId: { type: String, required: true, trim: true, maxlength: 128 },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 128 },
    status: { type: String, enum: ["running", "succeeded", "failed"], default: "running", index: true },
    requestId: { type: String, trim: true, maxlength: 128 },
    toolCall: { type: Schema.Types.Mixed, default: {} },
    result: { type: Schema.Types.Mixed, default: {} },
    error: { type: String, trim: true, maxlength: 2000 },
    finishedAt: { type: Date },
  },
  { timestamps: true }
);

toolExecutionSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
toolExecutionSchema.index(
  { orgId: 1, userId: 1, idempotencyKey: 1 },
  {
    unique: true,
  }
);

const ToolExecutionModel = model<IToolExecutionDocument>("ToolExecution", toolExecutionSchema);
export default ToolExecutionModel;

