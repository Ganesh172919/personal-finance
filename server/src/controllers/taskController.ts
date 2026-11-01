/**
 * @fileoverview Task Controller
 *
 * Manages financial action tasks generated from AI plans. Tasks are grouped into
 * time-bucketed categories (7-day, 30-day, 12-month) and support lifecycle operations
 * including creation from AI plans, status updates, and effect application.
 *
 * Routes served:
 *   GET    /api/tasks/:id           - getTaskById
 *   POST   /api/tasks/from-plan     - createTasksFromPlan
 *   GET    /api/tasks               - listTasks
 *   PATCH  /api/tasks/:id           - updateTask
 *   POST   /api/tasks/:id/apply     - applyTask
 *
 * Key patterns:
 *   - Deterministic task IDs derived from org+user+bucket+title hash (prevents duplicates)
 *   - Tasks use $setOnInsert in bulkWrite to make creation idempotent
 *   - Task kind inferred from title/why text when not explicitly provided
 *   - applyTask delegates to actionOutcomeService for side-effect execution
 *   - Manual try/catch wrappers (not asyncRoute) for granular error responses
 *
 * @module controllers/taskController
 */

import crypto from "crypto";
import { Request, Response } from "express";
import mongoose from "mongoose";

import TaskModel, { TaskKind, TaskPriority, TaskRecurrenceCadence, TaskStatus } from "../models/taskModel";
import AgentOutputModel from "../models/agentOutputModel";
import OrganizationModel from "../models/organizationModel";
import type { IUserDocument } from "../models/userModel";
import type { AiPlan } from "../schemas/aiPlanSchema";
import type { TaskEffectInput } from "../schemas/taskSchemas";
import { ActionOutcomeError, applyTaskEffects } from "../services/actionOutcomeService";
import { recordTaskEvent } from "../observability/metrics";
import { HttpError } from "../middleware/httpError";
import { logger } from "../config/logger";

const BUCKETS: Array<{ key: keyof AiPlan["actions"]; bucket: 7 | 30 | 365; defaultDueDays: number }> = [
  { key: "next_7_days", bucket: 7, defaultDueDays: 7 },
  { key: "next_30_days", bucket: 30, defaultDueDays: 30 },
  { key: "next_12_months", bucket: 365, defaultDueDays: 365 }
];

const normalizeTitle = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();

// Deterministic ID ensures the same plan re-import does not create duplicate tasks
const buildDeterministicTaskId = (params: { orgId: string; userId: string; bucket: number; title: string }) => {
  const hash = crypto
    .createHash("sha256")
    .update(`${params.orgId}|${params.userId}|${params.bucket}|${normalizeTitle(params.title)}`)
    .digest("hex");
  return hash.slice(0, 32);
};

const allowedKinds: TaskKind[] = ["cashflow", "budget", "debt", "invest", "goal", "education", "generic"];

const inferKind = (item: any): TaskKind => {
  const explicit = typeof item?.kind === "string" ? item.kind.trim().toLowerCase() : "";
  if (allowedKinds.includes(explicit as TaskKind)) {
    return explicit as TaskKind;
  }

  const text = `${item?.title || ""} ${item?.why || ""}`.toLowerCase();
  if (text.includes("debt") || text.includes("loan") || text.includes("credit")) return "debt";
  if (text.includes("invest") || text.includes("sip") || text.includes("portfolio")) return "invest";
  if (text.includes("budget") || text.includes("spend")) return "budget";
  if (text.includes("goal")) return "goal";
  if (text.includes("learn") || text.includes("education")) return "education";
  if (text.includes("cash flow") || text.includes("emergency")) return "cashflow";
  return "generic";
};

const normalizePriority = (value: unknown): TaskPriority => {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "medium";
};

const dueDateFromDays = (days: number) => {
  const clamped = Math.max(1, Math.min(3650, Math.floor(days)));
  return new Date(Date.now() + clamped * 24 * 60 * 60 * 1000);
};

export const computeNextDueDate = (baseDate: Date, cadence: TaskRecurrenceCadence): Date => {
  const next = new Date(baseDate.getTime());
  switch (cadence) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "biweekly":
      next.setDate(next.getDate() + 14);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 3);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setDate(next.getDate() + 7);
  }
  return next;
};

