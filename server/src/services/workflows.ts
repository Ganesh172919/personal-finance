import crypto from "crypto";
import mongoose from "mongoose";

import TaskModel, { type TaskKind, type TaskPriority } from "../models/taskModel";
import ExportJobModel from "../models/exportJobModel";
import NotificationModel from "../models/notificationModel";
import UserModel from "../models/userModel";
import OrganizationModel from "../models/organizationModel";
import WorkflowModel, { type WorkflowAction } from "../models/workflowModel";
import WorkflowRunModel from "../models/workflowRunModel";
import { enforceFeatureLimit, recordFeatureUsage } from "./entitlements";
import { processExportJob } from "./exports";
import { sendEmail } from "../utils/sendEmail";
import { getEnv } from "../config/env";
import { HttpError } from "../middleware/httpError";
import { computeNextCronRunAt } from "./workflowCron";

const normalizeTitle = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();

const sha256Hex = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

const buildWorkflowTaskId = (params: {
  orgId: string;
  userId: string;
  workflowId: string;
  bucket: number;
  title: string;
}) => {
  const hash = sha256Hex(
    `workflow-task|${params.orgId}|${params.userId}|${params.workflowId}|${params.bucket}|${normalizeTitle(params.title)}`
  );
  return `wf_${hash.slice(0, 32)}`;
};

const dueDateFromDays = (days: number) => {
  const clamped = Math.max(1, Math.min(3650, Math.floor(days)));
  return new Date(Date.now() + clamped * 24 * 60 * 60 * 1000);
};

export const createWorkflow = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  enabled?: boolean;
  trigger: { type: "manual" | "cron" | "event"; cron?: string; event_type?: string };
  actions: WorkflowAction[];
}) => {
  const enabled = params.enabled ?? true;
  const trigger = params.trigger || { type: "manual" as const };

  let scheduleTimezone: string | undefined;
  let nextRunAt: Date | undefined;

  if (trigger.type === "cron") {
    const cron = String(trigger.cron || "").trim();
    if (!cron) {
      throw new HttpError(400, "CRON_REQUIRED", "Cron trigger requires a cron expression");
    }

    const org = await OrganizationModel.findById(params.orgId)
      .select({ timezone: 1 })
      .lean();
    scheduleTimezone = String((org as any)?.timezone || "UTC").trim() || "UTC";

    try {
      nextRunAt = enabled
        ? computeNextCronRunAt({ cron, timeZone: scheduleTimezone })
        : undefined;
    } catch (error: any) {
      throw new HttpError(400, "INVALID_CRON", "Invalid cron expression", {
        cron,
        error: String(error?.message || error),
      });
    }
  }

  const created = await WorkflowModel.create({
    orgId: params.orgId,
    createdByUserId: params.userId,
    name: params.name,
    enabled,
    trigger,
    scheduleTimezone,
    nextRunAt,
    actions: params.actions,
  });

  return created;
};

export const listWorkflows = async (params: { orgId: mongoose.Types.ObjectId }) => {
  return WorkflowModel.find({ orgId: params.orgId }).sort({ createdAt: -1 }).lean();
};

export const enqueueWorkflowRun = async (params: {
  orgId: mongoose.Types.ObjectId;
  workflowId: mongoose.Types.ObjectId;
  triggeredByUserId: mongoose.Types.ObjectId;
  requestId?: string;
  idempotencyKey?: string;
}) => {
  const env = getEnv();
  const idempotencyKey = params.idempotencyKey?.trim() ? params.idempotencyKey.trim() : undefined;

  const existing = idempotencyKey
    ? await WorkflowRunModel.findOne({ workflowId: params.workflowId, idempotencyKey }).lean()
    : null;

  if (!existing) {
    await enforceFeatureLimit({
      orgId: params.orgId,
      userId: params.triggeredByUserId,
      feature: "workflow_runs",
      units: 1,
      requestId: params.requestId,
    });
  }

  let createdRun = false;
  const run = existing
    ? existing
    : await WorkflowRunModel.create({
        orgId: params.orgId,
        workflowId: params.workflowId,
        triggeredByUserId: params.triggeredByUserId,
        status: "queued",
        idempotencyKey,
        requestId: params.requestId,
      }).then((doc) => {
        createdRun = true;
        return doc.toObject();
      });

  if (createdRun) {
    await recordFeatureUsage({
      orgId: params.orgId,
      userId: params.triggeredByUserId,
      feature: "workflow_runs",
      units: 1,
      requestId: params.requestId,
      context: {
        workflow_id: params.workflowId.toString(),
      },
    }).catch(() => null);
  }

  const runId = String((run as any)._id);

  if (env.ASYNC_JOBS_ENABLED) {
    const status = String((run as any)?.status || "queued");
    const terminal = status === "succeeded" || status === "failed";
    return { run, queued: !terminal };
  }

  const processed = await processWorkflowRun(runId);
  return { run: processed, queued: false };
};

