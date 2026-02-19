import { Schema, model, Document, Types } from "mongoose";

export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "open" | "completed" | "dismissed";
export type TaskKind = "cashflow" | "budget" | "debt" | "invest" | "goal" | "education" | "generic";

export interface ITaskSource {
  agentOutputId?: Types.ObjectId;
  chatMessageId?: Types.ObjectId;
  requestId?: string;
}

export interface ITaskCompletionEvidence {
  note?: string;
  completedAt?: Date;
  effects?: Array<Record<string, unknown>>;
}

export interface ITaskAppliedSummary {
  transactions: string[];
  goals: string[];
  debts: string[];
  profileUpdated: boolean;
}

export type TaskApplyStatus = "pending" | "succeeded" | "failed";

export interface ITask {
  _id: string;
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  source?: ITaskSource;
  bucket: 7 | 30 | 365;
  title: string;
  why: string;
  steps: string[];
  priority: TaskPriority;
  expected_impact: string;
  kind: TaskKind;
  dueDate?: Date;
  status: TaskStatus;
  completedAt?: Date;
  completionEvidence?: ITaskCompletionEvidence;
  appliedAt?: Date;
  appliedSummary?: ITaskAppliedSummary;
  applyStatus?: TaskApplyStatus;
  applyErrorCode?: string;
  applyIdempotencyKey?: string;
  actionLinkId?: string;
  outcomeRefs?: string[];
}

export interface ITaskDocument extends Omit<ITask, "_id">, Document<string> {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITaskDocument>(
  {
    _id: { type: String, required: true },
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    source: {
      agentOutputId: { type: Schema.Types.ObjectId, ref: "AgentOutput" },
      chatMessageId: { type: Schema.Types.ObjectId, ref: "ChatMessage" },
      requestId: { type: String }
    },
    bucket: { type: Number, enum: [7, 30, 365], required: true },
    title: { type: String, required: true },
    why: { type: String, required: true },
    steps: { type: [String], default: [] },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    expected_impact: { type: String, required: true },
    kind: {
      type: String,
      enum: ["cashflow", "budget", "debt", "invest", "goal", "education", "generic"],
      default: "generic"
    },
    dueDate: { type: Date },
    status: { type: String, enum: ["open", "completed", "dismissed"], default: "open" },
    completedAt: { type: Date },
    completionEvidence: {
      note: { type: String, trim: true, maxlength: 1000 },
      completedAt: { type: Date },
      effects: { type: [Schema.Types.Mixed], default: [] }
    },
    appliedAt: { type: Date },
    appliedSummary: {
      transactions: { type: [String], default: [] },
      goals: { type: [String], default: [] },
      debts: { type: [String], default: [] },
      profileUpdated: { type: Boolean, default: false }
    },
    applyStatus: { type: String, enum: ["pending", "succeeded", "failed"] },
    applyErrorCode: { type: String, trim: true, maxlength: 80 },
    applyIdempotencyKey: { type: String, trim: true, maxlength: 128 },
    actionLinkId: { type: String, trim: true, maxlength: 128 },
    outcomeRefs: { type: [String], default: [] }
  },
  { timestamps: true }
);

taskSchema.index({ orgId: 1, userId: 1, status: 1, dueDate: 1 });
taskSchema.index({ orgId: 1, userId: 1, updatedAt: -1 });
taskSchema.index({ orgId: 1, userId: 1, "source.agentOutputId": 1, updatedAt: -1 });
taskSchema.index({ orgId: 1, userId: 1, applyIdempotencyKey: 1 }, { sparse: true });

const TaskModel = model<ITaskDocument>("Task", taskSchema);
export default TaskModel;
