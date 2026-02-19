import { Schema, model, Document, Types } from "mongoose";

export type WorkflowRunStatus = "queued" | "running" | "succeeded" | "failed";

export interface IWorkflowRunResult {
  tasks_created: string[];
  exports_created?: string[];
  notifications_sent?: Array<{ channel: string; to: string; mode: string }>;
}

export interface IWorkflowRun {
  orgId: Types.ObjectId;
  workflowId: Types.ObjectId;
  triggeredByUserId: Types.ObjectId;
  status: WorkflowRunStatus;
  idempotencyKey?: string;
  requestId?: string;
  startedAt?: Date;
  finishedAt?: Date;
  result?: IWorkflowRunResult;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWorkflowRunDocument extends IWorkflowRun, Document {
  _id: Types.ObjectId;
}

const workflowRunSchema = new Schema<IWorkflowRunDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    workflowId: { type: Schema.Types.ObjectId, ref: "Workflow", required: true, index: true },
    triggeredByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["queued", "running", "succeeded", "failed"], default: "queued", index: true },
    idempotencyKey: { type: String, trim: true, maxlength: 128 },
    requestId: { type: String, trim: true, maxlength: 128 },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    result: { type: Schema.Types.Mixed, default: {} },
    error: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

workflowRunSchema.index({ orgId: 1, createdAt: -1 });
workflowRunSchema.index({ workflowId: 1, createdAt: -1 });
workflowRunSchema.index(
  { workflowId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string" },
    },
  }
);

const WorkflowRunModel = model<IWorkflowRunDocument>("WorkflowRun", workflowRunSchema);
export default WorkflowRunModel;
