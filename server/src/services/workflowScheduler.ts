import mongoose from "mongoose";

import WorkflowModel from "../models/workflowModel";
import OrganizationModel from "../models/organizationModel";
import NotificationModel from "../models/notificationModel";
import { logger } from "../config/logger";
import { computeNextCronRunAt, normalizeTimeZone } from "./workflowCron";
import { enqueueWorkflowRun } from "./workflows";
import { publishDomainEvent } from "./domainEvents";
import { HttpError } from "../middleware/httpError";

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const truncateIdempotencyKey = (value: string) => value.slice(0, 128);

const buildCronRunIdempotencyKey = (workflowId: string, scheduledAt: Date) =>
  truncateIdempotencyKey(`cron:${workflowId}:${scheduledAt.toISOString()}`);

const createWorkflowNotification = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}) => {
  try {
    await NotificationModel.create({
      orgId: params.orgId,
      userId: params.userId,
      status: "unread",
      title: params.title,
      message: params.message,
      metadata: params.metadata || {},
    });
  } catch {
    // best-effort only
  }
};

export const backfillCronWorkflowScheduleFields = async (params: { now?: Date; limit?: number } = {}) => {
  const now = params.now ? new Date(params.now) : new Date();
  const limit = clampInt(params.limit, 50, 1, 500);

  const workflows = await WorkflowModel.find({
    enabled: true,
    "trigger.type": "cron",
    $or: [{ nextRunAt: { $exists: false } }, { scheduleTimezone: { $exists: false } }],
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select({
      _id: 1,
      orgId: 1,
      createdByUserId: 1,
      trigger: 1,
      scheduleTimezone: 1,
      nextRunAt: 1,
    })
    .lean();

  let updated = 0;

  for (const workflow of workflows as any[]) {
    const cron = String((workflow as any)?.trigger?.cron || "").trim();
    if (!cron) {
      await WorkflowModel.updateOne(
        { _id: workflow._id },
        { $set: { enabled: false, lastError: "Cron trigger missing expression" }, $unset: { nextRunAt: "" } }
      ).catch(() => null);
      continue;
    }

    const org = await OrganizationModel.findById((workflow as any).orgId)
      .select({ timezone: 1 })
      .lean();
    const scheduleTimezone = normalizeTimeZone((workflow as any).scheduleTimezone || (org as any)?.timezone);

    let nextRunAt: Date | undefined;
    try {
      nextRunAt = computeNextCronRunAt({ cron, timeZone: scheduleTimezone, from: now });
    } catch (error: any) {
      await WorkflowModel.updateOne(
        { _id: workflow._id },
        {
          $set: {
            enabled: false,
            lastError: `Invalid cron expression: ${String(error?.message || error).slice(0, 200)}`,
            scheduleTimezone,
          },
          $unset: { nextRunAt: "" },
        }
      ).catch(() => null);

      await createWorkflowNotification({
        orgId: (workflow as any).orgId,
        userId: (workflow as any).createdByUserId,
        title: "Workflow disabled (invalid schedule)",
        message: `Your workflow schedule is invalid and has been disabled. Cron: ${cron}`,
        metadata: { workflow_id: String(workflow._id), cron },
      });

      continue;
    }

    const result = await WorkflowModel.updateOne(
      { _id: workflow._id },
      {
        $set: {
          scheduleTimezone,
          nextRunAt,
        },
        $unset: { lastError: "" },
      }
    ).catch(() => null);

    if (result && (result as any).modifiedCount > 0) {
      updated += 1;
    }
  }

  return { ok: true as const, scanned: workflows.length, updated };
};

export const tickCronWorkflows = async (params: { now?: Date; limit?: number } = {}) => {
  const now = params.now ? new Date(params.now) : new Date();
  const limit = clampInt(params.limit, 50, 1, 500);

  const due = await WorkflowModel.find({
    enabled: true,
    "trigger.type": "cron",
    nextRunAt: { $lte: now },
  })
    .sort({ nextRunAt: 1 })
    .limit(limit)
    .select({
      _id: 1,
      orgId: 1,
      createdByUserId: 1,
      trigger: 1,
      scheduleTimezone: 1,
      nextRunAt: 1,
    })
    .lean();

  let triggered = 0;
  let errors = 0;

  for (const workflow of due as any[]) {
    const workflowId = String(workflow?._id || "");
    const cron = String(workflow?.trigger?.cron || "").trim();
    const scheduledAt = workflow?.nextRunAt ? new Date(workflow.nextRunAt) : null;
    if (!workflowId || !cron || !scheduledAt) {
      continue;
    }

    const scheduleTimezone = normalizeTimeZone(workflow?.scheduleTimezone);

    let nextRunAt: Date;
    try {
      nextRunAt = computeNextCronRunAt({ cron, timeZone: scheduleTimezone, from: scheduledAt });
    } catch (error: any) {
      errors += 1;

      await WorkflowModel.updateOne(
        { _id: workflow._id },
        {
          $set: {
            enabled: false,
            lastError: `Invalid cron expression: ${String(error?.message || error).slice(0, 200)}`,
            scheduleTimezone,
          },
          $unset: { nextRunAt: "" },
        }
      ).catch(() => null);

      await createWorkflowNotification({
        orgId: workflow.orgId,
        userId: workflow.createdByUserId,
        title: "Workflow disabled (invalid schedule)",
        message: `Your workflow schedule is invalid and has been disabled. Cron: ${cron}`,
        metadata: { workflow_id: workflowId, cron },
      });

      await publishDomainEvent({
        orgId: workflow.orgId,
        userId: workflow.createdByUserId,
        eventType: "WorkflowDisabled",
        aggregateType: "workflow",
        aggregateId: workflowId,
        payload: { reason: "invalid_cron", cron },
      }).catch(() => null);

      continue;
    }

    try {
      const idempotencyKey = buildCronRunIdempotencyKey(workflowId, scheduledAt);
      await enqueueWorkflowRun({
        orgId: workflow.orgId,
        workflowId: workflow._id,
        triggeredByUserId: workflow.createdByUserId,
        requestId: `scheduler:${scheduledAt.toISOString()}`.slice(0, 128),
        idempotencyKey,
      });

      await WorkflowModel.updateOne(
        { _id: workflow._id, nextRunAt: scheduledAt },
        {
          $set: {
            scheduleTimezone,
            lastRunAt: scheduledAt,
            nextRunAt,
          },
          $unset: { lastError: "" },
        }
      ).catch(() => null);

      triggered += 1;
    } catch (error: any) {
      errors += 1;

      const message = String(error?.message || error);
      logger.warn(
        {
          event: "workflow_scheduler_error",
          workflow_id: workflowId,
          org_id: workflow.orgId?.toString?.() || String(workflow.orgId),
          err: message,
        },
        "Cron workflow execution failed"
      );

      if (error instanceof HttpError && error.statusCode === 402) {
        await WorkflowModel.updateOne(
          { _id: workflow._id, nextRunAt: scheduledAt },
          {
            $set: {
              scheduleTimezone,
              lastError: `Skipped (quota): ${message}`.slice(0, 800),
              nextRunAt,
            },
          }
        ).catch(() => null);

        await createWorkflowNotification({
          orgId: workflow.orgId,
          userId: workflow.createdByUserId,
          title: "Workflow skipped (quota reached)",
          message: `A scheduled workflow was skipped because your plan quota was reached.`,
          metadata: { workflow_id: workflowId, code: error.code, feature: (error.details as any)?.feature },
        });
      }
    }
  }

  return { ok: true as const, scanned: due.length, triggered, errors };
};

export const startWorkflowScheduler = (params: { intervalMs?: number; label?: string } = {}) => {
  const intervalMs = clampInt(params.intervalMs, 15_000, 5_000, 60_000);
  const label = params.label || "workflow_scheduler";

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      await backfillCronWorkflowScheduleFields({ limit: 50 });
      await tickCronWorkflows({ limit: 50 });
    } catch (error) {
      logger.warn({ error, label }, "Workflow scheduler tick failed");
    }
  };

  void tick().catch(() => null);

  timer = setInterval(() => {
    void tick();
  }, intervalMs);
  timer.unref();

  logger.info({ event: "workflow_scheduler_started", interval_ms: intervalMs, label }, "Workflow scheduler started");

  return {
    started: true as const,
    stop: () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
};
