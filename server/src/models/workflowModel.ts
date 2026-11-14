import { Schema, model, Document, Types } from "mongoose";

import type { TaskKind, TaskPriority } from "./taskModel";
import type { ExportJobType } from "./exportJobModel";

// Defines trigger mechanisms and supported action execution kinds for automated workflows.
// Distinguishes execution triggers (manual, cron, event, webhook) and action primitives.
// Serves as the foundational type system for the visual workflow automation engine.
export type WorkflowTriggerType = "manual" | "cron" | "event" | "webhook";
export type WorkflowActionType = "create_task" | "send_notification" | "export_report" | "delay";

// Defines logical evaluation operators and condition criteria for workflow actions.
// Supports equality, numerical comparison, and substring contains operators on event fields.
// Enables fine-grained branching rules to conditionally execute individual workflow steps.
export type WorkflowConditionOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains";

export type WorkflowActionCondition = {
  field: string;
  operator: WorkflowConditionOperator;
  value: string | number | boolean;
};

// Defines the trigger specification configuration for initiating a workflow run.
// Encapsulates cron timing strings, domain event patterns, and inbound webhook secrets.
// Directs event dispatchers and background schedulers to awaken active workflows.
export type WorkflowTrigger = {
  type: WorkflowTriggerType;
  cron?: string;
  event_type?: string;
  webhook_token?: string;
};

// Defines the configuration payload for automated task generation actions.
// Specifies task time horizons, priority classifications, step arrays, and due date offsets.
// Enables workflows to construct action items upon financial triggers or milestone completions.
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
  condition?: WorkflowActionCondition;
};

// Defines notification dispatch parameters for workflow execution steps.
// Directs templated messages to user channels including email digests and in-app feeds.
// Delivers proactive financial alerts and milestone celebrations to collaborators.
export type WorkflowSendNotificationAction = {
  type: "send_notification";
  channel: "email" | "in_app";
  subject: string;
  message: string;
  condition?: WorkflowActionCondition;
};

// Configures automated report generation steps within workflow definitions.
// Specifies export types such as CSV ledgers or PDF summaries alongside query filters.
// Automates asynchronous generation and archival of periodic compliance reports.
export type WorkflowExportReportAction = {
  type: "export_report";
  export_type: ExportJobType;
  params?: Record<string, unknown>;
  condition?: WorkflowActionCondition;
};

// Defines sleep and delay steps within sequential workflow execution graphs.
// Configures duration intervals in seconds to pause execution between dependent steps.
// Facilitates multi-day onboarding drip cadences and staged follow-up check-ins.
export type WorkflowDelayAction = {
  type: "delay";
  duration_seconds: number;
  description?: string;
  condition?: WorkflowActionCondition;
};

// Defines the discriminated union representing all permissible workflow execution actions.
// Comprises task creation, notification dispatch, report generation, and execution delays.
// Enforces type safety across workflow action deserialization and runner execution.
export type WorkflowAction =
  | WorkflowCreateTaskAction
  | WorkflowSendNotificationAction
  | WorkflowExportReportAction
  | WorkflowDelayAction;

// Defines the comprehensive domain interface for saved automation workflow blueprints.
// Stores multi-tenant references, enabled toggles, trigger rules, and action step arrays.
// Represents user-configured automation pipelines driving scheduled financial operations.
export interface IWorkflow {
  orgId: Types.ObjectId;
  createdByUserId: Types.ObjectId;
  name: string;
  enabled: boolean;
  trigger: WorkflowTrigger;
  scheduleTimezone?: string;
  nextRunAt?: Date;
  lastRunAt?: Date;
  lastError?: string;
  actions: WorkflowAction[];
  createdAt: Date;
  updatedAt: Date;
}

// Merges workflow blueprint domain attributes with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent workflow definition document returned by automation queries.
export interface IWorkflowDocument extends IWorkflow, Document {
  _id: Types.ObjectId;
}

// Configures the subdocument Mongoose schema for action evaluation conditions.
// Enforces comparison operator validation across string, number, and boolean payloads.
// Implements _id: false to optimize storage overhead within embedded action arrays.
const workflowActionConditionSchema = new Schema<WorkflowActionCondition>(
  {
    field: { type: String, required: true, trim: true, maxlength: 120 },
    operator: {
      type: String,
      enum: ["eq", "neq", "gt", "gte", "lt", "lte", "contains"],
      required: true,
    },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false }
);

