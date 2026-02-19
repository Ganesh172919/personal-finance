import crypto from "crypto";
import mongoose from "mongoose";

import ExportJobModel from "../../models/exportJobModel";
import TransactionModel, { type TransactionType } from "../../models/transactionModel";
import UserModel from "../../models/userModel";
import WorkflowModel from "../../models/workflowModel";
import { HttpError } from "../../middleware/httpError";
import { recordAuditEvent } from "../auditLog";
import { publishDomainEvent } from "../domainEvents";
import { enforceFeatureLimit, getResolvedEntitlements, recordFeatureUsage } from "../entitlements";
import { processExportJob } from "../exports";
import { bumpTransactionMetadata, ensureProfileWithMigration, setProfileMutationSource } from "../profileService";
import { createWorkflow, enqueueWorkflowRun } from "../workflows";
import { sendEmail } from "../../utils/sendEmail";
import { QUEUE_NAMES, getQueue } from "../../worker/queues";
import { getToolCatalogEntry } from "../toolCatalog";
import type { ToolHandler } from "./types";

const normalizeTransactionAmount = (amount: number, type: TransactionType) => {
  const absoluteAmount = Math.abs(Number(amount));
  return type === "income" ? absoluteAmount : -absoluteAmount;
};

const requireCatalogEntry = (tool: string) => {
  const entry = getToolCatalogEntry(tool);
  if (!entry) {
    throw new Error(`Missing tool catalog entry: ${tool}`);
  }
  return entry;
};

