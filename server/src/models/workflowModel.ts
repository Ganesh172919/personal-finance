import { Schema, model, Document, Types } from "mongoose";

import type { TaskKind, TaskPriority } from "./taskModel";
import type { ExportJobType } from "./exportJobModel";

export type WorkflowTriggerType = "manual" | "cron" | "event";
export type WorkflowActionType = "create_task" | "send_notification" | "export_report";

export type WorkflowTrigger = {
  type: WorkflowTriggerType;
  cron?: string;
  event_type?: string;
};

export type WorkflowCreateTaskAction = {
  type: "create_task";
  bucket: 7 | 30 | 365;
  title: string;
  why: string;
  steps: string[];
  priority: TaskPriority;
  expected_impact: string;
  kind: TaskKind;
  due_days?: number;
};

export type WorkflowSendNotificationAction = {
  type: "send_notification";
  channel: "email";
  subject: string;
  message: string;
};

export type WorkflowExportReportAction = {
  type: "export_report";
  export_type: ExportJobType;
  params?: Record<string, unknown>;
};

export type WorkflowAction = WorkflowCreateTaskAction | WorkflowSendNotificationAction | WorkflowExportReportAction;

export interface IWorkflow {
  orgId: Types.ObjectId;
  createdByUserId: Types.ObjectId;
  name: string;
  enabled: boolean;
  trigger: WorkflowTrigger;
  actions: WorkflowAction[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IWorkflowDocument extends IWorkflow, Document {
  _id: Types.ObjectId;
}

const workflowCreateTaskActionSchema = new Schema<WorkflowCreateTaskAction>(
  {
    type: { type: String, enum: ["create_task"], required: true },
    bucket: { type: Number, enum: [7, 30, 365], required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    why: { type: String, required: true, trim: true, maxlength: 800 },
    steps: { type: [String], default: [] },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    expected_impact: { type: String, required: true, trim: true, maxlength: 1200 },
    kind: {
      type: String,
      enum: ["cashflow", "budget", "debt", "invest", "goal", "education", "generic"],
      default: "generic",
    },
    due_days: { type: Number, min: 1, max: 3650 },
  },
  { _id: false }
);

const workflowSendNotificationActionSchema = new Schema<WorkflowSendNotificationAction>(
  {
    type: { type: String, enum: ["send_notification"], required: true },
    channel: { type: String, enum: ["email"], required: true, default: "email" },
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { _id: false }
);

const workflowExportReportActionSchema = new Schema<WorkflowExportReportAction>(
  {
    type: { type: String, enum: ["export_report"], required: true },
    export_type: { type: String, enum: ["transactions_csv", "monthly_summary_pdf"], required: true },
    params: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const workflowSchema = new Schema<IWorkflowDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    enabled: { type: Boolean, default: true },
    trigger: {
      type: {
        type: String,
        enum: ["manual", "cron", "event"],
        required: true,
        default: "manual",
      },
      cron: { type: String, trim: true, maxlength: 120 },
      event_type: { type: String, trim: true, maxlength: 120 },
    },
    actions: { type: [Schema.Types.Mixed as any], default: [] },
  },
  { timestamps: true }
);

workflowSchema.index({ orgId: 1, enabled: 1, createdAt: -1 });
workflowSchema.index({ orgId: 1, createdByUserId: 1, createdAt: -1 });
workflowSchema.index({ orgId: 1, enabled: 1, "trigger.type": 1, "trigger.event_type": 1, createdAt: -1 });

const WorkflowModel = model<IWorkflowDocument>("Workflow", workflowSchema);
export default WorkflowModel;
