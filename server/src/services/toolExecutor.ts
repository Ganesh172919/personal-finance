import mongoose from "mongoose";

import type { ToolCallInput } from "../schemas/v1/toolSchemas";
import ToolExecutionModel from "../models/toolExecutionModel";
import { HttpError } from "../middleware/httpError";
import type { MutationSource } from "../types/provenance";
import { enforceToolRole, getToolHandler } from "./tools/registry";
import { enforceFeatureLimit } from "./entitlements";
import { evaluateToolPolicy } from "./toolPolicy";

// Trims and constrains an idempotency key string within maximum bounds.
// Prevents oversized cache keys from degrading database index lookups.
// Normalizes unique request identifiers for safe replay deduplication.
const clampIdempotencyKey = (value: string) => value.trim().slice(0, 128);

// Constructs a standardized data mutation provenance record for audit trails.
// Encapsulates request identifiers, action link references, and origin details.
// Links downstream state changes directly to the invoking AI tool action.
const buildMutationSource = (params: {
  requestId?: string;
  actionLinkId?: string;
  note?: string;
  sourceRef?: string;
}): MutationSource => ({
  origin: "ai_plan" as const,
  request_id: params.requestId,
  action_link_id: params.actionLinkId,
  actor_type: "user" as const,
  source_ref: params.sourceRef,
  note: params.note,
});

// Represents the dry-run simulation outcome of an AI tool invocation.
// Indicates whether confirmation is mandated and reflects assessed risk levels.
// Supplies preview payload details without persisting state mutations.
export type ToolSimulationResult = {
  ok: true;
  tool_call_id: string;
  tool: string;
  requires_confirmation: boolean;
  risk: string;
  preview: Record<string, unknown>;
  request_id?: string;
};

// Simulates an AI tool invocation in a dry-run environment without applying mutations.
// Verifies caller roles, evaluates security policy constraints, and checks quotas.
// Returns a preview payload detailing anticipated system side effects.
export const simulateToolCall = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  actorRole: "member" | "admin" | "owner";
  toolCall: ToolCallInput;
  requestId?: string;
}): Promise<ToolSimulationResult> => {
  const handler = getToolHandler(params.toolCall.tool);
  enforceToolRole({ actorRole: params.actorRole, requiredRole: handler.requiredRole });

  if (handler.catalog.required_entitlement) {
    await enforceFeatureLimit({
      orgId: params.orgId,
      userId: params.userId,
      feature: handler.catalog.required_entitlement.feature as any,
      units: handler.catalog.required_entitlement.units,
      requestId: params.requestId,
    });
  }

  const policy = evaluateToolPolicy({ toolCall: params.toolCall, catalog: handler.catalog });

  const preview = await handler.simulate({
    orgId: params.orgId,
    userId: params.userId,
    actorRole: params.actorRole,
    toolCall: params.toolCall,
    requestId: params.requestId,
  });

  return {
    ok: true,
    tool_call_id: params.toolCall.id,
    tool: params.toolCall.tool,
    requires_confirmation: policy.requires_confirmation,
    risk: policy.risk,
    preview,
    request_id: params.requestId,
  };
};

// Represents the completed execution outcome of a dispatched AI tool call.
// Reports tool execution identifiers, idempotency indicators, and result payloads.
// Flags whether the execution represented an idempotent replay from cache.
export type ToolExecuteResult = {
  ok: true;
  tool_execution_id: string;
  tool_call_id: string;
  tool: string;
  idempotency_key: string;
  idempotent_replay: boolean;
  result: Record<string, unknown>;
  request_id?: string;
};

