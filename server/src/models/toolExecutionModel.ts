import { Schema, model, Document, Types } from "mongoose";
import { orgScopePlugin } from "../utils/orgScopePlugin";

// Defines execution outcome status values for invoked AI agent tools.
// Tracks tool progression from active execution through success or error states.
// Used by orchestrators to manage timeouts, retries, and task dependencies.
export type ToolExecutionStatus = "running" | "succeeded" | "failed";

// Defines domain attributes for recording individual AI agent tool invocations.
// Stores tool parameters, idempotency tokens, execution results, and error logs.
// Guarantees reliable exactly-once semantics for side-effecting financial actions.
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

// Merges tool execution attributes with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent tool execution record returned by audit queries.
export interface IToolExecutionDocument extends IToolExecution, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema mapping for the agent tool execution collection.
// Enforces validation rules on tool identifiers, call parameters, and error limits.
// Automatically manages creation and modification timestamps across execution steps.
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

// Configures compound database indexes for tool audit tracking and deduplication.
// Enforces a strict unique index on idempotency keys per user and organization.
// Optimizes chronological ordering for fetching historical tool execution logs.
toolExecutionSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
toolExecutionSchema.index(
  { orgId: 1, userId: 1, idempotencyKey: 1 },
  {
    unique: true,
  }
);

// Enforces organization multi-tenant security guards on all tool execution queries.
// Prevents accidental data leaks by blocking queries missing an organization identifier.
// Validates and guards both read operations and mutating write transactions.
// Tenant guard: unscoped reads/writes throw when ORG_SCOPE_ENFORCE / production (see utils/orgScopePlugin).
toolExecutionSchema.plugin(orgScopePlugin, { guardWrites: true });

// Compiles and exports the Mongoose model for AI tool invocation audit records.
// Exposes data access methods to log, update, verify, and replay tool executions.
// Ensures idempotent and secure execution of agent actions across services.
const ToolExecutionModel = model<IToolExecutionDocument>("ToolExecution", toolExecutionSchema);
export default ToolExecutionModel;

