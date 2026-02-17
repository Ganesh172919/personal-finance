import crypto from "crypto";
import { Request, Response } from "express";
import mongoose from "mongoose";

import TaskModel, { TaskKind, TaskPriority, TaskStatus } from "../models/taskModel";
import AgentOutputModel from "../models/agentOutputModel";
import type { IUserDocument } from "../models/userModel";
import type { AiPlan } from "../schemas/aiPlanSchema";
import type { TaskEffectInput } from "../schemas/taskSchemas";
import { ActionOutcomeError, applyTaskEffects } from "../services/actionOutcomeService";
import { recordTaskEvent } from "../observability/metrics";

const BUCKETS: Array<{ key: keyof AiPlan["actions"]; bucket: 7 | 30 | 365; defaultDueDays: number }> = [
  { key: "next_7_days", bucket: 7, defaultDueDays: 7 },
  { key: "next_30_days", bucket: 30, defaultDueDays: 30 },
  { key: "next_12_months", bucket: 365, defaultDueDays: 365 }
];

const normalizeTitle = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();

const buildDeterministicTaskId = (params: { userId: string; bucket: number; title: string }) => {
  const hash = crypto
    .createHash("sha256")
    .update(`${params.userId}|${params.bucket}|${normalizeTitle(params.title)}`)
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

const toObjectId = (value?: string) => (value ? new mongoose.Types.ObjectId(value) : undefined);

export const getTaskById = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { id } = req.params as { id: string };

    const task = await TaskModel.findOne({ _id: id, userId: user._id }).lean();
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
      const agentOutput = await AgentOutputModel.findOne({ _id: agentOutputId, userId: user._id })
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
    console.error(`[requestId=${req.requestId}] Error fetching task:`, error);
    return res.status(500).json({ message: "Failed to fetch task", request_id: req.requestId });
  }
};

export const createTasksFromPlan = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
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

          const taskId = buildDeterministicTaskId({ userId: user._id.toString(), bucket, title });

          const dueDaysRaw = Number(item?.due_days);
          const dueDays = Number.isFinite(dueDaysRaw) && dueDaysRaw > 0 ? dueDaysRaw : defaultDueDays;

          return {
            _id: taskId,
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

    const ops = tasks.map(task => ({
      updateOne: {
        filter: { _id: task._id, userId: user._id },
        update: { $setOnInsert: task },
        upsert: true
      }
    }));

    const result = ops.length > 0 ? await TaskModel.bulkWrite(ops, { ordered: false }) : null;
    const created = result?.upsertedCount ?? 0;
    const ids = tasks.map(task => task._id);

    const stored = ids.length
      ? await TaskModel.find({ _id: { $in: ids }, userId: user._id }).sort({ dueDate: 1 }).lean()
      : [];

    if (created > 0) {
      recordTaskEvent({ event: "created", count: created });
    }

    res.status(201).json({ created, tasks: stored });
  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error creating tasks from plan:`, error);
    res.status(500).json({ message: "Failed to create tasks", request_id: req.requestId });
  }
};

export const listTasks = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { status, limit } = req.query as { status?: TaskStatus; limit?: number };

    const safeStatus: TaskStatus = status === "completed" || status === "dismissed" || status === "open" ? status : "open";
    const safeLimit = Number.isFinite(Number(limit)) ? Math.min(Math.max(1, Number(limit)), 100) : 50;

    const tasks = await TaskModel.find({ userId: user._id, status: safeStatus })
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(safeLimit)
      .lean();

    res.json({ tasks });
  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error listing tasks:`, error);
    res.status(500).json({ message: "Failed to fetch tasks", request_id: req.requestId });
  }
};

export const updateTask = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { id } = req.params as { id: string };
    const { status, completed_at, note, effects, completion_evidence, apply_status, apply_error_code } = req.body as {
      status: TaskStatus;
      completed_at?: Date;
      note?: string;
      effects?: TaskEffectInput[];
      completion_evidence?: { note?: string; completed_at?: Date };
      apply_status?: "pending" | "succeeded" | "failed";
      apply_error_code?: string;
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

    const task = await TaskModel.findOneAndUpdate({ _id: id, userId: user._id }, modifiers, { new: true }).lean();
    if (!task) {
      return res.status(404).json({ message: "Task not found", request_id: req.requestId });
    }

    recordTaskEvent({ event: "status_update" });

    res.json({ task });
  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error updating task:`, error);
    res.status(500).json({ message: "Failed to update task", request_id: req.requestId });
  }
};

export const applyTask = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { id } = req.params as { id: string };
    const { effects = [], completed_at, note, idempotency_key } = req.body as {
      effects?: TaskEffectInput[];
      completed_at?: Date;
      note?: string;
      idempotency_key?: string;
    };
    const idempotencyKey = String(idempotency_key || req.requestId || crypto.randomUUID());

    const result = await applyTaskEffects({
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
    if (error instanceof ActionOutcomeError) {
      recordTaskEvent({ event: "apply_failure" });
      return res.status(error.status).json({
        message: error.message,
        code: error.code,
        request_id: req.requestId,
      });
    }

    console.error(`[requestId=${req.requestId}] Error applying task effects:`, error);
    recordTaskEvent({ event: "apply_failure" });
    return res.status(500).json({ message: "Failed to apply task effects", request_id: req.requestId });
  }
};