export const scheduleNextRecurringTaskInstance = async (params: {
  currentTask: any;
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
}) => {
  const { currentTask, orgId, userId } = params;
  const cadence: TaskRecurrenceCadence = currentTask.recurrence?.cadence;
  if (!cadence || cadence === "none") return null;

  const nextGeneration = (Number(currentTask.recurrence?.generation) || 1) + 1;
  const currentDueDate = currentTask.dueDate ? new Date(currentTask.dueDate) : new Date();
  const nextDueDate = computeNextDueDate(currentDueDate, cadence);
  const parentTaskId = String(currentTask.recurrence?.parentTaskId || currentTask._id);

  const nextTaskId = crypto
    .createHash("sha256")
    .update(`${orgId.toString()}|${userId.toString()}|${currentTask.bucket}|${normalizeTitle(currentTask.title)}|rec:${nextGeneration}`)
    .digest("hex")
    .slice(0, 32);

  const nextTaskDoc = {
    _id: nextTaskId,
    orgId,
    userId,
    bucket: currentTask.bucket,
    title: currentTask.title,
    why: currentTask.why,
    steps: Array.isArray(currentTask.steps) ? currentTask.steps : [],
    priority: currentTask.priority,
    expected_impact: currentTask.expected_impact,
    kind: currentTask.kind,
    dueDate: nextDueDate,
    status: "open" as TaskStatus,
    recurrence: {
      cadence,
      parentTaskId,
      generation: nextGeneration,
      nextDueDate: computeNextDueDate(nextDueDate, cadence),
    },
  };

  const nextTask = await TaskModel.findOneAndUpdate(
    { _id: nextTaskId, orgId, userId },
    { $setOnInsert: nextTaskDoc },
    { upsert: true, new: true }
  ).lean();

  recordTaskEvent({ event: "created", count: 1 });
  return nextTask;
};

const toObjectId = (value?: string) => (value ? new mongoose.Types.ObjectId(value) : undefined);

const requireOrgId = (req: Request) => {
  const orgIdRaw = String((req as any).org?.orgId || "");
  if (!orgIdRaw || !mongoose.Types.ObjectId.isValid(orgIdRaw)) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(orgIdRaw);
};

export const getTaskById = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const { id } = req.params as { id: string };

    const task = await TaskModel.findOne({ _id: id, orgId, userId: user._id }).lean();
    if (!task) {
      return res.status(404).json({ message: "Task not found", request_id: req.requestId });
    }

    let agentOutputInfo: null | {
      id: string;
      request_id?: string;
      user_input_snippet: string;
      title?: string;
    } = null;

    const agentOutputId = (task as any)?.source?.agentOutputId;
    if (agentOutputId) {
      const agentOutput = await AgentOutputModel.findOne({ _id: agentOutputId, orgId, userId: user._id })
        .select({ request_id: 1, userInput: 1, outputData: 1 })
        .lean();

      if (agentOutput) {
        const userInput = String((agentOutput as any).userInput || "");
        const snippet = userInput.length > 160 ? `${userInput.slice(0, 160)}…` : userInput;
        const title = (agentOutput as any)?.outputData?.title;
        agentOutputInfo = {
          id: String((agentOutput as any)._id),
          request_id: (agentOutput as any).request_id ? String((agentOutput as any).request_id) : undefined,
          user_input_snippet: snippet,
          title: title ? String(title) : undefined,
        };
      }
    }

    return res.json({
      task,
      source: {
        agent_output: agentOutputInfo,
      },
      request_id: req.requestId,
    });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res
        .status(error.statusCode)
        .json({ message: error.message, code: error.code, request_id: req.requestId });
    }
    logger.error(`[requestId=${req.requestId}] Error fetching task:`, error);
    return res.status(500).json({ message: "Failed to fetch task", request_id: req.requestId });
  }
};

