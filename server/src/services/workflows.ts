import crypto from "crypto";
import mongoose from "mongoose";

import TaskModel, { type TaskKind, type TaskPriority } from "../models/taskModel";
import ExportJobModel from "../models/exportJobModel";
import NotificationModel from "../models/notificationModel";
import UserModel from "../models/userModel";
import OrganizationModel from "../models/organizationModel";
import WorkflowModel, {
  type WorkflowAction,
  type WorkflowActionCondition,
  type WorkflowTrigger,
} from "../models/workflowModel";
import WorkflowRunModel, { type IWorkflowRunSkippedAction } from "../models/workflowRunModel";
import { enforceFeatureLimit, recordFeatureUsage, reserveFeatureUsage } from "./entitlements";
import { processExportJob } from "./exports";
import { sendEmail } from "../utils/sendEmail";
import { getEnv } from "../config/env";
import { HttpError } from "../middleware/httpError";
import { computeNextCronRunAt } from "./workflowCron";

// Normalizes task titles by collapsing internal spaces and downcasing text.
// Strips leading and trailing whitespace to ensure uniform task comparison.
// Standardizes title strings for deterministic workflow task ID hashing.
const normalizeTitle = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();

// Generates a SHA-256 hexadecimal hash string from an arbitrary input value.
// Used for producing deterministic workflow task keys and idempotency tokens.
// Guarantees collision-resistant hashing across automation pipelines.
const sha256Hex = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

// Derives a deterministic task identifier from workflow and task attributes.
// Hashes organization, user, workflow, time bucket, and normalized title.
// Prevents duplicate task generation when workflows re-run within the same bucket.
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

// Calculates a future due date by adding a given number of days to the current timestamp.
// Clamps the day offset to a safe range between 1 day and 10 years.
// Produces a concrete Date instance for scheduled workflow task deadlines.
const dueDateFromDays = (days: number) => {
  const clamped = Math.max(1, Math.min(3650, Math.floor(days)));
  return new Date(Date.now() + clamped * 24 * 60 * 60 * 1000);
};

// Evaluates conditional branching expressions against dynamic workflow run contexts.
// Resolves nested dot-separated properties and checks relational comparison operators.
// Returns evaluation match status alongside descriptive mismatch failure reasons.
export const evaluateActionCondition = (
  condition: WorkflowActionCondition | undefined,
  context: Record<string, unknown>
): { matches: boolean; reason?: string } => {
  if (!condition || !condition.field) {
    return { matches: true };
  }

  const getNestedValue = (obj: any, path: string): unknown => {
    if (!obj || typeof obj !== "object") return undefined;
    const parts = path.split(".");
    let cur = obj;
    for (const p of parts) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[p];
    }
    return cur;
  };

  const actual = getNestedValue(context, condition.field);
  const expected = condition.value;

  let matches = false;
  switch (condition.operator) {
    case "eq":
      matches = String(actual) === String(expected) || actual === expected;
      break;
    case "neq":
      matches = String(actual) !== String(expected) && actual !== expected;
      break;
    case "gt":
      matches = Number(actual) > Number(expected);
      break;
    case "gte":
      matches = Number(actual) >= Number(expected);
      break;
    case "lt":
      matches = Number(actual) < Number(expected);
      break;
    case "lte":
      matches = Number(actual) <= Number(expected);
      break;
    case "contains":
      matches = String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
      break;
    default:
      matches = false;
  }

  return {
    matches,
    reason: matches
      ? undefined
      : `Condition not met: '${condition.field}' (${String(actual)}) ${condition.operator} ${String(expected)}`,
  };
};

// Replaces double-curly variable placeholders in text templates with context values.
// Supports nested object paths by splitting dot-separated identifier keys.
// Leaves non-templated text unaltered when placeholders are absent.
export const interpolateTemplate = (str: string, context: Record<string, unknown>): string => {
  if (!str || !str.includes("{{")) return str;
  return str.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, field) => {
    const parts = field.split(".");
    let cur: any = context;
    for (const p of parts) {
      if (cur == null || typeof cur !== "object") return "";
      cur = cur[p];
    }
    return cur != null ? String(cur) : "";
  });
};

