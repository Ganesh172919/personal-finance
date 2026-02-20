import crypto from "crypto";
import mongoose from "mongoose";

import AccountModel from "../../models/accountModel";
import BudgetAllocationModel from "../../models/budgetAllocationModel";
import ExportJobModel from "../../models/exportJobModel";
import MonthCloseModel from "../../models/monthCloseModel";
import MerchantModel from "../../models/merchantModel";
import NotificationModel from "../../models/notificationModel";
import OrganizationModel from "../../models/organizationModel";
import OrgMemberModel from "../../models/orgMemberModel";
import RecurringRuleModel from "../../models/recurringRuleModel";
import TransactionModel, { type TransactionType } from "../../models/transactionModel";
import UserModel from "../../models/userModel";
import WorkflowModel from "../../models/workflowModel";
import { HttpError } from "../../middleware/httpError";
import { recordAuditEvent } from "../auditLog";
import { publishDomainEvent } from "../domainEvents";
import { enforceFeatureLimit, getResolvedEntitlements, recordFeatureUsage } from "../entitlements";
import { processExportJob } from "../exports";
import { detectRecurringCandidates, getBudgetEnvelopes, parsePeriodKey } from "../financeIntelligence";
import { bumpTransactionMetadata, ensureProfileWithMigration, setProfileMutationSource } from "../profileService";
import { createWorkflow, enqueueWorkflowRun } from "../workflows";
import { sendEmail } from "../../utils/sendEmail";
import { getToolCatalogEntry } from "../toolCatalog";
import type { ToolHandler } from "./types";