export const createTasksFromPlan = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const body = req.body as { source?: { agentOutputId?: string; chatMessageId?: string; requestId?: string }; plan: AiPlan };

    const source = body.source || {};
    const sourceDoc = {
      agentOutputId: toObjectId(source.agentOutputId),
      chatMessageId: toObjectId(source.chatMessageId),
      requestId: source.requestId ? String(source.requestId) : undefined
    };
    const actionLinkId = source.requestId ? String(source.requestId) : undefined;

    const tasks = BUCKETS.flatMap(({ key, bucket, defaultDueDays }) => {
      const items = (body.plan.actions?.[key] || []) as any[];
      if (!Array.isArray(items)) return [];

      return items
        .filter(item => item && typeof item === "object")
        .map(item => {
          const title = String(item.title || "").trim();
          const why = String(item.why || "").trim();
          if (!title || !why) {
            return null;
          }

          const taskId = buildDeterministicTaskId({ orgId: orgId.toString(), userId: user._id.toString(), bucket, title });

          const dueDaysRaw = Number(item?.due_days);
          const dueDays = Number.isFinite(dueDaysRaw) && dueDaysRaw > 0 ? dueDaysRaw : defaultDueDays;

          return {
            _id: taskId,
            orgId,
            userId: user._id,
            source: sourceDoc,
            bucket,
            title,
            why,
            steps: Array.isArray(item.steps) ? item.steps.map((step: any) => String(step)) : [],
            priority: normalizePriority(item.priority),
            expected_impact: String(item.expected_impact || ""),
            kind: inferKind(item),
            dueDate: dueDateFromDays(dueDays),
            status: "open" as TaskStatus,
            actionLinkId,
          };
        })
        .filter(Boolean) as Array<any>;
    });

    // $setOnInsert + upsert: inserts new tasks but skips existing ones (idempotent)
    const ops = tasks.map(task => ({
      updateOne: {
        filter: { _id: task._id, orgId, userId: user._id },
        update: { $setOnInsert: task },
        upsert: true
      }
    }));

    const result = ops.length > 0 ? await TaskModel.bulkWrite(ops, { ordered: false }) : null;
    const created = result?.upsertedCount ?? 0;
    const ids = tasks.map(task => task._id);

    const stored = ids.length
      ? await TaskModel.find({ _id: { $in: ids }, orgId, userId: user._id }).sort({ dueDate: 1 }).lean()
      : [];

    if (created > 0) {
      recordTaskEvent({ event: "created", count: created });
    }

    res.status(201).json({ created, tasks: stored });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res
        .status(error.statusCode)
        .json({ message: error.message, code: error.code, request_id: req.requestId });
    }
    logger.error(`[requestId=${req.requestId}] Error creating tasks from plan:`, error);
    res.status(500).json({ message: "Failed to create tasks", request_id: req.requestId });
  }
};

export const createTask = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const body = req.body as {
      title: string;
      why: string;
      steps?: string[];
      priority?: TaskPriority;
      expected_impact?: string;
      kind?: TaskKind;
      bucket?: 7 | 30 | 365;
      due_days?: number;
      dueDate?: Date | string;
      recurrence?: {
        cadence: TaskRecurrenceCadence;
        nextDueDate?: Date;
        parentTaskId?: string;
        generation?: number;
      };
    };

    const title = String(body.title || "").trim();
    const why = String(body.why || "").trim();
    if (!title || !why) {
      return res.status(400).json({ message: "Title and why are required", request_id: req.requestId });
    }

    const bucket = body.bucket === 7 || body.bucket === 30 || body.bucket === 365 ? body.bucket : 30;
    const taskId = buildDeterministicTaskId({ orgId: orgId.toString(), userId: user._id.toString(), bucket, title });

    const dueDays = Number.isFinite(Number(body.due_days)) && Number(body.due_days) > 0 ? Number(body.due_days) : bucket;
    const dueDate = body.dueDate ? new Date(body.dueDate) : dueDateFromDays(dueDays);

    const recurrence =
      body.recurrence?.cadence && body.recurrence.cadence !== "none"
        ? {
            cadence: body.recurrence.cadence as TaskRecurrenceCadence,
            generation: Number(body.recurrence.generation) || 1,
            parentTaskId: body.recurrence.parentTaskId ? String(body.recurrence.parentTaskId) : undefined,
            nextDueDate: computeNextDueDate(dueDate, body.recurrence.cadence as TaskRecurrenceCadence),
          }
        : undefined;

    const taskDoc: any = {
      _id: taskId,
      orgId,
      userId: user._id,
      bucket,
      title,
      why,
      steps: Array.isArray(body.steps) ? body.steps.map(s => String(s)) : [],
      priority: normalizePriority(body.priority),
      expected_impact: String(body.expected_impact || why),
      kind: inferKind(body),
      dueDate,
      status: "open" as TaskStatus,
      ...(recurrence ? { recurrence } : {}),
    };

    const task = await TaskModel.findOneAndUpdate(
      { _id: taskId, orgId, userId: user._id },
      { $setOnInsert: taskDoc },
      { upsert: true, new: true }
    ).lean();

    recordTaskEvent({ event: "created", count: 1 });
    return res.status(201).json({ task });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message, code: error.code, request_id: req.requestId });
    }
    logger.error(`[requestId=${req.requestId}] Error creating task:`, error);
    return res.status(500).json({ message: "Failed to create task", request_id: req.requestId });
  }
};

