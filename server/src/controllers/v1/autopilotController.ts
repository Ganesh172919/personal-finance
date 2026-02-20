import type { Request, Response } from "express";
import crypto from "crypto";
import mongoose from "mongoose";

import type { IUserDocument } from "../../models/userModel";
import AutopilotRunModel from "../../models/autopilotRunModel";
import OrganizationModel from "../../models/organizationModel";
import { HttpError } from "../../middleware/httpError";
import { processAiCoreRequest } from "../../services/aiCoreClient";
import { buildProcessRequest } from "../../services/aiRequestBuilder";
import { enforceFeatureLimit, recordFeatureUsage } from "../../services/entitlements";
import { ensureProfileWithMigration } from "../../services/profileService";
import { fetchTransactionsForAi } from "../../services/transactionService";
import { getJournalContextForAi } from "../../services/journalContext";
import { normalizeAiPlan } from "../../schemas/aiPlanSchema";
import { toolCallSchema, type ToolCallInput } from "../../schemas/v1/toolSchemas";
import { simulateToolCall, executeToolCall } from "../../services/toolExecutor";
import { recordAuditEvent } from "../../services/auditLog";
import { publishDomainEvent } from "../../services/domainEvents";
import { getToolHandler } from "../../services/tools/registry";
import { evaluateToolPolicy } from "../../services/toolPolicy";

const requireOrgId = (req: Request) => {
  const orgIdRaw = String((req as any).org?.orgId || "");
  if (!orgIdRaw || !mongoose.Types.ObjectId.isValid(orgIdRaw)) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(orgIdRaw);
};

const requireOrgRole = (req: Request) => {
  const role = String((req as any).org?.role || "member") as "member" | "admin" | "owner";
  if (role !== "member" && role !== "admin" && role !== "owner") {
    return "member" as const;
  }
  return role;
};

const getOrgAiSettings = async (orgId: mongoose.Types.ObjectId) => {
  const org = await OrganizationModel.findById(orgId).select({ currency: 1, locale: 1, timezone: 1 }).lean();
  return {
    currency: String((org as any)?.currency || "USD"),
    locale: String((org as any)?.locale || "en-US"),
    timezone: String((org as any)?.timezone || "UTC"),
  };
};

const mapRun = (run: any) => ({
  id: String(run._id),
  goal: String(run.goal || ""),
  status: String(run.status || "planned"),
  ai: run.ai || {},
  tool_calls: Array.isArray(run.toolCalls) ? run.toolCalls : [],
  simulations: Array.isArray(run.simulations) ? run.simulations : [],
  approvals: run.approvals || {},
  executions: Array.isArray(run.executions) ? run.executions : [],
  error: run.error || null,
  created_at: run.createdAt || null,
  updated_at: run.updatedAt || null,
});

const requiresExplicitApproval = (raw: unknown): boolean => {
  const parsed = toolCallSchema.safeParse(raw);
  if (!parsed.success) {
    return true;
  }

  try {
    const handler = getToolHandler(parsed.data.tool);
    const policy = evaluateToolPolicy({ toolCall: parsed.data, catalog: handler.catalog });
    return policy.requires_confirmation || policy.risk !== "low";
  } catch {
    return true;
  }
};