// Configures the subdocument Mongoose schema for task creation workflow actions.
// Enforces validation rules on bucket horizons, task priorities, kinds, and due days.
// Enables validation of embedded task action templates before workflow persistence.
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
    condition: { type: workflowActionConditionSchema, required: false },
  },
  { _id: false }
);

// Configures the subdocument Mongoose schema for notification dispatch actions.
// Validates delivery channel selections, subject string lengths, and message bodies.
// Ensures notification templates conform to schema limits prior to execution.
const workflowSendNotificationActionSchema = new Schema<WorkflowSendNotificationAction>(
  {
    type: { type: String, enum: ["send_notification"], required: true },
    channel: { type: String, enum: ["email", "in_app"], required: true, default: "email" },
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    condition: { type: workflowActionConditionSchema, required: false },
  },
  { _id: false }
);

// Configures the subdocument Mongoose schema for report export workflow actions.
// Enforces permitted export formats including CSV transactions and PDF monthly summaries.
// Encapsulates report parameters and conditional triggers for background execution.
const workflowExportReportActionSchema = new Schema<WorkflowExportReportAction>(
  {
    type: { type: String, enum: ["export_report"], required: true },
    export_type: { type: String, enum: ["transactions_csv", "monthly_summary_pdf"], required: true },
    params: { type: Schema.Types.Mixed, default: {} },
    condition: { type: workflowActionConditionSchema, required: false },
  },
  { _id: false }
);

// Configures the subdocument Mongoose schema for execution delay workflow actions.
// Enforces upper and lower boundary constraints on delay durations up to 30 days.
// Manages staged pausing parameters within complex sequential automation graphs.
const workflowDelayActionSchema = new Schema<WorkflowDelayAction>(
  {
    type: { type: String, enum: ["delay"], required: true },
    duration_seconds: { type: Number, required: true, min: 1, max: 86400 * 30 },
    description: { type: String, required: false, trim: true, maxlength: 200 },
    condition: { type: workflowActionConditionSchema, required: false },
  },
  { _id: false }
);

// Configures the primary Mongoose schema mapping for the automation workflow collection.
// Enforces validation rules on workflow names, trigger definitions, and enabled states.
// Automatically manages creation and modification timestamps across workflow updates.
const workflowSchema = new Schema<IWorkflowDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    enabled: { type: Boolean, default: true },
    scheduleTimezone: { type: String, trim: true, maxlength: 80 },
    nextRunAt: { type: Date, index: true },
    lastRunAt: { type: Date },
    lastError: { type: String, trim: true, maxlength: 800 },
    trigger: {
      type: {
        type: String,
        enum: ["manual", "cron", "event", "webhook"],
        required: true,
        default: "manual",
      },
      cron: { type: String, trim: true, maxlength: 120 },
      event_type: { type: String, trim: true, maxlength: 120 },
      webhook_token: { type: String, trim: true, maxlength: 128 },
    },
    actions: { type: [Schema.Types.Mixed as any], default: [] },
  },
  { timestamps: true }
);

// Configures compound database indexes for workflow scheduling and event dispatching.
// Accelerates cron runner polling for active workflows due for immediate execution.
// Establishes a sparse unique index on webhook tokens for authenticated external triggers.
workflowSchema.index({ orgId: 1, enabled: 1, createdAt: -1 });
workflowSchema.index({ orgId: 1, createdByUserId: 1, createdAt: -1 });
workflowSchema.index({ orgId: 1, enabled: 1, "trigger.type": 1, "trigger.event_type": 1, createdAt: -1 });
workflowSchema.index({ enabled: 1, "trigger.type": 1, nextRunAt: 1, orgId: 1 });
workflowSchema.index({ "trigger.webhook_token": 1 }, { unique: true, sparse: true });

// Compiles and exports the Mongoose model for automation workflow definitions.
// Exposes data access methods to query, create, enable, disable, or run workflows.
// Serves as the central persistence blueprint for autonomous financial workflows.
const WorkflowModel = model<IWorkflowDocument>("Workflow", workflowSchema);
export default WorkflowModel;
