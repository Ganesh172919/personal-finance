/**
 * @fileoverview Finance Recurring Controller (v1)
 *
 * Manages recurring transaction rules (subscriptions, bills, regular income).
 * Rules define a cron schedule and optional amount/category constraints.
 *
 * Routes served:
 *   GET    /api/v1/finance/recurring       - listRecurringRules
 *   POST   /api/v1/finance/recurring       - createRecurringRule (admin)
 *   PUT    /api/v1/finance/recurring/:id   - updateRecurringRule (admin)
 *
 * Key patterns:
 *   - Cron expressions define when the rule should fire
 *   - Optional merchant_id links rule to a specific merchant
 *   - Amount range filters (min/max) for matching transactions
 *   - Status can be "active" or "disabled"
 *   - next_run_at stored as Date for scheduler queries
 *   - List readable by any org member; create/update require admin role
 *
 * @module controllers/v1/financeRecurringController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import RecurringRuleModel from "../../models/recurringRuleModel";
import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";

const roleRank: Record<"member" | "admin" | "owner", number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

const requireOrgContext = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(req.org.orgId);
};

const requireOrgAdmin = (req: Request) => {
  const orgId = requireOrgContext(req);
  if (roleRank[req.org!.role] < roleRank.admin) {
    throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required");
  }
  return orgId;
};

const mapRule = (rule: any) => ({
  id: String(rule._id),
  status: String(rule.status || "active"),
  name: String(rule.name || ""),
  cron: String(rule.cron || ""),
  merchant_id: rule.merchantId ? String(rule.merchantId) : null,
  merchant_name: rule.merchantName ? String(rule.merchantName) : null,
  category: rule.category ? String(rule.category) : null,
  amount_min: typeof rule.amountMin === "number" ? Number(rule.amountMin) : null,
  amount_max: typeof rule.amountMax === "number" ? Number(rule.amountMax) : null,
  next_run_at: rule.nextRunAt || null,
  metadata: rule.metadata || {},
  created_at: rule.createdAt || null,
  updated_at: rule.updatedAt || null,
});

export const listRecurringRules = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const limitRaw = Number((req.query as any)?.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 200;

  const rows = await RecurringRuleModel.find({ orgId }).sort({ updatedAt: -1 }).limit(limit).lean();

  res.json({
    org_id: orgId.toString(),
    rules: rows.map(mapRule),
    request_id: req.requestId,
  });
};

export const createRecurringRule = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const body = req.body as any;
  const merchantId =
    body.merchant_id && mongoose.Types.ObjectId.isValid(String(body.merchant_id))
      ? new mongoose.Types.ObjectId(String(body.merchant_id))
      : undefined;

  const nextRunAt = body.next_run_at ? new Date(String(body.next_run_at)) : undefined;
  const safeNextRunAt = nextRunAt && !Number.isNaN(nextRunAt.getTime()) ? nextRunAt : undefined;

  const created = await RecurringRuleModel.create({
    orgId,
    createdByUserId: user._id,
    status: String(body.status || "active") === "disabled" ? "disabled" : "active",
    name: String(body.name),
    cron: String(body.cron),
    merchantId,
    merchantName: body.merchant_name ? String(body.merchant_name) : undefined,
    category: body.category ? String(body.category) : undefined,
    amountMin: body.amount_min !== undefined ? Number(body.amount_min) : undefined,
    amountMax: body.amount_max !== undefined ? Number(body.amount_max) : undefined,
    nextRunAt: safeNextRunAt,
    metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
  });

  res.status(201).json({
    org_id: orgId.toString(),
    rule: mapRule(created.toObject()),
    request_id: req.requestId,
  });
};

export const updateRecurringRule = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const ruleIdRaw = String((req as any).params?.id || "");
  if (!mongoose.Types.ObjectId.isValid(ruleIdRaw)) {
    throw new HttpError(400, "INVALID_RULE_ID", "Invalid recurring rule id");
  }
  const ruleId = new mongoose.Types.ObjectId(ruleIdRaw);

  const body = req.body as any;
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = String(body.name);
  if (body.cron !== undefined) update.cron = String(body.cron);
  if (body.status !== undefined) update.status = String(body.status) === "disabled" ? "disabled" : "active";
  if (body.category !== undefined) update.category = body.category ? String(body.category) : undefined;
  if (body.merchant_name !== undefined) update.merchantName = body.merchant_name ? String(body.merchant_name) : undefined;
  if (body.merchant_id !== undefined) {
    const raw = String(body.merchant_id || "");
    update.merchantId = raw && mongoose.Types.ObjectId.isValid(raw) ? new mongoose.Types.ObjectId(raw) : undefined;
  }
  if (body.amount_min !== undefined) update.amountMin = body.amount_min === null ? undefined : Number(body.amount_min);
  if (body.amount_max !== undefined) update.amountMax = body.amount_max === null ? undefined : Number(body.amount_max);
  if (body.next_run_at !== undefined) {
    const next = body.next_run_at ? new Date(String(body.next_run_at)) : undefined;
    update.nextRunAt = next && !Number.isNaN(next.getTime()) ? next : undefined;
  }
  if (body.metadata !== undefined && body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)) {
    update.metadata = body.metadata;
  }

  const updated = await RecurringRuleModel.findOneAndUpdate({ _id: ruleId, orgId }, { $set: update }, { new: true }).lean();
  if (!updated) {
    throw new HttpError(404, "NOT_FOUND", "Recurring rule not found");
  }

  res.json({
    org_id: orgId.toString(),
    rule: mapRule(updated),
    request_id: req.requestId,
  });
};