// Executes a validated AI tool call with strict idempotency and policy enforcement.
// Verifies user confirmations, checks entitlement quotas, and runs tool handlers.
// Records execution lifecycle states and caches successful results for deduplication.
export const executeToolCall = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  actorRole: "member" | "admin" | "owner";
  toolCall: ToolCallInput;
  requestId?: string;
  idempotencyKey?: string;
  confirmed?: boolean;
}): Promise<ToolExecuteResult> => {
  const confirmed = params.confirmed ?? true;
  const idempotencyKey = clampIdempotencyKey(params.idempotencyKey || params.toolCall.id);
  if (!idempotencyKey) {
    throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "Missing idempotency key");
  }

  const existing = await ToolExecutionModel.findOne({
    orgId: params.orgId,
    userId: params.userId,
    idempotencyKey,
  }).lean();
  if (existing) {
    if ((existing as any).status === "succeeded") {
      return {
        ok: true,
        tool_execution_id: String((existing as any)._id),
        tool_call_id: String((existing as any).toolCallId || params.toolCall.id),
        tool: String((existing as any).tool || params.toolCall.tool),
        idempotency_key: idempotencyKey,
        idempotent_replay: true,
        result: ((existing as any).result as any) || {},
        request_id: params.requestId,
      };
    }
    if ((existing as any).status === "running") {
      throw new HttpError(409, "TOOL_ALREADY_RUNNING", "Tool execution already in progress");
    }
  }

  const handler = getToolHandler(params.toolCall.tool);
  const policy = evaluateToolPolicy({ toolCall: params.toolCall, catalog: handler.catalog });

  if (policy.requires_confirmation && !confirmed) {
    throw new HttpError(400, "CONFIRMATION_REQUIRED", "Tool call requires confirmation", {
      tool: params.toolCall.tool,
      tool_call_id: params.toolCall.id,
      risk: policy.risk,
    });
  }

  if (handler.catalog.required_entitlement) {
    await enforceFeatureLimit({
      orgId: params.orgId,
      userId: params.userId,
      feature: handler.catalog.required_entitlement.feature as any,
      units: handler.catalog.required_entitlement.units,
      requestId: params.requestId,
    });
  }

  const created =
    (await ToolExecutionModel.create({
      orgId: params.orgId,
      userId: params.userId,
      tool: params.toolCall.tool,
      toolCallId: params.toolCall.id,
      idempotencyKey,
      status: "running",
      requestId: params.requestId,
      toolCall: params.toolCall as unknown as Record<string, unknown>,
    }).catch(async (error: any) => {
      if (error?.code !== 11000) {
        throw error;
      }
      const raced = await ToolExecutionModel.findOne({ orgId: params.orgId, userId: params.userId, idempotencyKey });
      if (!raced) {
        throw error;
      }
      return raced;
    })) as any;

  if (created.status === "succeeded") {
    return {
      ok: true,
      tool_execution_id: String(created._id),
      tool_call_id: String(created.toolCallId || params.toolCall.id),
      tool: String(created.tool || params.toolCall.tool),
      idempotency_key: idempotencyKey,
      idempotent_replay: true,
      result: created.result || {},
      request_id: params.requestId,
    };
  }

  const finalizeSuccess = async (result: Record<string, unknown>): Promise<ToolExecuteResult> => {
    created.status = "succeeded";
    created.result = result;
    created.error = undefined;
    created.finishedAt = new Date();
    await created.save();

    return {
      ok: true,
      tool_execution_id: String(created._id),
      tool_call_id: params.toolCall.id,
      tool: params.toolCall.tool,
      idempotency_key: idempotencyKey,
      idempotent_replay: false,
      result,
      request_id: params.requestId,
    };
  };

  const finalizeFailure = async (error: unknown) => {
    created.status = "failed";
    created.error = error instanceof Error ? error.message : String(error);
    created.finishedAt = new Date();
    await created.save();
    throw error;
  };

  try {
    const source = buildMutationSource({
      requestId: params.requestId,
      actionLinkId: `tool:${params.toolCall.id}`.slice(0, 128),
      note: params.toolCall.title,
      sourceRef: `tool:${params.toolCall.tool}`.slice(0, 128),
    });

    enforceToolRole({ actorRole: params.actorRole, requiredRole: handler.requiredRole });

    const result = await handler.execute({
      orgId: params.orgId,
      userId: params.userId,
      actorRole: params.actorRole,
      toolCall: params.toolCall,
      requestId: params.requestId,
      source,
    });

    return finalizeSuccess(result);
  } catch (error) {
    return finalizeFailure(error);
  }
};