export const processWorkflowRun = async (workflowRunId: string) => {
  const env = getEnv();
  if (!mongoose.Types.ObjectId.isValid(workflowRunId)) {
    throw new Error("Invalid workflowRunId");
  }

  const run = await WorkflowRunModel.findById(workflowRunId);
  if (!run) {
    throw new Error(`WorkflowRun not found: ${workflowRunId}`);
  }

  if (run.status === "succeeded" || run.status === "failed") {
    return run.toObject();
  }

  run.status = "running";
  run.startedAt = new Date();
  run.error = undefined;
  await run.save();

  try {
    const workflow = await WorkflowModel.findOne({ _id: run.workflowId, orgId: run.orgId }).lean();
    if (!workflow) {
      throw new Error("Workflow not found");
    }

    const actions = Array.isArray((workflow as any).actions) ? ((workflow as any).actions as WorkflowAction[]) : [];
    const createdTaskIds: string[] = [];
    const createdExportIds: string[] = [];
    const sentNotifications: Array<{ channel: string; to: string; mode: string }> = [];

    const ops = actions
      .filter((action) => action && typeof action === "object" && (action as any).type === "create_task")
      .map((action) => {
        const a = action as any;

        const bucket = a.bucket === 7 || a.bucket === 30 || a.bucket === 365 ? a.bucket : 30;
        const title = String(a.title || "Task").trim();
        const why = String(a.why || "Workflow task").trim();
        const steps = Array.isArray(a.steps) ? a.steps.map((s: unknown) => String(s)) : [];
        const priority: TaskPriority = a.priority === "low" || a.priority === "high" ? a.priority : "medium";
        const expectedImpact = String(a.expected_impact || "Improves execution.").trim();
        const kind: TaskKind =
          a.kind === "cashflow" ||
          a.kind === "budget" ||
          a.kind === "debt" ||
          a.kind === "invest" ||
          a.kind === "goal" ||
          a.kind === "education"
            ? a.kind
            : "generic";

        const dueDays = Number.isFinite(Number(a.due_days)) ? Number(a.due_days) : bucket;
        const dueDate = dueDateFromDays(dueDays);

        const id = buildWorkflowTaskId({
          orgId: run.orgId.toString(),
          userId: run.triggeredByUserId.toString(),
          workflowId: String(workflow._id),
          bucket,
          title,
        });
        createdTaskIds.push(id);

        return {
          updateOne: {
            filter: { _id: id, orgId: run.orgId, userId: run.triggeredByUserId },
            update: {
              $setOnInsert: {
                _id: id,
                orgId: run.orgId,
                userId: run.triggeredByUserId,
                source: { requestId: run.requestId },
                bucket,
                title,
                why,
                steps,
                priority,
                expected_impact: expectedImpact,
                kind,
                dueDate,
                status: "open",
              },
            },
            upsert: true,
          },
        };
      });

    if (ops.length > 0) {
      await TaskModel.bulkWrite(ops, { ordered: false });
    }

    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index] as any;
      if (!action || typeof action !== "object") continue;

      if (action.type === "send_notification") {
        const channel = String(action.channel || "email").trim().toLowerCase();
        const subject = String(action.subject || "").trim();
        const message = String(action.message || "").trim();
        if (!subject || !message) {
          throw new Error("send_notification requires subject and message");
        }

        if (channel === "in_app") {
          const notification = await NotificationModel.create({
            orgId: run.orgId,
            userId: run.triggeredByUserId,
            status: "unread",
            title: subject,
            message,
            metadata: {
              source: "workflow",
              workflow_id: run.workflowId ? run.workflowId.toString() : undefined,
              workflow_run_id: run._id.toString(),
              request_id: run.requestId,
            },
          });
          sentNotifications.push({ channel: "in_app", to: notification._id.toString(), mode: "db" });
          continue;
        }

        if (channel !== "email") {
          throw new Error(`Unsupported notification channel: ${channel}`);
        }

        const user = await UserModel.findById(run.triggeredByUserId)
          .select({ email: 1, name: 1, isEmailVerified: 1 })
          .lean();
        const email = user?.email ? String((user as any).email).trim() : "";
        if (!email) {
          throw new Error("Cannot send notification: user email missing");
        }

        const result = await sendEmail({ to: email, subject, text: message });
        sentNotifications.push({ channel: "email", to: email, mode: result.mode });
        continue;
      }

      if (action.type === "export_report") {
        await enforceFeatureLimit({
          orgId: run.orgId,
          userId: run.triggeredByUserId,
          feature: "export_access",
          requestId: run.requestId,
        });

        const exportType = String(action.export_type || "").trim();
        const params = action.params && typeof action.params === "object" && !Array.isArray(action.params) ? action.params : {};

        const idempotencyKey = `wf_run:${run._id.toString()}:export:${index}`.slice(0, 128);

        let exportJob = await ExportJobModel.create({
          orgId: run.orgId,
          createdByUserId: run.triggeredByUserId,
          type: exportType,
          status: "queued",
          params,
          requestId: run.requestId,
          idempotencyKey,
        }).catch(async (error: any) => {
          if (error?.code !== 11000) {
            throw error;
          }
          const existing = await ExportJobModel.findOne({ orgId: run.orgId, createdByUserId: run.triggeredByUserId, idempotencyKey });
          if (!existing) {
            throw error;
          }
          return existing;
        });

        const exportJobId = exportJob._id.toString();
        createdExportIds.push(exportJobId);

        if (!env.ASYNC_JOBS_ENABLED) {
          await processExportJob(exportJobId);
        }
      }
    }

    run.status = "succeeded";
    run.finishedAt = new Date();
    run.result = {
      tasks_created: createdTaskIds,
      exports_created: createdExportIds,
      notifications_sent: sentNotifications,
    };
    await run.save();

    return run.toObject();
  } catch (error: any) {
    run.status = "failed";
    run.finishedAt = new Date();
    run.error = String(error?.message || error);
    await run.save();
    throw error;
  }
};