// Registers a new automation workflow definition for a tenant organization.
// Configures triggers, calculates initial cron schedules, and stores action steps.
// Validates cron syntax and auto-generates secure tokens for webhook triggers.
export const createWorkflow = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  enabled?: boolean;
  trigger: WorkflowTrigger;
  actions: WorkflowAction[];
}) => {
  const enabled = params.enabled ?? true;
  const trigger = params.trigger ? { ...params.trigger } : ({ type: "manual" as const } as WorkflowTrigger);

  let scheduleTimezone: string | undefined;
  let nextRunAt: Date | undefined;

  if (trigger.type === "webhook") {
    if (!trigger.webhook_token || !trigger.webhook_token.trim()) {
      trigger.webhook_token = crypto.randomBytes(24).toString("hex");
    }
  }

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

// Queries all automation workflows registered under a tenant organization.
// Enforces strict multi-tenant data boundaries by filtering on organization ID.
// Returns workflow definitions ordered chronologically by newest creation date.
export const listWorkflows = async (params: { orgId: mongoose.Types.ObjectId }) => {
  return WorkflowModel.find({ orgId: params.orgId }).sort({ createdAt: -1 }).lean();
};

// Enqueues an execution run for an automation workflow with idempotency support.
// Reserves and commits feature usage quotas for metered workflow executions.
// Dispatches immediate synchronous execution or queues runs based on worker config.
export const enqueueWorkflowRun = async (params: {
  orgId: mongoose.Types.ObjectId;
  workflowId: mongoose.Types.ObjectId;
  triggeredByUserId: mongoose.Types.ObjectId;
  requestId?: string;
  idempotencyKey?: string;
  triggerContext?: Record<string, unknown>;
}) => {
  const env = getEnv();
  const idempotencyKey = params.idempotencyKey?.trim() ? params.idempotencyKey.trim() : undefined;

  const existing = idempotencyKey
    ? await WorkflowRunModel.findOne({ workflowId: params.workflowId, idempotencyKey }).lean()
    : null;

  // Atomic reservation: committed below once the run row exists, released otherwise.
  const reservation = !existing
    ? await reserveFeatureUsage({
        orgId: params.orgId,
        userId: params.triggeredByUserId,
        feature: "workflow_runs",
        units: 1,
        requestId: params.requestId,
      })
    : undefined;

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
        triggerContext: params.triggerContext || {},
      })
        .then((doc) => {
          createdRun = true;
          return doc.toObject();
        })
        .catch(async (error: any) => {
          if (error?.code !== 11000 || !idempotencyKey) {
            await reservation?.release();
            throw error;
          }

          const duplicate = await WorkflowRunModel.findOne({
            workflowId: params.workflowId,
            idempotencyKey,
          }).lean();

          if (!duplicate) {
            await reservation?.release();
            throw error;
          }

          return duplicate;
        });

  if (createdRun) {
    await recordFeatureUsage({
      orgId: params.orgId,
      userId: params.triggeredByUserId,
      feature: "workflow_runs",
      units: 1,
      requestId: params.requestId,
      reservation,
      context: {
        workflow_id: params.workflowId.toString(),
      },
    }).catch(() => null);
  }
  // Deduplicated (existing run) or failed record: give the unit back. No-op once committed.
  await reservation?.release();

  const runId = String((run as any)._id);

  if (env.ASYNC_JOBS_ENABLED) {
    const status = String((run as any)?.status || "queued");
    const terminal = status === "succeeded" || status === "failed";
    return { run, queued: !terminal };
  }

  const processed = await processWorkflowRun(runId);
  return { run: processed, queued: false };
};