const normalizeTransactionAmount = (amount: number, type: TransactionType) => {
  const absoluteAmount = Math.abs(Number(amount));
  return type === "income" ? absoluteAmount : -absoluteAmount;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

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
        // Cron scheduling previously relied on Redis + BullMQ. In localhost-only mode, cron triggers are ignored.
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

      const processed = await processExportJob(exportJobId);
      return { export_job_id: exportJobId, queued: false, status: (processed as any).status };
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
    tool: "finance.lookupAccount",
    requiredRole: "member",
    catalog: requireCatalogEntry("finance.lookupAccount"),
    simulate: async (ctx) => {
      const args = ctx.toolCall.args as any;
      const q = String(args.q || "").trim();
      const limit = clampInt(args.limit, 10, 1, 50);
      const regex = new RegExp(escapeRegex(q), "i");

      const rows = await AccountModel.find({
        orgId: ctx.orgId,
        $or: [{ name: regex }, { institution: regex }, { mask: regex }],
      })
        .select({ _id: 1, name: 1, institution: 1, type: 1, currency: 1, mask: 1, status: 1, updatedAt: 1 })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean();

      return {
        operation: "lookup_account",
        query: q,
        matches: rows.map((row: any) => ({
          id: String(row._id),
          name: String(row.name || ""),
          institution: row.institution ? String(row.institution) : null,
          type: String(row.type || "checking"),
          currency: String(row.currency || "USD"),
          mask: row.mask ? String(row.mask) : null,
          status: String(row.status || "active"),
          updated_at: row.updatedAt || null,
        })),
      };
    },
    execute: async (ctx) => {
      return builtinToolHandlers.find((handler) => handler.tool === "finance.lookupAccount")!.simulate(ctx as any);
    },
  },
  {
    tool: "finance.lookupMerchant",
    requiredRole: "member",
    catalog: requireCatalogEntry("finance.lookupMerchant"),
    simulate: async (ctx) => {
      const args = ctx.toolCall.args as any;
      const q = String(args.q || "").trim();
      const limit = clampInt(args.limit, 10, 1, 50);
      const regex = new RegExp(escapeRegex(q), "i");

      const rows = await MerchantModel.find({
        orgId: ctx.orgId,
        $or: [{ name: regex }, { normalizedName: regex }, { aliases: regex }],
      })
        .select({ _id: 1, name: 1, normalizedName: 1, categoryDefault: 1, aliases: 1, updatedAt: 1 })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean();

      return {
        operation: "lookup_merchant",
        query: q,
        matches: rows.map((row: any) => ({
          id: String(row._id),
          name: String(row.name || ""),
          normalized_name: String(row.normalizedName || ""),
          category_default: row.categoryDefault ? String(row.categoryDefault) : null,
          aliases: Array.isArray(row.aliases) ? row.aliases.map((a: any) => String(a)) : [],
          updated_at: row.updatedAt || null,
        })),
      };
    },
    execute: async (ctx) => {
      return builtinToolHandlers.find((handler) => handler.tool === "finance.lookupMerchant")!.simulate(ctx as any);
    },
  },
  {
    tool: "finance.lookupRecurringRule",
    requiredRole: "member",
    catalog: requireCatalogEntry("finance.lookupRecurringRule"),
    simulate: async (ctx) => {
      const args = ctx.toolCall.args as any;
      const q = String(args.q || "").trim();
      const limit = clampInt(args.limit, 10, 1, 50);
      const regex = new RegExp(escapeRegex(q), "i");

      const rows = await RecurringRuleModel.find({
        orgId: ctx.orgId,
        $or: [{ name: regex }, { merchantName: regex }, { category: regex }],
      })
        .select({ _id: 1, status: 1, name: 1, cron: 1, merchantId: 1, merchantName: 1, category: 1, nextRunAt: 1, updatedAt: 1 })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean();

      return {
        operation: "lookup_recurring_rule",
        query: q,
        matches: rows.map((row: any) => ({
          id: String(row._id),
          status: String(row.status || "active"),
          name: String(row.name || ""),
          cron: String(row.cron || ""),
          merchant_id: row.merchantId ? String(row.merchantId) : null,
          merchant_name: row.merchantName ? String(row.merchantName) : null,
          category: row.category ? String(row.category) : null,
          next_run_at: row.nextRunAt ? new Date(row.nextRunAt).toISOString() : null,
          updated_at: row.updatedAt || null,
        })),
      };
    },
    execute: async (ctx) => {
      return builtinToolHandlers.find((handler) => handler.tool === "finance.lookupRecurringRule")!.simulate(ctx as any);
    },
  },
  {
    tool: "finance.detectRecurringCandidates",
    requiredRole: "member",
    catalog: requireCatalogEntry("finance.detectRecurringCandidates"),
    simulate: async (ctx) => {
      const args = ctx.toolCall.args as any;
      const result = await detectRecurringCandidates({
        orgId: ctx.orgId,
        daysBack: args.days_back,
        limit: args.limit,
        minOccurrences: args.min_occurrences,
      });

      return {
        operation: "detect_recurring_candidates",
        ...result,
      };
    },
    execute: async (ctx) => {
      return builtinToolHandlers.find((handler) => handler.tool === "finance.detectRecurringCandidates")!.simulate(ctx as any);
    },
  },
  {
    tool: "budgets.recommendAllocations",
    requiredRole: "admin",
    catalog: requireCatalogEntry("budgets.recommendAllocations"),
    simulate: async (ctx) => {
      const args = ctx.toolCall.args as any;
      const periodKey = String(args.period_key || "").trim();
      const daysBack = clampInt(args.days_back, 90, 30, 730);
      const topCategories = clampInt(args.top_categories, 12, 1, 100);
      const bufferPct = clampNumber(args.buffer_pct, 10, 0, 50);
      const minAmount = clampNumber(args.min_amount, 0, 0, Number.MAX_SAFE_INTEGER);
      const excludeCategories = new Set(
        Array.isArray(args.exclude_categories) ? args.exclude_categories.map((c: any) => String(c).trim()).filter(Boolean) : []
      );

      const org = await OrganizationModel.findById(ctx.orgId).select({ currency: 1 }).lean();
      const currency = String(args.currency || (org as any)?.currency || "USD").trim().toUpperCase();

      const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
      const rows = await TransactionModel.aggregate([
        {
          $match: {
            orgId: ctx.orgId,
            date: { $gte: cutoff },
            amount: { $lt: 0 },
          },
        },
        {
          $group: {
            _id: "$category",
            spent: { $sum: { $abs: "$amount" } },
            tx_count: { $sum: 1 },
            last_seen_at: { $max: "$date" },
          },
        },
        { $sort: { spent: -1 } },
        { $limit: 250 },
      ]);

      const months = Math.max(1, daysBack / 30);
      const recommendations = (rows as any[])
        .map((row) => {
          const category = String(row?._id || "Other");
          if (excludeCategories.has(category)) return null;
          const spent = Math.max(0, Number(row?.spent || 0));
          const avgMonthly = spent / months;
          const suggested = avgMonthly * (1 + bufferPct / 100);
          if (suggested < minAmount) return null;
          return {
            category,
            suggested_amount: roundMoney(suggested),
            currency,
            basis_avg_monthly_spend: roundMoney(avgMonthly),
            spent_total: roundMoney(spent),
            tx_count: Math.max(0, Number(row?.tx_count || 0)),
            last_seen_at: row?.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
          };
        })
        .filter(Boolean)
        .slice(0, topCategories);

      return {
        operation: "recommend_budget_allocations",
        period_key: periodKey,
        currency,
        days_back: daysBack,
        buffer_pct: bufferPct,
        recommendations,
      };
    },
    execute: async (ctx) => {
      const args = ctx.toolCall.args as any;
      const periodKey = String(args.period_key || "").trim();
      const preview = await builtinToolHandlers.find((handler) => handler.tool === "budgets.recommendAllocations")!.simulate(ctx as any);
      const recommendations = Array.isArray((preview as any)?.recommendations) ? ((preview as any).recommendations as any[]) : [];
      const currency = String((preview as any)?.currency || "USD");

      if (recommendations.length === 0) {
        return { applied: false, period_key: periodKey, upserted: 0, modified: 0, recommendations: [] };
      }

      const ops = recommendations.map((rec) => ({
        updateOne: {
          filter: { orgId: ctx.orgId, periodKey, category: String(rec.category) },
          update: {
            $set: {
              amount: roundMoney(Number(rec.suggested_amount || 0)),
              currency,
              metadata: {
                recommended: true,
                buffer_pct: (preview as any)?.buffer_pct,
                days_back: (preview as any)?.days_back,
                tool_call_id: ctx.toolCall.id,
                request_id: ctx.requestId,
                computed_at: new Date().toISOString(),
              },
              updatedByUserId: ctx.userId,
            },
            $setOnInsert: {
              orgId: ctx.orgId,
              periodKey,
              category: String(rec.category),
              createdByUserId: ctx.userId,
            },
          },
          upsert: true,
        },
      }));

      const bulk: any = await BudgetAllocationModel.bulkWrite(ops, { ordered: false });

      await recordAuditEvent({
        orgId: ctx.orgId,
        actorType: "user",
        actorUserId: ctx.userId,
        action: "budget_allocations_recommended_applied",
        targetType: "budget",
        targetId: periodKey,
        requestId: ctx.requestId,
        metadata: {
          tool_call_id: ctx.toolCall.id,
          recommendations: recommendations.length,
          upserted: Number(bulk?.upsertedCount || 0),
          modified: Number(bulk?.modifiedCount || 0),
        },
      });

      await publishDomainEvent({
        orgId: ctx.orgId,
        userId: ctx.userId,
        eventType: "BudgetAllocationsRecommendedApplied",
        aggregateType: "budget",
        aggregateId: periodKey,
        actionLinkId: ctx.source.action_link_id,
        requestId: ctx.requestId,
        payload: { tool_call_id: ctx.toolCall.id, period_key: periodKey, recommendations: recommendations.length },
      }).catch(() => null);

      return {
        applied: true,
        period_key: periodKey,
        upserted: Number(bulk?.upsertedCount || 0),
        modified: Number(bulk?.modifiedCount || 0),
        recommendations,
      };
    },
  },
  {
    tool: "closeMonth.run",
    requiredRole: "admin",
    catalog: requireCatalogEntry("closeMonth.run"),
    simulate: async (ctx) => {
      const args = ctx.toolCall.args as any;
      const periodKey = String(args.period_key || "").trim();
      const includeExport = args.include_export === undefined ? true : Boolean(args.include_export);
      const topCategories = clampInt(args.top_categories, 10, 0, 50);

      const { start, end } = parsePeriodKey(periodKey);

      const totalsAgg = await TransactionModel.aggregate([
        { $match: { orgId: ctx.orgId, date: { $gte: start, $lt: end } } },
        {
          $group: {
            _id: null,
            income: {
              $sum: {
                $cond: [{ $gt: ["$amount", 0] }, "$amount", 0],
              },
            },
            expenses: {
              $sum: {
                $cond: [{ $lt: ["$amount", 0] }, { $abs: "$amount" }, 0],
              },
            },
            tx_count: { $sum: 1 },
          },
        },
      ]);

      const totalsRow = (totalsAgg as any[])?.[0] || {};
      const income = Math.max(0, Number(totalsRow?.income || 0));
      const expenses = Math.max(0, Number(totalsRow?.expenses || 0));
      const txCount = Math.max(0, Number(totalsRow?.tx_count || 0));

      const topRows = topCategories > 0
        ? await TransactionModel.aggregate([
            { $match: { orgId: ctx.orgId, date: { $gte: start, $lt: end }, amount: { $lt: 0 } } },
            { $group: { _id: "$category", spent: { $sum: { $abs: "$amount" } } } },
            { $sort: { spent: -1 } },
            { $limit: topCategories },
          ])
        : [];

      const top = (topRows as any[]).map((row) => ({
        category: String(row?._id || "Other"),
        spent: roundMoney(Math.max(0, Number(row?.spent || 0))),
      }));

      const budget = await getBudgetEnvelopes({ orgId: ctx.orgId, periodKey }).catch(() => null);

      let eligibleExport: boolean | undefined = undefined;
      let plan: string | undefined = undefined;
      if (includeExport) {
        try {
          const resolved = await getResolvedEntitlements({ orgId: ctx.orgId, userId: ctx.userId });
          eligibleExport = Boolean(resolved.remaining.export_access);
          plan = String(resolved.entitlement.plan || "free");
        } catch {
          eligibleExport = undefined;
          plan = undefined;
        }
      }

      return {
        operation: "close_month",
        period_key: periodKey,
        include_export: includeExport,
        eligible_export: eligibleExport,
        plan,
        totals: {
          income: roundMoney(income),
          expenses: roundMoney(expenses),
          net: roundMoney(income - expenses),
          tx_count: txCount,
        },
        top_categories: top,
        budget: budget ? (budget as any).totals : undefined,
      };
    },
    execute: async (ctx) => {
      const args = ctx.toolCall.args as any;
      const periodKey = String(args.period_key || "").trim();
      const includeExport = args.include_export === undefined ? true : Boolean(args.include_export);

      const preview = await builtinToolHandlers.find((handler) => handler.tool === "closeMonth.run")!.simulate(ctx as any);

      let close = await MonthCloseModel.findOne({ orgId: ctx.orgId, periodKey }).lean();
      if (!close) {
        close = await MonthCloseModel.create({
          orgId: ctx.orgId,
          periodKey,
          createdByUserId: ctx.userId,
          status: "succeeded",
          totals: (preview as any)?.totals || {},
          budget: (preview as any)?.budget || {},
          topCategories: (preview as any)?.top_categories || [],
          metadata: { tool_call_id: ctx.toolCall.id, request_id: ctx.requestId },
        }).catch(async (error: any) => {
          if (error?.code !== 11000) {
            throw error;
          }
          const raced = await MonthCloseModel.findOne({ orgId: ctx.orgId, periodKey }).lean();
          if (!raced) {
            throw error;
          }
          return raced as any;
        });
      }

      let exportJobId: string | null = (close as any)?.exportJobId ? String((close as any).exportJobId) : null;

      if (includeExport && !exportJobId) {
        await enforceFeatureLimit({
          orgId: ctx.orgId,
          userId: ctx.userId,
          feature: "export_access",
          requestId: ctx.requestId,
        });

        const idempotencyKeyInner = `close_month:${periodKey}`.slice(0, 128);

        const existingJob = await ExportJobModel.findOne({
          orgId: ctx.orgId,
          createdByUserId: ctx.userId,
          idempotencyKey: idempotencyKeyInner,
        }).lean();

        const exportJob =
          existingJob ||
          (await ExportJobModel.create({
            orgId: ctx.orgId,
            createdByUserId: ctx.userId,
            type: "monthly_summary_pdf",
            status: "queued",
            params: { period_key: periodKey },
            requestId: ctx.requestId,
            idempotencyKey: idempotencyKeyInner,
          }));

        exportJobId = String((exportJob as any)._id);

        await MonthCloseModel.updateOne({ _id: (close as any)._id }, { $set: { exportJobId: exportJob._id } });

        await recordFeatureUsage({
          orgId: ctx.orgId,
          userId: ctx.userId,
          feature: "export_access",
          units: 1,
          requestId: ctx.requestId,
          idempotencyKey: `export:${exportJobId}`,
          context: { export_type: "monthly_summary_pdf", tool_call_id: ctx.toolCall.id, period_key: periodKey },
        }).catch(() => null);

        await processExportJob(exportJobId);
      }

      await recordAuditEvent({
        orgId: ctx.orgId,
        actorType: "user",
        actorUserId: ctx.userId,
        action: "month_closed",
        targetType: "month_close",
        targetId: String((close as any)._id),
        requestId: ctx.requestId,
        metadata: {
          tool_call_id: ctx.toolCall.id,
          period_key: periodKey,
          include_export: includeExport,
          export_job_id: exportJobId,
        },
      });

      await publishDomainEvent({
        orgId: ctx.orgId,
        userId: ctx.userId,
        eventType: "MonthClosed",
        aggregateType: "month_close",
        aggregateId: String((close as any)._id),
        actionLinkId: ctx.source.action_link_id,
        requestId: ctx.requestId,
        payload: { tool_call_id: ctx.toolCall.id, period_key: periodKey, export_job_id: exportJobId },
      }).catch(() => null);

      return {
        month_close: {
          id: String((close as any)._id),
          period_key: periodKey,
          totals: (preview as any)?.totals || (close as any)?.totals || {},
          budget: (preview as any)?.budget || (close as any)?.budget || {},
          top_categories: (preview as any)?.top_categories || (close as any)?.topCategories || [],
          export_job_id: exportJobId,
        },
      };
    },
  },
  {
    tool: "notifications.send",
    requiredRole: "member",
    catalog: requireCatalogEntry("notifications.send"),
    simulate: async (ctx) => {
      const args = ctx.toolCall.args as any;
      const channel = String(args.channel || "email").trim().toLowerCase();
      const subject = String(args.subject || "").trim();
      const message = String(args.message || "").trim();
      return {
        operation: "send_notification",
        channel,
        to: channel === "email" ? args.to || "(default user email)" : args.user_id || "(self)",
        subject,
        message_preview: message.slice(0, 160),
      };
    },
    execute: async (ctx) => {
      const args: any = ctx.toolCall.args;
      const channel = String(args.channel || "email").trim().toLowerCase();

      const subject = String(args.subject || "").trim();
      const message = String(args.message || "").trim();
      if (!subject || !message) {
        throw new HttpError(400, "NOTIFICATION_INVALID", "Notification subject and message are required");
      }

      if (channel === "in_app") {
        const targetUserIdRaw = typeof args.user_id === "string" ? args.user_id.trim() : "";
        const targetUserId =
          targetUserIdRaw && mongoose.Types.ObjectId.isValid(targetUserIdRaw)
            ? new mongoose.Types.ObjectId(targetUserIdRaw)
            : ctx.userId;

        if (targetUserId.toString() !== ctx.userId.toString() && ctx.actorRole === "member") {
          throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required to notify other users");
        }

        const membership = await OrgMemberModel.findOne({ orgId: ctx.orgId, userId: targetUserId, status: "active" })
          .select({ _id: 1 })
          .lean();
        if (!membership) {
          throw new HttpError(404, "USER_NOT_IN_ORG", "Target user is not in this organization");
        }

        const notification = await NotificationModel.create({
          orgId: ctx.orgId,
          userId: targetUserId,
          status: "unread",
          title: subject,
          message,
          metadata: { tool_call_id: ctx.toolCall.id, request_id: ctx.requestId },
        });

        await recordAuditEvent({
          orgId: ctx.orgId,
          actorType: "user",
          actorUserId: ctx.userId,
          action: "notification_sent",
          targetType: "notification",
          targetId: notification._id.toString(),
          requestId: ctx.requestId,
          metadata: { tool_call_id: ctx.toolCall.id, channel: "in_app" },
        });

        await publishDomainEvent({
          orgId: ctx.orgId,
          userId: ctx.userId,
          eventType: "NotificationSent",
          aggregateType: "notification",
          aggregateId: notification._id.toString(),
          actionLinkId: ctx.source.action_link_id,
          requestId: ctx.requestId,
          payload: { tool_call_id: ctx.toolCall.id, channel: "in_app", notification_id: notification._id.toString() },
        }).catch(() => null);

        return {
          sent: true,
          channel: "in_app",
          notification: {
            id: notification._id.toString(),
            status: notification.status,
            title: notification.title,
            message: notification.message,
            created_at: notification.createdAt,
          },
        };
      }

      if (channel !== "email") {
        throw new HttpError(400, "CHANNEL_UNSUPPORTED", "Unsupported notification channel");
      }

      const user = await UserModel.findById(ctx.userId).select({ email: 1, isEmailVerified: 1 }).lean();
      const userEmail = user?.email ? String((user as any).email).trim() : "";
      const to = String(args.to || userEmail).trim();
      if (!to) {
        throw new HttpError(400, "EMAIL_REQUIRED", "Email recipient missing");
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
        metadata: { tool_call_id: ctx.toolCall.id, mode: sendResult.mode, channel: "email" },
      });

      await publishDomainEvent({
        orgId: ctx.orgId,
        userId: ctx.userId,
        eventType: "NotificationSent",
        aggregateType: "notification",
        aggregateId: `email:${Date.now()}`,
        actionLinkId: ctx.source.action_link_id,
        requestId: ctx.requestId,
        payload: { tool_call_id: ctx.toolCall.id, mode: sendResult.mode, channel: "email" },
      }).catch(() => null);

      return {
        sent: true,
        channel: "email",
        mode: sendResult.mode,
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