export const listTasks = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const { status, limit } = req.query as { status?: TaskStatus; limit?: number };

    const safeStatus: TaskStatus = status === "completed" || status === "dismissed" || status === "open" ? status : "open";
    const safeLimit = Number.isFinite(Number(limit)) ? Math.min(Math.max(1, Number(limit)), 100) : 50;

    const tasks = await TaskModel.find({ orgId, userId: user._id, status: safeStatus })
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(safeLimit)
      .lean();

    res.json({ tasks });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res
        .status(error.statusCode)
        .json({ message: error.message, code: error.code, request_id: req.requestId });
    }
    logger.error(`[requestId=${req.requestId}] Error listing tasks:`, error);
    res.status(500).json({ message: "Failed to fetch tasks", request_id: req.requestId });
  }
};

export const updateTask = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const { id } = req.params as { id: string };
    const {
      status,
      completed_at,
      note,
      effects,
      completion_evidence,
      apply_status,
      apply_error_code,
      recurrence,
    } = req.body as {
      status: TaskStatus;
      completed_at?: Date;
      note?: string;
      effects?: TaskEffectInput[];
      completion_evidence?: { note?: string; completed_at?: Date };
      apply_status?: "pending" | "succeeded" | "failed";
      apply_error_code?: string;
      recurrence?: {
        cadence: TaskRecurrenceCadence;
        nextDueDate?: Date;
        parentTaskId?: string;
        generation?: number;
      };
    };

    const safeStatus: TaskStatus =
      status === "completed" || status === "dismissed" || status === "open" ? status : "open";

    const update: Record<string, unknown> = { status: safeStatus };
    const modifiers: Record<string, any> = { $set: update };

    if (safeStatus === "completed") {
      const completedAt = completion_evidence?.completed_at
        ? new Date(completion_evidence.completed_at)
        : completed_at
          ? new Date(completed_at)
          : new Date();
      const evidenceNote = completion_evidence?.note ?? note;
      modifiers.$set.completedAt = completedAt;
      modifiers.$set.completionEvidence = {
        note: evidenceNote ? String(evidenceNote) : undefined,
        completedAt,
        effects: Array.isArray(effects) ? effects : [],
      };
    } else {
      modifiers.$unset = { completedAt: "", completionEvidence: "" };
    }

    if (apply_status) {
      modifiers.$set.applyStatus = apply_status;
    }
    if (apply_error_code !== undefined) {
      modifiers.$set.applyErrorCode = apply_error_code ? String(apply_error_code) : undefined;
    }
    if (recurrence) {
      modifiers.$set.recurrence = recurrence;
    }

    const task = await TaskModel.findOneAndUpdate({ _id: id, orgId, userId: user._id }, modifiers, { new: true }).lean();
    if (!task) {
      return res.status(404).json({ message: "Task not found", request_id: req.requestId });
    }

    recordTaskEvent({ event: "status_update" });

    let nextTask: any = null;
    if (safeStatus === "completed" && task.recurrence?.cadence && task.recurrence.cadence !== "none") {
      nextTask = await scheduleNextRecurringTaskInstance({
        currentTask: task,
        orgId,
        userId: user._id,
      });
    }

    res.json({ task, next_task: nextTask });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res
        .status(error.statusCode)
        .json({ message: error.message, code: error.code, request_id: req.requestId });
    }
    logger.error(`[requestId=${req.requestId}] Error updating task:`, error);
    res.status(500).json({ message: "Failed to update task", request_id: req.requestId });
  }
};

