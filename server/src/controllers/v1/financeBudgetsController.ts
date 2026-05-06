/**
 * @fileoverview Finance Budgets Controller (v1)
 *
 * Manages budget allocations per category per period (month). Budgets define
 * planned spending limits that are compared against actual spending in the
 * dashboard and intelligence endpoints.
 *
 * Routes served:
 *   GET /api/v1/finance/budgets/:periodKey        - listBudgetAllocations
 *   PUT /api/v1/finance/budgets/:periodKey         - upsertBudgetAllocation (admin)
 *
 * Key patterns:
 *   - Period key format: YYYY-MM (validated with regex)
 *   - upsert uses findOneAndUpdate with upsert:true for atomic create-or-update
 *   - Amounts rounded to 2 decimal places
 *   - Currency validated as 3-letter ISO code
 *   - List readable by any org member; upsert requires admin role
 *
 * @module controllers/v1/financeBudgetsController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import BudgetAllocationModel from "../../models/budgetAllocationModel";
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

const mapAllocation = (row: any) => ({
  id: String(row._id),
  period_key: String(row.periodKey),
  category: String(row.category),
  amount: Number(row.amount || 0),
  currency: String(row.currency || "USD"),
  metadata: row.metadata || {},
  created_at: row.createdAt || null,
  updated_at: row.updatedAt || null,
});

export const listBudgetAllocations = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const periodKey = String((req as any).params?.periodKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(periodKey)) {
    throw new HttpError(400, "INVALID_PERIOD_KEY", "Invalid period key (expected YYYY-MM)");
  }

  const limitRaw = Number((req.query as any)?.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 200;

  const rows = await BudgetAllocationModel.find({ orgId, periodKey })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  res.json({
    org_id: orgId.toString(),
    period_key: periodKey,
    allocations: rows.map(mapAllocation),
    request_id: req.requestId,
  });
};

export const upsertBudgetAllocation = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const periodKey = String((req as any).params?.periodKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(periodKey)) {
    throw new HttpError(400, "INVALID_PERIOD_KEY", "Invalid period key (expected YYYY-MM)");
  }

  const body = req.body as any;
  const category = String(body.category || "").trim();
  if (!category) {
    throw new HttpError(400, "INVALID_CATEGORY", "Category is required");
  }

  const amountRaw = Number(body.amount);
  if (!Number.isFinite(amountRaw) || amountRaw < 0) {
    throw new HttpError(400, "INVALID_AMOUNT", "Amount must be a non-negative number");
  }

  const currency = body.currency ? String(body.currency).trim().toUpperCase() : "USD";
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new HttpError(400, "INVALID_CURRENCY", "Invalid currency code");
  }

  const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};

  const updated = await BudgetAllocationModel.findOneAndUpdate(
    { orgId, periodKey, category },
    {
      $set: {
        amount: Math.round(amountRaw * 100) / 100,
        currency,
        metadata,
        updatedByUserId: user._id,
      },
      $setOnInsert: {
        orgId,
        periodKey,
        category,
        createdByUserId: user._id,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  res.status(200).json({
    org_id: orgId.toString(),
    period_key: periodKey,
    allocation: mapAllocation(updated),
    request_id: req.requestId,
  });
};