export const builtinToolHandlers: ToolHandler[] = [
  {
    tool: "workflows.create",
    requiredRole: "admin",
    catalog: requireCatalogEntry("workflows.create"),
    simulate: async (ctx) => {
      const args = ctx.toolCall.args as any;
      const trigger = args?.trigger || {};
      return {
        operation: "create_workflow",
        name: args?.name,
        enabled: args?.enabled ?? true,
        trigger,
        actions_count: Array.isArray(args?.actions) ? args.actions.length : 0,
      };
    },
    execute: async (ctx) => {
      const args: any = ctx.toolCall.args;

      const workflow = await createWorkflow({
        orgId: ctx.orgId,
        userId: ctx.userId,
        name: String(args.name),
        enabled: args.enabled === undefined ? true : Boolean(args.enabled),
        trigger: args.trigger,
        actions: Array.isArray(args.actions) ? args.actions : [],
      });

      await recordAuditEvent({
        orgId: ctx.orgId,
        actorType: "user",
        actorUserId: ctx.userId,
        action: "workflow_created",
        targetType: "workflow",
        targetId: workflow._id.toString(),
        requestId: ctx.requestId,
        metadata: {
          tool_call_id: ctx.toolCall.id,
          trigger_type: String((workflow as any)?.trigger?.type || ""),
        },
      });

      await publishDomainEvent({
        orgId: ctx.orgId,
        userId: ctx.userId,
        eventType: "WorkflowCreated",
        aggregateType: "workflow",
        aggregateId: workflow._id.toString(),
        actionLinkId: ctx.source.action_link_id,
        requestId: ctx.requestId,
        payload: {
          tool_call_id: ctx.toolCall.id,
          name: workflow.name,
          trigger: (workflow as any).trigger,
        },
      }).catch(() => null);

      return {
        workflow: {
          id: workflow._id.toString(),
          name: workflow.name,
          enabled: workflow.enabled,
          trigger: (workflow as any).trigger,
          actions: (workflow as any).actions,
        },
      };
    },
  },
  {
    tool: "workflows.enable",
    requiredRole: "admin",
    catalog: requireCatalogEntry("workflows.enable"),
    simulate: async (ctx) => {
      const args = ctx.toolCall.args as any;
      const workflow = await WorkflowModel.findOne({ _id: args.workflow_id, orgId: ctx.orgId })
        .select({ _id: 1, enabled: 1, trigger: 1, name: 1 })
        .lean();

      return {
        operation: "set_workflow_enabled",
        workflow_id: args.workflow_id,
        workflow_name: workflow ? String((workflow as any).name) : undefined,
        current_enabled: workflow ? Boolean((workflow as any).enabled) : undefined,
        next_enabled: Boolean(args.enabled),
        trigger: workflow ? (workflow as any).trigger : undefined,
      };
    },
    execute: async (ctx) => {
      const args: any = ctx.toolCall.args;

      const workflow = await WorkflowModel.findOneAndUpdate(
        { _id: args.workflow_id, orgId: ctx.orgId },
        { $set: { enabled: Boolean(args.enabled) } },
        { new: true }
      );
      if (!workflow) {
        throw new HttpError(404, "WORKFLOW_NOT_FOUND", "Workflow not found");
      }

      if (
        workflow.enabled &&
        (workflow as any)?.trigger?.type === "cron" &&
        String((workflow as any)?.trigger?.cron || "").trim()
      ) {
        try {
          const queue = getQueue(QUEUE_NAMES.workflowEval);
          await queue.add(
            "workflow-cron",
            { workflowId: workflow._id.toString() },
            {
              jobId: `wf_cron:${workflow._id.toString()}`,
              repeat: { pattern: String((workflow as any).trigger.cron).trim() },
              removeOnComplete: true,
              removeOnFail: false,
            }
          );
        } catch {
          // best-effort
        }
      }

      await recordAuditEvent({
        orgId: ctx.orgId,
        actorType: "user",
        actorUserId: ctx.userId,
        action: "workflow_enabled_set",
        targetType: "workflow",
        targetId: workflow._id.toString(),
        requestId: ctx.requestId,
        metadata: {
          tool_call_id: ctx.toolCall.id,
          enabled: workflow.enabled,
        },
      });

      return {
        workflow: {
          id: workflow._id.toString(),
          enabled: workflow.enabled,
          name: (workflow as any).name,
          trigger: (workflow as any).trigger,
        },
      };
    },
  },
  {
    tool: "workflows.run",
    requiredRole: "admin",
    catalog: requireCatalogEntry("workflows.run"),
    simulate: async (ctx) => {
      const args = ctx.toolCall.args as any;
      return {
        operation: "run_workflow",
        workflow_id: args.workflow_id,
        idempotency_key: args.idempotency_key,
      };
    },
    execute: async (ctx) => {
      const args: any = ctx.toolCall.args;

      const workflowIdRaw = String(args.workflow_id || "");
      if (!mongoose.Types.ObjectId.isValid(workflowIdRaw)) {
        throw new HttpError(400, "INVALID_WORKFLOW_ID", "Invalid workflow id");
      }

      const idempotencyKey =
        typeof args.idempotency_key === "string" && args.idempotency_key.trim()
          ? String(args.idempotency_key).trim().slice(0, 128)
          : `tool:${ctx.toolCall.id}`.slice(0, 128);

      const result = await enqueueWorkflowRun({
        orgId: ctx.orgId,
        workflowId: new mongoose.Types.ObjectId(workflowIdRaw),
        triggeredByUserId: ctx.userId,
        requestId: ctx.requestId,
        idempotencyKey,
      });

      await recordAuditEvent({
        orgId: ctx.orgId,
        actorType: "user",
        actorUserId: ctx.userId,
        action: "workflow_run_enqueued",
        targetType: "workflow",
        targetId: workflowIdRaw,
        requestId: ctx.requestId,
        metadata: {
          tool_call_id: ctx.toolCall.id,
          workflow_run_id: String((result.run as any)._id),
          queued: result.queued,
        },
      });

      return {
        queued: result.queued,
        run: {
          id: String((result.run as any)._id),
          status: (result.run as any).status,
          started_at: (result.run as any).startedAt,
          finished_at: (result.run as any).finishedAt,
          result: (result.run as any).result,
          error: (result.run as any).error,
        },
      };
    },
  },
  {
    tool: "exports.create",
    requiredRole: "member",
    catalog: requireCatalogEntry("exports.create"),
    simulate: async (ctx) => {
      const args = ctx.toolCall.args as any;
      let eligible: boolean | undefined = undefined;
      let plan: string | undefined = undefined;
      try {
        const resolved = await getResolvedEntitlements({ orgId: ctx.orgId, userId: ctx.userId });
        eligible = Boolean(resolved.remaining.export_access);
        plan = String(resolved.entitlement.plan || "free");
      } catch {
        eligible = undefined;
        plan = undefined;
      }
      return {
        operation: "create_export",
        type: args.type,
        params: args.params || {},
        eligible,
        plan,
      };
    },
    execute: async (ctx) => {
      const args: any = ctx.toolCall.args;

      await enforceFeatureLimit({
        orgId: ctx.orgId,
        userId: ctx.userId,
        feature: "export_access",
        requestId: ctx.requestId,
      });

      const idempotencyKeyInner =
        typeof args.idempotency_key === "string" && args.idempotency_key.trim().length > 0
          ? String(args.idempotency_key).trim().slice(0, 128)
          : `tool:${ctx.toolCall.id}`.slice(0, 128);

      const existingJob = await ExportJobModel.findOne({
        orgId: ctx.orgId,
        createdByUserId: ctx.userId,
        idempotencyKey: idempotencyKeyInner,
      }).lean();
      if (existingJob) {
        return {
          export: {
            id: String((existingJob as any)._id),
            type: String((existingJob as any).type),
            status: String((existingJob as any).status),
          },
          queued: false,
          idempotent_export: true,
        };
      }

      const createdJob = await ExportJobModel.create({
        orgId: ctx.orgId,
        createdByUserId: ctx.userId,
        type: args.type,
        status: "queued",
        params: args.params && typeof args.params === "object" && !Array.isArray(args.params) ? args.params : {},
        requestId: ctx.requestId,
        idempotencyKey: idempotencyKeyInner,
      });

      await recordAuditEvent({
        orgId: ctx.orgId,
        actorType: "user",
        actorUserId: ctx.userId,
        action: "export_created",
        targetType: "export_job",
        targetId: createdJob._id.toString(),
        requestId: ctx.requestId,
        metadata: { tool_call_id: ctx.toolCall.id, export_type: String(args.type) },
      });

      await recordFeatureUsage({
        orgId: ctx.orgId,
        userId: ctx.userId,
        feature: "export_access",
        units: 1,
        requestId: ctx.requestId,
        idempotencyKey: `export:${createdJob._id.toString()}`,
        context: { export_type: String(args.type), tool_call_id: ctx.toolCall.id },
      }).catch(() => null);

      const exportJobId = createdJob._id.toString();

      try {
        const queue = getQueue(QUEUE_NAMES.exports);
        await queue.add(
          "export-job",
          { exportJobId },
          {
            jobId: exportJobId,
            removeOnComplete: true,
            removeOnFail: false,
          }
        );
        return { export_job_id: exportJobId, queued: true };
      } catch {
        const processed = await processExportJob(exportJobId);
        return { export_job_id: exportJobId, queued: false, status: (processed as any).status };
      }
    },
  },
  {
    tool: "transactions.create",
    requiredRole: "member",
    catalog: requireCatalogEntry("transactions.create"),
    simulate: async (ctx) => {
      const args = ctx.toolCall.args as any;
      const txType = String(args.tx_type) as TransactionType;
      const signedAmount = normalizeTransactionAmount(Number(args.amount || 0), txType);
      return {
        operation: "create_transaction",
        tx_type: txType,
        amount: signedAmount,
        category: args.category,
        description: args.description,
        date: args.date,
      };
    },
    execute: async (ctx) => {
      const args: any = ctx.toolCall.args;
      const profile = await ensureProfileWithMigration({ orgId: ctx.orgId, userId: ctx.userId });

      const txType = String(args.tx_type || "expense") as TransactionType;
      const created = await TransactionModel.create({
        orgId: ctx.orgId,
        userId: ctx.userId,
        amount: normalizeTransactionAmount(Number(args.amount || 0), txType),
        category: String(args.category),
        description: String(args.description).slice(0, 250),
        type: txType,
        date: args.date ? new Date(String(args.date)) : new Date(),
        source: ctx.source,
      });

      bumpTransactionMetadata(profile, { deltaCount: 1 });
      setProfileMutationSource(profile, ctx.source);
      await profile.save();

      await publishDomainEvent({
        orgId: ctx.orgId,
        userId: ctx.userId,
        eventType: "TransactionCreated",
        aggregateType: "transaction",
        aggregateId: created._id.toString(),
        actionLinkId: ctx.source.action_link_id,
        requestId: ctx.requestId,
        payload: {
          source: ctx.source,
          transaction_type: created.type,
          category: created.category,
          amount: created.amount,
          tool_call_id: ctx.toolCall.id,
        },
      }).catch(() => null);

      await recordAuditEvent({
        orgId: ctx.orgId,
        actorType: "user",
        actorUserId: ctx.userId,
        action: "transaction_created",
        targetType: "transaction",
        targetId: created._id.toString(),
        requestId: ctx.requestId,
        metadata: { tool_call_id: ctx.toolCall.id, category: created.category, type: created.type },
      });

      return {
        transaction: {
          id: created._id.toString(),
          amount: created.amount,
          category: created.category,
          description: created.description,
          date: created.date,
          type: created.type,
          source: ctx.source,
        },
      };
    },
  },
  {
    tool: "goals.createOrUpdate",
    requiredRole: "member",
    catalog: requireCatalogEntry("goals.createOrUpdate"),
    simulate: async (ctx) => {
      const args = ctx.toolCall.args as any;
      const profile = await ensureProfileWithMigration({ orgId: ctx.orgId, userId: ctx.userId });
      const goals = Array.isArray((profile as any).goals) ? ((profile as any).goals as any[]) : [];
      const found =
        args.goal_id
          ? goals.find((g) => String(g?._id) === String(args.goal_id))
          : goals.find((g) => String(g?.name) === String(args.name));

      return {
        operation: "upsert_goal",
        mode: found ? "update" : "create",
        goal_id: found?._id ? String(found._id) : args.goal_id,
        name: args.name,
        target: args.target,
        current: args.current,
        deadline: args.deadline,
        priority: args.priority,
      };
    },
    execute: async (ctx) => {
      const args: any = ctx.toolCall.args;
      const profile = await ensureProfileWithMigration({ orgId: ctx.orgId, userId: ctx.userId });

      const goals = Array.isArray((profile as any).goals) ? ((profile as any).goals as any[]) : [];
      const goalIdRaw = typeof args.goal_id === "string" ? args.goal_id.trim() : "";
      const existingGoal = goalIdRaw
        ? goals.find((g) => String(g?._id) === goalIdRaw)
        : goals.find((g) => String(g?.name) === String(args.name));

      if (existingGoal) {
        existingGoal.name = String(args.name);
        existingGoal.target = Number(args.target);
        if (args.current !== undefined) {
          existingGoal.current = Number(args.current);
        }
        existingGoal.deadline = String(args.deadline);
        if (args.priority !== undefined) {
          existingGoal.priority = Number(args.priority);
        }
      } else {
        goals.push({
          _id: new mongoose.Types.ObjectId(),
          name: String(args.name),
          target: Number(args.target),
          current: args.current === undefined ? 0 : Number(args.current),
          deadline: String(args.deadline),
          priority: args.priority === undefined ? 1 : Number(args.priority),
        });
        (profile as any).goals = goals;
      }

      setProfileMutationSource(profile, ctx.source);
      await profile.save();

      const saved = Array.isArray((profile as any).goals) ? ((profile as any).goals as any[]) : [];
      const resolved = goalIdRaw
        ? saved.find((g) => String(g?._id) === goalIdRaw)
        : saved.find((g) => String(g?.name) === String(args.name));

      await publishDomainEvent({
        orgId: ctx.orgId,
        userId: ctx.userId,
        eventType: "GoalUpserted",
        aggregateType: "financial_profile",
        aggregateId: profile._id.toString(),
        actionLinkId: ctx.source.action_link_id,
        requestId: ctx.requestId,
        payload: { goal_id: resolved?._id ? String(resolved._id) : undefined, tool_call_id: ctx.toolCall.id },
      }).catch(() => null);

      await recordAuditEvent({
        orgId: ctx.orgId,
        actorType: "user",
        actorUserId: ctx.userId,
        action: "goal_upserted",
        targetType: "financial_profile",
        targetId: profile._id.toString(),
        requestId: ctx.requestId,
        metadata: { tool_call_id: ctx.toolCall.id, goal_name: String(args.name) },
      });

      return {
        goal: resolved
          ? {
              id: String(resolved._id),
              name: resolved.name,
              target: resolved.target,
              current: resolved.current,
              deadline: resolved.deadline,
              priority: resolved.priority,
            }
          : null,
      };
    },
  },
  {
    tool: "debts.createOrUpdate",
    requiredRole: "member",
    catalog: requireCatalogEntry("debts.createOrUpdate"),
    simulate: async (ctx) => {
      const args = ctx.toolCall.args as any;
      const profile = await ensureProfileWithMigration({ orgId: ctx.orgId, userId: ctx.userId });
      const debts = Array.isArray((profile as any).debts) ? ((profile as any).debts as any[]) : [];
      const found =
        args.debt_id
          ? debts.find((d) => String(d?._id) === String(args.debt_id))
          : debts.find((d) => String(d?.name) === String(args.name));
      return {
        operation: "upsert_debt",
        mode: found ? "update" : "create",
        debt_id: found?._id ? String(found._id) : args.debt_id,
        name: args.name,
        balance: args.balance,
        interest_rate: args.interest_rate,
        minimum_payment: args.minimum_payment,
        type: args.type,
      };
    },
    execute: async (ctx) => {
      const args: any = ctx.toolCall.args;
      const profile = await ensureProfileWithMigration({ orgId: ctx.orgId, userId: ctx.userId });

      const debts = Array.isArray((profile as any).debts) ? ((profile as any).debts as any[]) : [];
      const debtIdRaw = typeof args.debt_id === "string" ? args.debt_id.trim() : "";
      const existingDebt = debtIdRaw
        ? debts.find((d) => String(d?._id) === debtIdRaw)
        : debts.find((d) => String(d?.name) === String(args.name));

      if (existingDebt) {
        existingDebt.name = String(args.name);
        existingDebt.balance = Number(args.balance);
        existingDebt.interest_rate = Number(args.interest_rate);
        existingDebt.minimum_payment = Number(args.minimum_payment);
        existingDebt.type = String(args.type);
      } else {
        debts.push({
          _id: new mongoose.Types.ObjectId(),
          name: String(args.name),
          balance: Number(args.balance),
          interest_rate: Number(args.interest_rate),
          minimum_payment: Number(args.minimum_payment),
          type: String(args.type),
        });
        (profile as any).debts = debts;
      }

      setProfileMutationSource(profile, ctx.source);
      await profile.save();

      const saved = Array.isArray((profile as any).debts) ? ((profile as any).debts as any[]) : [];
      const resolved = debtIdRaw
        ? saved.find((d) => String(d?._id) === debtIdRaw)
        : saved.find((d) => String(d?.name) === String(args.name));

      await publishDomainEvent({
        orgId: ctx.orgId,
        userId: ctx.userId,
        eventType: "DebtUpserted",
        aggregateType: "financial_profile",
        aggregateId: profile._id.toString(),
        actionLinkId: ctx.source.action_link_id,
        requestId: ctx.requestId,
        payload: { debt_id: resolved?._id ? String(resolved._id) : undefined, tool_call_id: ctx.toolCall.id },
      }).catch(() => null);

      await recordAuditEvent({
        orgId: ctx.orgId,
        actorType: "user",
        actorUserId: ctx.userId,
        action: "debt_upserted",
        targetType: "financial_profile",
        targetId: profile._id.toString(),
        requestId: ctx.requestId,
        metadata: { tool_call_id: ctx.toolCall.id, debt_name: String(args.name) },
      });

      return {
        debt: resolved
          ? {
              id: String(resolved._id),
              name: resolved.name,
              balance: resolved.balance,
              interest_rate: resolved.interest_rate,
              minimum_payment: resolved.minimum_payment,
              type: resolved.type,
            }
          : null,
      };
    },
  },
  {
    tool: "notifications.sendEmail",
    requiredRole: "member",
    catalog: requireCatalogEntry("notifications.sendEmail"),
    simulate: async (ctx) => {
      const args = ctx.toolCall.args as any;
      return {
        operation: "send_email",
        to: args.to || "(default user email)",
        subject: args.subject,
        message_preview: String(args.message || "").slice(0, 160),
      };
    },
    execute: async (ctx) => {
      const args: any = ctx.toolCall.args;

      const user = await UserModel.findById(ctx.userId).select({ email: 1, isEmailVerified: 1 }).lean();
      const userEmail = user?.email ? String((user as any).email).trim() : "";
      const to = String(args.to || userEmail).trim();
      if (!to) {
        throw new HttpError(400, "EMAIL_REQUIRED", "Email recipient missing");
      }

      const subject = String(args.subject || "").trim();
      const message = String(args.message || "").trim();
      if (!subject || !message) {
        throw new HttpError(400, "EMAIL_INVALID", "Email subject and message are required");
      }

      const sendResult = await sendEmail({ to, subject, text: message });

      await recordAuditEvent({
        orgId: ctx.orgId,
        actorType: "user",
        actorUserId: ctx.userId,
        action: "notification_sent",
        targetType: "email",
        targetId: crypto.createHash("sha256").update(to).digest("hex").slice(0, 24),
        requestId: ctx.requestId,
        metadata: { tool_call_id: ctx.toolCall.id, mode: sendResult.mode },
      });

      await publishDomainEvent({
        orgId: ctx.orgId,
        userId: ctx.userId,
        eventType: "NotificationSent",
        aggregateType: "notification",
        aggregateId: `email:${Date.now()}`,
        actionLinkId: ctx.source.action_link_id,
        requestId: ctx.requestId,
        payload: { tool_call_id: ctx.toolCall.id, mode: sendResult.mode },
      }).catch(() => null);

      return {
        sent: true,
        mode: sendResult.mode,
      };
    },
  },
];