export const applyTask = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const { id } = req.params as { id: string };
    const { effects = [], completed_at, note, idempotency_key } = req.body as {
      effects?: TaskEffectInput[];
      completed_at?: Date;
      note?: string;
      idempotency_key?: string;
    };
    const idempotencyKey = String(idempotency_key || req.requestId || crypto.randomUUID());

    const result = await applyTaskEffects({
      orgId,
      userId: user._id,
      taskId: id,
      effects,
      idempotencyKey,
      completedAt: completed_at ? new Date(completed_at) : undefined,
      note: note ? String(note) : undefined,
      requestId: req.requestId,
    });
    recordTaskEvent({ event: "apply_success" });

    return res.json({
      task: result.task,
      applied_effects: result.applied_effects,
      links: result.links,
      provenance: result.provenance,
      idempotent_replay: result.idempotent_replay,
      request_id: req.requestId,
    });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res
        .status(error.statusCode)
        .json({ message: error.message, code: error.code, request_id: req.requestId });
    }
    if (error instanceof ActionOutcomeError) {
      recordTaskEvent({ event: "apply_failure" });
      return res.status(error.status).json({
        message: error.message,
        code: error.code,
        request_id: req.requestId,
      });
    }

    logger.error(`[requestId=${req.requestId}] Error applying task effects:`, error);
    recordTaskEvent({ event: "apply_failure" });
    return res.status(500).json({ message: "Failed to apply task effects", request_id: req.requestId });
  }
};

export const getTaskWebhookToken = async (req: Request, res: Response) => {
  try {
    const orgId = requireOrgId(req);
    let org = await OrganizationModel.findById(orgId);
    if (!org) {
      throw new HttpError(404, "ORG_NOT_FOUND", "Organization not found");
    }

    if (!org.taskWebhookToken) {
      org.taskWebhookToken = crypto.randomBytes(24).toString("hex");
      await org.save();
    }

    return res.json({
      webhook_token: org.taskWebhookToken,
      webhook_path: `/api/tasks/webhook/${org.taskWebhookToken}`,
      request_id: req.requestId,
    });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message, code: error.code, request_id: req.requestId });
    }
    logger.error(`[requestId=${req.requestId}] Error fetching task webhook token:`, error);
    return res.status(500).json({ message: "Failed to get task webhook token", request_id: req.requestId });
  }
};

export const handleInboundTaskWebhook = async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || "").trim();
    if (!token) {
      throw new HttpError(400, "INVALID_TOKEN", "Task webhook token required");
    }

    const org = await OrganizationModel.findOne({ taskWebhookToken: token });
    if (!org) {
      throw new HttpError(404, "ORGANIZATION_NOT_FOUND", "No organization found for this task webhook token");
    }

    const body = (req.body && typeof req.body === "object" ? req.body : {}) as any;
    const action = String(body.action || "create").toLowerCase();

    if (action === "complete") {
      const query: Record<string, unknown> = { orgId: org._id };
      if (body.taskId) {
        query._id = body.taskId;
      } else if (body.title) {
        query.title = body.title;
        query.status = "open";
      } else {
        throw new HttpError(400, "TASK_IDENTIFIER_REQUIRED", "taskId or title required to complete task via webhook");
      }

      const task = await TaskModel.findOne(query);
      if (!task) {
        return res.status(404).json({
          success: false,
          message: "Task not found to complete",
          request_id: req.requestId,
        });
      }

      task.status = "completed";
      task.completedAt = new Date();
      if (body.note) {
        task.completionEvidence = {
          note: String(body.note).trim(),
          completedAt: new Date(),
        };
      }
      await task.save();

      const nextTask = await scheduleNextRecurringTaskInstance({
        currentTask: task.toObject(),
        orgId: org._id,
        userId: task.userId,
      });

      recordTaskEvent({ event: "status_update", count: 1 });

      return res.json({
        success: true,
        action: "completed",
        task: task.toObject(),
        next_task: nextTask,
        request_id: req.requestId,
      });
    }

    // Default: "create" task
    const title = String(body.title || "External Webhook Action Item").trim();
    const why = String(body.why || "Automated task triggered from external webhook integration").trim();
    const steps = Array.isArray(body.steps) ? body.steps.map((s: unknown) => String(s)) : [];
    const priority = normalizePriority(body.priority);
    const kind = inferKind(body);
    const bucket = body.bucket === 7 || body.bucket === 365 ? body.bucket : 30;
    const dueDays = Number.isFinite(Number(body.due_days)) ? Number(body.due_days) : bucket;
    const dueDate = body.dueDate ? new Date(body.dueDate) : dueDateFromDays(dueDays);

    const taskId = crypto
      .createHash("sha256")
      .update(`${org._id.toString()}|${org.createdByUserId.toString()}|${bucket}|${normalizeTitle(title)}|${Date.now()}`)
      .digest("hex")
      .slice(0, 32);

    const taskDoc = await TaskModel.create({
      _id: taskId,
      orgId: org._id,
      userId: org.createdByUserId,
      bucket,
      title,
      why,
      steps,
      priority,
      expected_impact: String(body.expected_impact || "Task created via external webhook.").trim(),
      kind,
      dueDate,
      status: "open",
      recurrence: body.recurrence,
      source: { requestId: req.requestId },
    });

    recordTaskEvent({ event: "created", count: 1 });

    return res.status(201).json({
      success: true,
      action: "created",
      task: taskDoc.toObject(),
      request_id: req.requestId,
    });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message, code: error.code, request_id: req.requestId });
    }
    logger.error(`[requestId=${req.requestId}] Error in inbound task webhook:`, error);
    return res.status(500).json({ message: "Failed to process task webhook", request_id: req.requestId });
  }
};

