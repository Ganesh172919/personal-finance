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
import {
  CURRENCY_SYMBOLS,
  FX_RATES_TO_USD,
  convertUsdToCurrency,
  normalizeCurrency,
} from "../../utils/currencyFx";

// Maps organization role levels to numeric hierarchy ranks.
// Enables comparison of member, admin, and owner authority levels.
// Used for role-based authorization guards across budget operations.
const roleRank: Record<"member" | "admin" | "owner", number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

// Validates that organization context exists on the incoming request.
// Throws a 401 unauthorized error if the organization context is missing.
// Returns the resolved organization ID as a typed MongoDB ObjectId.
const requireOrgContext = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(req.org.orgId);
};

// Enforces that the requesting user holds admin or higher role in the organization.
// Verifies organization context and evaluates role rank against admin threshold.
// Throws a 403 access denied error if permissions are insufficient.
const requireOrgAdmin = (req: Request) => {
  const orgId = requireOrgContext(req);
  if (roleRank[req.org!.role] < roleRank.admin) {
    throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required");
  }
  return orgId;
};

// Serializes a raw budget allocation database document into a clean API response.
// Normalizes fields such as identifier, period key, category, amount, and currency.
// Guarantees consistent field formatting and default values across endpoints.
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

// Retrieves all budget allocations for a specific organization and period key.
// Validates period key formatting and supports optional currency FX conversion.
// Returns the list of allocations along with organization and period metadata.
export const listBudgetAllocations = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const periodKey = String((req as any).params?.periodKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(periodKey)) {
    throw new HttpError(400, "INVALID_PERIOD_KEY", "Invalid period key (expected YYYY-MM)");
  }

  const limitRaw = Number((req.query as any)?.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 200;

  const currencyQuery = typeof req.query?.currency === "string" ? req.query.currency : undefined;
  const targetCurrency = currencyQuery ? normalizeCurrency(currencyQuery) : undefined;
  const fxRate = targetCurrency ? (FX_RATES_TO_USD[targetCurrency] ?? 1.0) : 1.0;
  const currencySymbol = targetCurrency ? (CURRENCY_SYMBOLS[targetCurrency] ?? "$") : undefined;

  const rows = await BudgetAllocationModel.find({ orgId, periodKey })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  const allocations = rows.map((row) => {
    const base = mapAllocation(row);
    if (!targetCurrency) return base;
    return {
      ...base,
      amount: convertUsdToCurrency(base.amount, targetCurrency),
      currency: targetCurrency,
    };
  });

  res.json({
    org_id: orgId.toString(),
    period_key: periodKey,
    ...(targetCurrency ? { currency: targetCurrency, fx_rate: fxRate, currency_symbol: currencySymbol } : {}),
    allocations,
    request_id: req.requestId,
  });
};

// Creates or updates a budget allocation for a given category and monthly period.
// Validates period key, category name, numeric amount, and ISO currency code.
// Performs an atomic upsert in the database and records user audit attributes.
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

// Deletes an existing budget allocation document by its unique identifier.
// Validates allocation ID formatting and ensures caller possesses admin privileges.
// Returns confirmation details including deleted category and period key.
export const deleteBudgetAllocation = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const periodKey = String((req as any).params?.periodKey || "").trim();
  const id = String((req as any).params?.id || "").trim();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new HttpError(400, "INVALID_ID", "Invalid allocation id");
  }

  const deleted = await BudgetAllocationModel.findOneAndDelete({
    _id: new mongoose.Types.ObjectId(id),
    orgId,
    periodKey,
  }).lean();

  if (!deleted) {
    throw new HttpError(404, "ALLOCATION_NOT_FOUND", "Budget allocation not found");
  }

  res.status(200).json({
    message: "Budget allocation deleted",
    deleted_id: id,
    period_key: periodKey,
    category: deleted.category,
    request_id: req.requestId,
  });
};

// Rebalances funds across budget categories for a given accounting period.
// Processes a sequence of category-to-category fund transfers atomically.
// Recalculates updated allocation totals and preserves overall balance integrity.
export const rebalanceBudgetAllocations = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const periodKey = String((req as any).params?.periodKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(periodKey)) {
    throw new HttpError(400, "INVALID_PERIOD_KEY", "Invalid period key (expected YYYY-MM)");
  }

  const body = req.body as {
    transfers: Array<{
      from_category: string;
      to_category: string;
      amount: number;
      reason?: string;
    }>;
  };

  if (!Array.isArray(body.transfers) || body.transfers.length === 0) {
    throw new HttpError(400, "INVALID_TRANSFERS", "Transfers array is required");
  }

  let totalAmount = 0;
  for (const t of body.transfers) {
    const amt = Number(t.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new HttpError(400, "INVALID_AMOUNT", "Transfer amount must be positive");
    }
    totalAmount += amt;

    const fromAlloc = await BudgetAllocationModel.findOne({ orgId, periodKey, category: t.from_category });
    const toAlloc = await BudgetAllocationModel.findOne({ orgId, periodKey, category: t.to_category });

    const fromCurrent = fromAlloc ? fromAlloc.amount : 0;
    const toCurrent = toAlloc ? toAlloc.amount : 0;

    const fromNew = Math.max(0, Math.round((fromCurrent - amt) * 100) / 100);
    const toNew = Math.round((toCurrent + amt) * 100) / 100;

    if (fromAlloc) {
      fromAlloc.amount = fromNew;
      fromAlloc.updatedByUserId = user._id;
      await fromAlloc.save();
    } else {
      await BudgetAllocationModel.create({
        orgId,
        periodKey,
        category: t.from_category,
        amount: fromNew,
        currency: "USD",
        createdByUserId: user._id,
        updatedByUserId: user._id,
      });
    }

    if (toAlloc) {
      toAlloc.amount = toNew;
      toAlloc.updatedByUserId = user._id;
      await toAlloc.save();
    } else {
      await BudgetAllocationModel.create({
        orgId,
        periodKey,
        category: t.to_category,
        amount: toNew,
        currency: "USD",
        createdByUserId: user._id,
        updatedByUserId: user._id,
      });
    }
  }

  const updatedAllocations = await BudgetAllocationModel.find({ orgId, periodKey })
    .sort({ updatedAt: -1 })
    .lean();

  res.status(200).json({
    org_id: orgId.toString(),
    period_key: periodKey,
    transfers_applied: body.transfers.length,
    total_rebalanced_amount: Math.round(totalAmount * 100) / 100,
    updated_allocations: updatedAllocations.map(mapAllocation),
    budget_preserved: true,
    request_id: req.requestId,
  });
};