// Executes the sequence of configured action steps for an active workflow run.
// Evaluates branching conditions, generates tasks, delivers notifications, and exports reports.
// Records action execution telemetry and marks run status as succeeded or failed.
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

    const context = (run.triggerContext && typeof run.triggerContext === "object" ? run.triggerContext : {}) as Record<string, unknown>;
    const actions = Array.isArray((workflow as any).actions) ? ((workflow as any).actions as WorkflowAction[]) : [];
    const createdTaskIds: string[] = [];
    const createdExportIds: string[] = [];
    const sentNotifications: Array<{ channel: string; to: string; mode: string }> = [];
    const actionsSkipped: IWorkflowRunSkippedAction[] = [];
    const delaysExecuted: Array<{ index: number; duration_seconds: number; description?: string }> = [];

    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index] as any;
      if (!action || typeof action !== "object") continue;

      // Evaluate conditional branching rule if present
      if (action.condition) {
        const evalResult = evaluateActionCondition(action.condition, context);
        if (!evalResult.matches) {
          actionsSkipped.push({
            index,
            action_type: action.type,
            reason: evalResult.reason || "Branch condition not met",
          });
          continue;
        }
      }

      if (action.type === "create_task") {
        const bucket = action.bucket === 7 || action.bucket === 30 || action.bucket === 365 ? action.bucket : 30;
        const title = interpolateTemplate(String(action.title || "Task").trim(), context);
        const why = interpolateTemplate(String(action.why || "Workflow task").trim(), context);
        const steps = Array.isArray(action.steps)
          ? action.steps.map((s: unknown) => interpolateTemplate(String(s), context))
          : [];
        const priority: TaskPriority = action.priority === "low" || action.priority === "high" ? action.priority : "medium";
        const expectedImpact = interpolateTemplate(String(action.expected_impact || "Improves execution.").trim(), context);
        const kind: TaskKind =
          action.kind === "cashflow" ||
          action.kind === "budget" ||
          action.kind === "debt" ||
          action.kind === "invest" ||
          action.kind === "goal" ||
          action.kind === "education"
            ? action.kind
            : "generic";

        const dueDays = Number.isFinite(Number(action.due_days)) ? Number(action.due_days) : bucket;
        const dueDate = dueDateFromDays(dueDays);

        const id = buildWorkflowTaskId({
          orgId: run.orgId.toString(),
          userId: run.triggeredByUserId.toString(),
          workflowId: String(workflow._id),
          bucket,
          title,
        });
        createdTaskIds.push(id);

        await TaskModel.updateOne(
          { _id: id, orgId: run.orgId, userId: run.triggeredByUserId },
          {
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
              status: "open" as const,
            },
          },
          { upsert: true }
        );
        continue;
      }

      if (action.type === "send_notification") {
        const channel = String(action.channel || "email").trim().toLowerCase();
        const subject = interpolateTemplate(String(action.subject || "").trim(), context);
        const message = interpolateTemplate(String(action.message || "").trim(), context);
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
        continue;
      }

      if (action.type === "delay") {
        const duration = Math.max(1, Number(action.duration_seconds) || 1);
        const desc = action.description ? interpolateTemplate(String(action.description), context) : undefined;
        delaysExecuted.push({
          index,
          duration_seconds: duration,
          description: desc,
        });
        continue;
      }
    }

    run.status = "succeeded";
    run.finishedAt = new Date();
    run.result = {
      tasks_created: createdTaskIds,
      exports_created: createdExportIds,
      notifications_sent: sentNotifications,
      actions_skipped: actionsSkipped,
      delays_executed: delaysExecuted,
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

// Ingests an external webhook event and dispatches its matched automation workflow.
// Validates incoming webhook secret tokens against active workflow trigger configs.
// Enqueues a new workflow execution run passing the incoming JSON payload as context.
export const triggerWebhookWorkflow = async (params: {
  token: string;
  payload: Record<string, unknown>;
  requestId?: string;
}) => {
  const workflow = await WorkflowModel.findOne({
    "trigger.type": "webhook",
    "trigger.webhook_token": params.token,
  });

  if (!workflow) {
    throw new HttpError(404, "WORKFLOW_NOT_FOUND", "No workflow found for this webhook token");
  }

  if (!workflow.enabled) {
    throw new HttpError(400, "WORKFLOW_DISABLED", "Workflow is currently disabled");
  }

  const runResult = await enqueueWorkflowRun({
    orgId: workflow.orgId,
    workflowId: workflow._id,
    triggeredByUserId: workflow.createdByUserId,
    requestId: params.requestId,
    triggerContext: params.payload,
  });

  return {
    workflow_id: workflow._id.toString(),
    workflow_name: workflow.name,
    queued: runResult.queued,
    run: runResult.run,
  };
};