export const createAutopilotPlan = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const orgId = requireOrgId(req);
  const { requestId } = req;
  const body = req.body as { goal: string; options?: { narrative?: boolean } };

  await enforceFeatureLimit({
    orgId,
    userId: user._id,
    feature: "monthly_ai_calls",
    units: 1,
    requestId,
  });

  const financialProfile = await ensureProfileWithMigration({ orgId, userId: user._id });
  const txResult = await fetchTransactionsForAi({ orgId, userId: user._id });
  const journalContext = await getJournalContextForAi({ orgId, userId: user._id });
  const orgSettings = await getOrgAiSettings(orgId);

  const { request: aiRequest, stats } = buildProcessRequest({
    userInput: String(body.goal || "").trim(),
    profile: financialProfile,
    orgId: orgId.toString(),
    userId: user._id.toString(),
    orgSettings,
    transactions: txResult.transactions,
    totalTransactions: txResult.stats.totalTransactions,
    conversationHistory: [],
    sessionSummary: journalContext.summary || undefined,
    narrative: typeof body.options?.narrative === "boolean" ? body.options.narrative : false,
  });

  const ai = await processAiCoreRequest(aiRequest, requestId, { userId: user._id.toString() });
  const { plan, valid: planValid } = normalizeAiPlan(ai.plan);

  const validatedToolCalls: ToolCallInput[] = [];
  const droppedToolCalls: Array<{ id: string; tool: string; reason: string }> = [];

  for (const call of Array.isArray(ai.tool_calls) ? ai.tool_calls : []) {
    const parsed = toolCallSchema.safeParse(call);
    if (parsed.success) {
      validatedToolCalls.push(parsed.data);
      continue;
    }
    droppedToolCalls.push({
      id: String((call as any)?.id || ""),
      tool: String((call as any)?.tool || ""),
      reason: "tool_call_schema_invalid",
    });
  }

  const run = await AutopilotRunModel.create({
    orgId,
    userId: user._id,
    goal: String(body.goal || "").trim(),
    status: "planned",
    requestId,
    ai: {
      final_output: ai.final_output,
      plan,
      plan_valid: planValid,
      analysis_type: ai.analysis_type,
      agents_involved: ai.agents_involved,
      request_id: ai.request_id,
      fallback_used: ai.fallback_used,
      llm_call_count: ai.llm_call_count,
      usage: ai.usage,
      tool_calls_dropped: droppedToolCalls.slice(0, 50),
      context_stats: stats,
    },
    toolCalls: validatedToolCalls as unknown as Array<Record<string, unknown>>,
  });

  await recordAuditEvent({
    orgId,
    actorType: "user",
    actorUserId: user._id,
    action: "autopilot_plan_created",
    targetType: "autopilot_run",
    targetId: run._id.toString(),
    requestId,
    metadata: {
      tool_calls: validatedToolCalls.length,
      dropped_tool_calls: droppedToolCalls.length,
      ai_request_id: ai.request_id,
    },
  });

  await publishDomainEvent({
    orgId,
    userId: user._id,
    eventType: "AutopilotRunPlanned",
    aggregateType: "autopilot_run",
    aggregateId: run._id.toString(),
    actionLinkId: `autopilot:${run._id.toString()}`.slice(0, 128),
    requestId,
    payload: {
      run_id: run._id.toString(),
      tool_calls: validatedToolCalls.length,
      dropped_tool_calls: droppedToolCalls.length,
      ai_request_id: ai.request_id,
    },
  }).catch(() => null);

  await recordFeatureUsage({
    orgId,
    userId: user._id,
    feature: "monthly_ai_calls",
    units: 1,
    tokensIn: ai.usage?.tokens_in,
    tokensOut: ai.usage?.tokens_out,
    costUsd: ai.usage?.cost_usd,
    modelName: Array.isArray(ai.usage?.models) ? ai.usage.models[0] : undefined,
    requestId,
    context: {
      endpoint: "autopilot/plan",
      run_id: run._id.toString(),
    },
    idempotencyKey: `autopilot_plan:${run._id.toString()}`.slice(0, 128),
  }).catch(() => null);

  res.status(201).json({
    ok: true,
    org_id: orgId.toString(),
    run: mapRun(run.toObject()),
    request_id: requestId,
  });
};

export const simulateAutopilotRun = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const orgId = requireOrgId(req);
  const actorRole = requireOrgRole(req);
  const { requestId } = req;
  const body = req.body as { run_id: string };

  const run = await AutopilotRunModel.findOne({ _id: body.run_id, orgId, userId: user._id });
  if (!run) {
    throw new HttpError(404, "NOT_FOUND", "Autopilot run not found");
  }

  const toolCalls = Array.isArray(run.toolCalls) ? (run.toolCalls as any[]) : [];
  const simulations: any[] = [];

  for (const raw of toolCalls) {
    const parsed = toolCallSchema.safeParse(raw);
    if (!parsed.success) {
      simulations.push({
        ok: false,
        tool_call_id: String((raw as any)?.id || ""),
        tool: String((raw as any)?.tool || ""),
        error: "tool_call_schema_invalid",
      });
      continue;
    }

    try {
      const sim = await simulateToolCall({
        orgId,
        userId: user._id,
        actorRole,
        toolCall: parsed.data,
        requestId,
      });
      simulations.push(sim);
    } catch (error: any) {
      simulations.push({
        ok: false,
        tool_call_id: parsed.data.id,
        tool: parsed.data.tool,
        error: String(error?.message || error),
      });
    }
  }

  run.simulations = simulations as any;

  const requiresApproval = toolCalls.some((call: any) => requiresExplicitApproval(call));
  run.status = requiresApproval ? "awaiting_approval" : "simulated";
  run.requestId = requestId;
  await run.save();

  await publishDomainEvent({
    orgId,
    userId: user._id,
    eventType: "AutopilotRunSimulated",
    aggregateType: "autopilot_run",
    aggregateId: run._id.toString(),
    actionLinkId: `autopilot:${run._id.toString()}`.slice(0, 128),
    requestId,
    payload: { run_id: run._id.toString(), simulations: simulations.length },
  }).catch(() => null);

  res.json({
    ok: true,
    org_id: orgId.toString(),
    run: mapRun(run.toObject()),
    request_id: requestId,
  });
};

