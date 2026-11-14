import { Schema, model, Document, Types } from "mongoose";
import { orgScopePlugin } from "../utils/orgScopePlugin";

// Enumerates lifecycle execution states for automated financial autopilot runs.
// Tracks progression from planning, dry-run simulation, approval, to final execution.
// Enforced across workflow orchestrators and state machines governing autopilot logic.
export type AutopilotRunStatus =
  | "planned"
  | "simulated"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "succeeded"
  | "failed";

// Defines TypeScript contract representing an autonomous goal execution run.
// Stores high-level financial goals, planned tool calls, simulations, and approvals.
// Provides structured schema tracking autonomous multi-step workflow execution.
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

// Extends IAutopilotRun with Mongoose Document methods and MongoDB identifier.
// Enables runtime database querying, validation rules, and typed persistence.
// Represents individual autopilot execution run documents in MongoDB storage.
export interface IAutopilotRunDocument extends IAutopilotRun, Document {
  _id: Types.ObjectId;
}

// Mongoose schema definition governing autopilot execution run persistence.
// Enforces status enumerations, goal string boundaries, and tenant foreign keys.
// Configured with automated createdAt and updatedAt timestamp tracking options.
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

// Compound indexes optimizing user and organizational autopilot run retrieval.
// Accelerates historical query execution and status filtering for active runs.
// Ensures performant querying across high-volume automated workflow histories.
autopilotRunSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
autopilotRunSchema.index({ orgId: 1, status: 1, createdAt: -1 });

// Tenant guard: unscoped reads/writes throw when ORG_SCOPE_ENFORCE / production (see utils/orgScopePlugin).
// Enforces strict organizational multi-tenancy boundaries on autopilot runs.
// Guarantees write safety by throwing errors on unscoped queries in production.
// Prevents accidental data leaks between organizations running autonomous tasks.
autopilotRunSchema.plugin(orgScopePlugin, { guardWrites: true });

// Instantiates Mongoose model bound to MongoDB "AutopilotRun" collection.
// Provides strongly typed CRUD operations and query building capabilities.
// Central model invoked by autopilot orchestrators and workflow execution agents.
const AutopilotRunModel = model<IAutopilotRunDocument>("AutopilotRun", autopilotRunSchema);
// Exports compiled AutopilotRunModel instance as default module export.
// Imported by automation controllers, background workers, and review handlers.
// Serves as primary data access layer for autonomous financial task records.
export default AutopilotRunModel;