export const dispatchTasksWebhook = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const { target, webhook_url, task_ids, headers: customHeaders } = req.body as {
      target: "generic" | "linear" | "todoist" | "jira" | "slack";
      webhook_url: string;
      task_ids: string[];
      headers?: Record<string, string>;
    };

    const tasks = await TaskModel.find({ _id: { $in: task_ids }, orgId }).lean();
    if (!tasks || tasks.length === 0) {
      throw new HttpError(404, "TASKS_NOT_FOUND", "No tasks found matching provided IDs");
    }

    let payload: unknown;
    if (target === "linear") {
      payload = {
        source: "FinWise",
        format: "linear",
        issues: tasks.map((t: any) => ({
          title: t.title,
          description: `${t.why}\n\n**Action Steps:**\n${(t.steps || []).map((s: string) => `- ${s}`).join("\n")}\n\n**Expected Impact:** ${t.expected_impact}`,
          priority: t.priority === "high" ? 1 : t.priority === "medium" ? 2 : 3,
          dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : undefined,
          tags: ["FinWise", t.kind],
        })),
      };
    } else if (target === "todoist") {
      payload = {
        source: "FinWise",
        format: "todoist",
        items: tasks.map((t: any) => ({
          content: t.title,
          description: `${t.why} | ${t.expected_impact}`,
          priority: t.priority === "high" ? 4 : t.priority === "medium" ? 3 : 1,
          due_date: t.dueDate ? new Date(t.dueDate).toISOString().split("T")[0] : undefined,
          labels: ["finwise", t.kind],
        })),
      };
    } else if (target === "jira") {
      payload = {
        source: "FinWise",
        format: "jira",
        issues: tasks.map((t: any) => ({
          summary: t.title,
          description: `${t.why}\n\nAction Steps:\n${(t.steps || []).join("\n")}`,
          priority: t.priority === "high" ? "High" : t.priority === "low" ? "Low" : "Medium",
          duedate: t.dueDate ? new Date(t.dueDate).toISOString().split("T")[0] : undefined,
          issuetype: "Task",
        })),
      };
    } else if (target === "slack") {
      payload = {
        text: `*FinWise Action Tasks Export (${tasks.length} items)*\n` +
          tasks.map((t: any) => `• *${t.title}* [${String(t.priority).toUpperCase()}] - Due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'N/A'}`).join("\n"),
      };
    } else {
      payload = {
        source: "FinWise",
        event: "tasks.export",
        dispatched_at: new Date().toISOString(),
        org_id: orgId.toString(),
        user_id: user._id.toString(),
        count: tasks.length,
        tasks,
      };
    }

    let deliveryStatus = "delivered";
    let httpCode = 200;
    let responseSnippet = "";

    try {
      const response = await fetch(webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "FinWise-Task-Dispatcher/1.0",
          ...(customHeaders || {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });

      httpCode = response.status;
      const resText = await response.text().catch(() => "");
      responseSnippet = resText.slice(0, 300);
      if (!response.ok) {
        deliveryStatus = "failed";
      }
    } catch (err: any) {
      deliveryStatus = "network_error";
      responseSnippet = String(err?.message || err);
    }

    return res.json({
      success: deliveryStatus === "delivered",
      delivery_status: deliveryStatus,
      http_code: httpCode,
      target,
      count: tasks.length,
      response_snippet: responseSnippet,
      dispatched_at: new Date(),
      request_id: req.requestId,
    });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message, code: error.code, request_id: req.requestId });
    }
    logger.error(`[requestId=${req.requestId}] Error dispatching tasks webhook:`, error);
    return res.status(500).json({ message: "Failed to dispatch tasks webhook", request_id: req.requestId });
  }
};