export const approveAutopilotRun = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const orgId = requireOrgId(req);
  const { requestId } = req;
  const body = req.body as { run_id: string; approve_all?: boolean; tool_call_ids?: string[] };

  const run = await AutopilotRunModel.findOne({ _id: body.run_id, orgId, userId: user._id });
  if (!run) {
    throw new HttpError(404, "NOT_FOUND", "Autopilot run not found");
  }

  const toolCalls = Array.isArray(run.toolCalls) ? (run.toolCalls as any[]) : [];
  const approvals: Record<string, any> =
    run.approvals && typeof run.approvals === "object" && !Array.isArray(run.approvals) ? (run.approvals as any) : {};

  const approveAll = Boolean(body.approve_all);
  const ids = Array.isArray(body.tool_call_ids) ? body.tool_call_ids.map((id) => String(id)) : [];

  const approvedIds = new Set<string>();

  for (const call of toolCalls) {
    const id = String(call?.id || "");
    if (!id) continue;
    const shouldApprove = approveAll ? requiresExplicitApproval(call) : ids.includes(id);
    if (!shouldApprove) continue;
    approvals[id] = {
      approved: true,
      approved_at: new Date().toISOString(),
      approved_by_user_id: user._id.toString(),
    };
    approvedIds.add(id);
  }

  run.approvals = approvals as any;

  const missing = toolCalls
    .filter((call: any) => requiresExplicitApproval(call))
    .map((call: any) => String(call?.id || ""))
    .filter(Boolean)
    .filter((id) => !Boolean((approvals as any)?.[id]?.approved));

  run.status = missing.length === 0 ? "approved" : "awaiting_approval";
  run.requestId = requestId;
  await run.save();

  await recordAuditEvent({
    orgId,
    actorType: "user",
    actorUserId: user._id,
    action: "autopilot_run_approved",
    targetType: "autopilot_run",
    targetId: run._id.toString(),
    requestId,
    metadata: { approved: approvedIds.size, missing: missing.length },
  });

  res.json({
    ok: true,
    org_id: orgId.toString(),
    run: mapRun(run.toObject()),
    request_id: requestId,
  });
};

export const executeAutopilotRun = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const orgId = requireOrgId(req);
  const actorRole = requireOrgRole(req);
  const { requestId } = req;
  const body = req.body as { run_id: string };

  const run = await AutopilotRunModel.findOne({ _id: body.run_id, orgId, userId: user._id });
  if (!run) {
    throw new HttpError(404, "NOT_FOUND", "Autopilot run not found");
  }

  const toolCalls = Array.isArray(run.toolCalls) ? (run.toolCalls as any[]) : [];
  const approvals: Record<string, any> =
    run.approvals && typeof run.approvals === "object" && !Array.isArray(run.approvals) ? (run.approvals as any) : {};

  const missing = toolCalls
    .filter((call: any) => requiresExplicitApproval(call))
    .map((call: any) => String(call?.id || ""))
    .filter(Boolean)
    .filter((id) => !Boolean((approvals as any)?.[id]?.approved));

  if (missing.length > 0) {
    throw new HttpError(400, "APPROVAL_REQUIRED", "Autopilot run has unapproved tool calls", {
      missing_tool_call_ids: missing.slice(0, 50),
    });
  }

  const existingExecutions = Array.isArray(run.executions) ? (run.executions as any[]) : [];
  const executedToolCallIds = new Set(
    existingExecutions
      .map((row: any) => String(row?.tool_call_id || ""))
      .filter((value: string) => value.length > 0)
  );

  const toolCallsToExecute = toolCalls.filter((call: any) => {
    const id = String(call?.id || "");
    if (!id) return true;
    return !executedToolCallIds.has(id);
  });

  if (toolCallsToExecute.length === 0) {
    if (existingExecutions.length > 0 && run.status !== "succeeded") {
      run.status = "succeeded";
      run.error = undefined;
      run.requestId = requestId;
      await run.save();
    }

    res.json({
      ok: true,
      org_id: orgId.toString(),
      run: mapRun(run.toObject()),
      request_id: requestId,
    });
    return;
  }

  await enforceFeatureLimit({
    orgId,
    userId: user._id,
    feature: "autopilot_actions",
    units: toolCallsToExecute.length,
    requestId,
  });

  run.status = "executing";
  run.requestId = requestId;
  await run.save();

  const executions: any[] = [...existingExecutions];
  const executionByToolCallId = new Map<string, any>();
  for (const row of executions) {
    const id = String((row as any)?.tool_call_id || "");
    if (!id) continue;
    if (!executionByToolCallId.has(id)) {
      executionByToolCallId.set(id, row);
    }
  }

  try {
    for (const raw of toolCallsToExecute) {
      const parsed = toolCallSchema.safeParse(raw);
      if (!parsed.success) {
        throw new HttpError(400, "TOOL_CALL_INVALID", "Tool call schema invalid");
      }

      const toolCall = parsed.data;
      const idempotencyKey = `autopilot:${run._id.toString()}:${toolCall.id}`.slice(0, 128);

      const exec = await executeToolCall({
        orgId,
        userId: user._id,
        actorRole,
        toolCall,
        requestId,
        confirmed: true,
        idempotencyKey,
      });

      if (!exec.idempotent_replay) {
        const usageIdempotencyKey = `ap_action:${run._id.toString()}:${crypto
          .createHash("sha256")
          .update(toolCall.id)
          .digest("hex")
          .slice(0, 16)}`.slice(0, 128);

        await recordFeatureUsage({
          orgId,
          userId: user._id,
          feature: "autopilot_actions",
          units: 1,
          requestId,
          idempotencyKey: usageIdempotencyKey,
          context: {
            endpoint: "autopilot/execute",
            run_id: run._id.toString(),
            tool: toolCall.tool,
            tool_call_id: toolCall.id,
          },
        }).catch(() => null);
      }

      const entry = {
        tool_execution_id: exec.tool_execution_id,
        tool_call_id: exec.tool_call_id,
        tool: exec.tool,
        idempotency_key: exec.idempotency_key,
        idempotent_replay: exec.idempotent_replay,
        result: exec.result,
        executed_at: new Date().toISOString(),
      };

      if (!executionByToolCallId.has(entry.tool_call_id)) {
        executions.push(entry);
        executionByToolCallId.set(entry.tool_call_id, entry);
      }
    }

    run.executions = executions as any;
    run.status = "succeeded";
    run.error = undefined;
    await run.save();
  } catch (error: any) {
    run.executions = executions as any;
    run.status = "failed";
    run.error = String(error?.message || error);
    await run.save();
    throw error;
  }

  await recordAuditEvent({
    orgId,
    actorType: "user",
    actorUserId: user._id,
    action: "autopilot_run_executed",
    targetType: "autopilot_run",
    targetId: run._id.toString(),
    requestId,
    metadata: { executions: executions.length },
  });

  await publishDomainEvent({
    orgId,
    userId: user._id,
    eventType: "AutopilotRunExecuted",
    aggregateType: "autopilot_run",
    aggregateId: run._id.toString(),
    actionLinkId: `autopilot:${run._id.toString()}`.slice(0, 128),
    requestId,
    payload: { run_id: run._id.toString(), executions: executions.length },
  }).catch(() => null);

  res.json({
    ok: true,
    org_id: orgId.toString(),
    run: mapRun(run.toObject()),
    request_id: requestId,
  });
};

export const getAutopilotRun = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const orgId = requireOrgId(req);
  const runIdRaw = String((req as any).params?.id || "");
  if (!mongoose.Types.ObjectId.isValid(runIdRaw)) {
    throw new HttpError(400, "INVALID_RUN_ID", "Invalid run id");
  }

  const run = await AutopilotRunModel.findOne({ _id: new mongoose.Types.ObjectId(runIdRaw), orgId, userId: user._id }).lean();
  if (!run) {
    throw new HttpError(404, "NOT_FOUND", "Autopilot run not found");
  }

  res.json({
    ok: true,
    org_id: orgId.toString(),
    run: mapRun(run),
    request_id: req.requestId,
  });
};
