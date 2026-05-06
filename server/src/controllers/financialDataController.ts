/**
 * @fileoverview Financial Data Controller
 *
 * Core financial CRUD operations: transactions, goals, debts, dashboard, and portfolio.
 * This is the largest controller — it owns the primary financial data lifecycle.
 *
 * Routes served:
 *   POST   /api/financial-data/transactions          - createTransaction
 *   POST   /api/financial-data/transactions/import    - importTransactions
 *   GET    /api/financial-data/transactions           - listTransactions
 *   PUT    /api/financial-data/transactions/:id       - updateTransaction
 *   DELETE /api/financial-data/transactions/:id       - deleteTransaction
 *   GET    /api/financial-data/transactions/recent    - listRecentTransactions
 *   GET    /api/financial-data/transactions/summary   - getTransactionsSummary
 *   POST   /api/financial-data/goals                  - createGoal
 *   PUT    /api/financial-data/goals/:goalId          - updateGoal
 *   DELETE /api/financial-data/goals/:goalId          - deleteGoal
 *   POST   /api/financial-data/debts                  - createDebt
 *   PUT    /api/financial-data/debts/:debtId          - updateDebt
 *   DELETE /api/financial-data/debts/:debtId          - deleteDebt
 *   GET    /api/financial-data/dashboard              - getDashboardSummary
 *   GET    /api/financial-data/portfolio              - getPortfolioSummary
 *
 * Key patterns:
 *   - Every mutation records provenance (MutationSource) for audit trail
 *   - Transaction amounts normalized: income positive, expense/investment negative
 *   - Dashboard and portfolio responses are cached with responseCache service
 *   - Dashboard aggregates data from transactions, tasks, budgets, and reminders
 *   - Goals and debts are embedded sub-documents on the FinancialProfile model
 *   - Review enrichment (enrichTransactionsForReview) flags anomalies for UI
 *
 * @module controllers/financialDataController
 */

import { Request, Response } from "express";
import mongoose from "mongoose";
import {
  IDebt,
  IFinancialGoal,
  IFinancialProfileDocument
} from "../models/financialProfileModel";
import TaskModel from "../models/taskModel";
import TransactionModel, { TransactionType } from "../models/transactionModel";
import { IUserDocument } from "../models/userModel";
import CalendarReminderModel from "../models/calendarReminderModel";
import MonthCloseModel from "../models/monthCloseModel";
import { recordResponseCache } from "../observability/metrics";
import { publishDomainEvent } from "../services/domainEvents";
import { detectRecurringCandidates, getBudgetEnvelopes } from "../services/financeIntelligence";
import {
  bumpTransactionMetadata,
  ensureProfile,
  ensureProfileWithMigration,
  setProfileMutationSource
} from "../services/profileService";
import {
  buildDashboardSummaryCacheKey,
  buildPortfolioSummaryCacheKey,
  buildTransactionsSummaryCacheKey,
  getCachedResponse,
  responseCacheTtlMs,
  setCachedResponse
} from "../services/responseCache";
import type { MutationSource } from "../types/provenance";
import { HttpError } from "../middleware/httpError";
import { logger } from "../config/logger";
import { enrichTransactionsForReview } from "../services/transactionReview";

type TransactionInput = {
  amount: number;
  category: string;
  description: string;
  date?: string | Date;
  type: "income" | "expense" | "investment";
};

const requireOrgId = (req: Request) => {
  const orgIdRaw = String((req as any).org?.orgId || "");
  if (!orgIdRaw || !mongoose.Types.ObjectId.isValid(orgIdRaw)) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(orgIdRaw);
};

// Convention: income is positive, expense/investment is negative (enables simple summation)
const normalizeTransactionAmount = (
  amount: number,
  type: "income" | "expense" | "investment"
) => {
  const absoluteAmount = Math.abs(Number(amount));
  return type === "income" ? absoluteAmount : -absoluteAmount;
};

// Escapes special regex chars to prevent injection in user-supplied search strings
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const mapTransactionRecord = (transaction: {
  _id: unknown;
  amount: number;
  category: string;
  description: string;
  date: Date;
  type: TransactionType;
  source?: unknown;
  review?: unknown;
  reconciliation?: unknown;
  importDetails?: unknown;
  runningBalance?: unknown;
}) => ({
  id: String(transaction._id),
  amount: transaction.amount,
  category: transaction.category,
  description: transaction.description,
  date: transaction.date,
  type: transaction.type,
  source: transaction.source || undefined,
  review: transaction.review || undefined,
  reconciliation: transaction.reconciliation || undefined,
  import_details: transaction.importDetails || undefined,
  running_balance:
    transaction.runningBalance === undefined || transaction.runningBalance === null
      ? undefined
      : Number(transaction.runningBalance),
});

const mapGoal = (goal: IFinancialGoal) => ({
  id: goal._id?.toString(),
  name: goal.name,
  target: goal.target,
  current: goal.current,
  deadline: goal.deadline,
  priority: goal.priority
});

const mapDebt = (debt: IDebt) => ({
  id: debt._id?.toString(),
  name: debt.name,
  balance: debt.balance,
  interest_rate: debt.interest_rate,
  minimum_payment: debt.minimum_payment,
  type: debt.type
});

const getSingleParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const findGoal = (profile: IFinancialProfileDocument, goalId: string) => {
  const goals = profile.goals as IFinancialGoal[];
  const goalIndex = goals.findIndex(goal => goal._id?.toString() === goalId);

  if (goalIndex === -1) {
    return { goal: null, goalIndex: -1 };
  }

  return { goal: goals[goalIndex], goalIndex };
};

const findDebt = (profile: IFinancialProfileDocument, debtId: string) => {
  const debts = profile.debts as IDebt[];
  const debtIndex = debts.findIndex(debt => debt._id?.toString() === debtId);

  if (debtIndex === -1) {
    return { debt: null, debtIndex: -1 };
  }

  return { debt: debts[debtIndex], debtIndex };
};

const buildMutationSource = (
  requestId: string | undefined,
  origin: MutationSource["origin"],
  extra: Partial<MutationSource> = {}
): MutationSource => ({
  origin,
  request_id: requestId,
  actor_type: "user",
  ...extra
});

const inferAssetClass = (value: string) => {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("debt") || lower.includes("bond")) return "Debt";
  if (lower.includes("gold") || lower.includes("commodity")) return "Gold";
  if (lower.includes("liquid") || lower.includes("cash")) return "Cash";
  return "Equity";
};

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export const createTransaction = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const body = req.body as TransactionInput;

    const orgId = requireOrgId(req);
    const profile = await ensureProfileWithMigration({ orgId, userId: user._id });
    const source = buildMutationSource(req.requestId, "manual");

    const created = await TransactionModel.create({
      orgId,
      userId: user._id,
      amount: normalizeTransactionAmount(body.amount, body.type),
      category: body.category,
      description: body.description,
      type: body.type,
      date: body.date ? new Date(body.date) : new Date(),
      source
    });

    const createdReview = await enrichTransactionsForReview({ orgId, userId: user._id, transactions: [created.toObject()] });
    const reviewState = createdReview.get(created._id.toString());
    if (reviewState) {
      created.review = { ...reviewState, updatedAt: new Date() } as any;
      await created.save();
    }

    await publishDomainEvent({
      orgId,
      userId: user._id,
      eventType: "TransactionCreated",
      aggregateType: "transaction",
      aggregateId: created._id.toString(),
      actionLinkId: source.action_link_id,
      requestId: req.requestId,
      payload: {
        source,
        transaction_type: created.type,
        category: created.category,
        amount: created.amount,
      },
    });

    bumpTransactionMetadata(profile, { deltaCount: 1 });
    setProfileMutationSource(profile, source);
    await profile.save();

    res.status(201).json({
      message: "Transaction created",
      source,
      transaction: mapTransactionRecord(created.toObject())
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error creating transaction:`, error);
    res.status(500).json({ message: "Failed to create transaction", request_id: req.requestId });
  }
};

export const importTransactions = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const body = req.body as { rows: TransactionInput[] };
    const rows = Array.isArray(body.rows) ? body.rows : [];

    const orgId = requireOrgId(req);
    const profile = await ensureProfileWithMigration({ orgId, userId: user._id });
    const source = buildMutationSource(req.requestId, "csv_import");

    const now = new Date();
    const docs = rows.map(row => ({
      orgId,
      userId: user._id,
      amount: normalizeTransactionAmount(row.amount, row.type),
      category: row.category,
      description: row.description,
      type: row.type,
      date: row.date ? new Date(row.date) : now,
      source
    }));

    const inserted = docs.length > 0 ? await TransactionModel.insertMany(docs, { ordered: true }) : [];
    const insertedCount = Array.isArray(inserted) ? inserted.length : 0;

    bumpTransactionMetadata(profile, { deltaCount: insertedCount, at: now });
    setProfileMutationSource(profile, source);
    await profile.save();

    if (insertedCount > 0) {
      await publishDomainEvent({
        orgId,
        userId: user._id,
        eventType: "TransactionImported",
        aggregateType: "transaction_batch",
        aggregateId: `${user._id.toString()}:${now.getTime()}`,
        actionLinkId: source.action_link_id,
        requestId: req.requestId,
        payload: {
          source,
          count: insertedCount,
        },
      });
    }

    res.status(201).json({
      message: "Transactions imported",
      source,
      inserted: insertedCount
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error importing transactions:`, error);
    res.status(500).json({ message: "Failed to import transactions", request_id: req.requestId });
  }
};

export const listTransactions = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const {
      page = 1,
      limit = 20,
      from,
      to,
      type,
      category,
      needs_review,
      review_flag,
    } = req.query as {
      page?: number;
      limit?: number;
      from?: Date;
      to?: Date;
      type?: "income" | "expense" | "investment";
      category?: string;
      needs_review?: boolean;
      review_flag?: string;
    };

    const orgId = requireOrgId(req);
    await ensureProfileWithMigration({ orgId, userId: user._id });

    const filter: Record<string, unknown> = { orgId, userId: user._id };

    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) {
        const start = new Date(from);
        start.setHours(0, 0, 0, 0);
        range.$gte = start;
      }
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      filter.date = range;
    }

    if (type) {
      filter.type = type;
    }

    if (category) {
      const normalized = category.trim();
      if (normalized.length > 0) {
        filter.category = new RegExp(`^${escapeRegExp(normalized)}$`, "i");
      }
    }

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Number(limit) || 20);
    const skip = (safePage - 1) * safeLimit;

    // Review filters require fetching a larger set first, then filtering in-memory
    // because review state is computed on-the-fly (not stored on every transaction)
    const needsReviewFilter = Boolean(needs_review) || Boolean(review_flag);

    if (needsReviewFilter) {
      const docs = await TransactionModel.find(filter).sort({ date: -1 }).limit(500).lean();
      const reviewById = await enrichTransactionsForReview({ orgId, userId: user._id, transactions: docs as any[] });
      const reviewedDocs = docs
        .map((doc: any) => {
          const review = reviewById.get(String(doc._id)) || doc.review;
          return {
            ...doc,
            review,
          };
        })
        .filter((doc: any) => (Boolean(needs_review) ? Boolean(doc.review?.needs_attention) : true))
        .filter((doc: any) => (review_flag ? Array.isArray(doc.review?.flags) && doc.review.flags.includes(review_flag) : true));

      const pagedDocs = reviewedDocs.slice(skip, skip + safeLimit);
      return res.json({
        transactions: pagedDocs.map((doc) => mapTransactionRecord(doc as any)),
        pagination: {
          page: safePage,
          limit: safeLimit,
          total: reviewedDocs.length,
          totalPages: Math.max(1, Math.ceil(reviewedDocs.length / safeLimit)),
        }
      });
    }

    const [total, docs] = await Promise.all([
      TransactionModel.countDocuments(filter),
      TransactionModel.find(filter).sort({ date: -1 }).skip(skip).limit(safeLimit).lean()
    ]);
    const reviewById = await enrichTransactionsForReview({ orgId, userId: user._id, transactions: docs as any[] });
    const docsWithReview = docs.map((doc: any) => ({
      ...doc,
      review: reviewById.get(String(doc._id)) || doc.review,
    }));

    res.json({
      transactions: docsWithReview.map(doc => mapTransactionRecord(doc as any)),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1
      }
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error listing transactions:`, error);
    res.status(500).json({ message: "Failed to fetch transactions", request_id: req.requestId });
  }
};

export const updateTransaction = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { id } = req.params;
    const orgId = requireOrgId(req);
    const profile = await ensureProfileWithMigration({ orgId, userId: user._id });

    const existing = await TransactionModel.findOne({ _id: id, orgId, userId: user._id });
    if (!existing) {
      return res.status(404).json({ message: "Transaction not found", request_id: req.requestId });
    }

    const updates = req.body as Partial<TransactionInput>;
    const nextType = (updates.type || existing.type) as TransactionType;
    const amountForNormalization =
      updates.amount !== undefined ? updates.amount : Math.abs(existing.amount);
    const source = buildMutationSource(req.requestId, "manual", {
      note: "transaction_update"
    });

    const nextAmount = normalizeTransactionAmount(amountForNormalization, nextType);
    const updateDoc: Record<string, unknown> = {
      type: nextType,
      amount: nextAmount,
      source
    };

    if (updates.category !== undefined) {
      updateDoc.category = updates.category;
    }
    if (updates.description !== undefined) {
      updateDoc.description = updates.description;
    }
    if (updates.date !== undefined) {
      updateDoc.date = new Date(updates.date);
    }

    const updated = await TransactionModel.findOneAndUpdate(
      { _id: id, orgId, userId: user._id },
      { $set: updateDoc },
      { new: true }
    );

    if (updated) {
      const updatedReview = await enrichTransactionsForReview({ orgId, userId: user._id, transactions: [updated.toObject()] });
      const reviewState = updatedReview.get(updated._id.toString());
      if (reviewState) {
        updated.review = { ...reviewState, updatedAt: new Date() } as any;
        await updated.save();
      }
    }

    bumpTransactionMetadata(profile, { deltaCount: 0 });
    setProfileMutationSource(profile, source);
    await profile.save();

    return res.json({
      message: "Transaction updated",
      source,
      transaction: updated ? mapTransactionRecord(updated.toObject()) : mapTransactionRecord(existing.toObject())
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error updating transaction:`, error);
    return res.status(500).json({ message: "Failed to update transaction", request_id: req.requestId });
  }
};

export const deleteTransaction = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { id } = req.params;
    const orgId = requireOrgId(req);
    const profile = await ensureProfileWithMigration({ orgId, userId: user._id });

    const deleted = await TransactionModel.findOneAndDelete({ _id: id, orgId, userId: user._id });
    if (!deleted) {
      return res.status(404).json({ message: "Transaction not found", request_id: req.requestId });
    }

    const now = new Date();
    const newCount = await TransactionModel.countDocuments({ orgId, userId: user._id });
    const source = buildMutationSource(req.requestId, "manual", {
      note: "transaction_delete"
    });
    bumpTransactionMetadata(profile, { setCount: newCount, at: now });
    setProfileMutationSource(profile, source);
    await profile.save();

    return res.json({
      message: "Transaction deleted",
      source,
      transaction_id: id
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error deleting transaction:`, error);
    return res.status(500).json({ message: "Failed to delete transaction", request_id: req.requestId });
  }
};

export const listRecentTransactions = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const limitRaw = Number((req.query as any)?.limit ?? 5);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 50) : 5;

    const orgId = requireOrgId(req);
    await ensureProfileWithMigration({ orgId, userId: user._id });

    const docs = await TransactionModel.find({ orgId, userId: user._id }).sort({ date: -1 }).limit(limit).lean();

    return res.json({
      transactions: docs.map(doc => mapTransactionRecord(doc as any))
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error fetching recent transactions:`, error);
    return res.status(500).json({ message: "Failed to fetch recent transactions", request_id: req.requestId });
  }
};

export const getTransactionsSummary = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const query = req.query as any;
    const from = new Date(query.from);
    const to = new Date(query.to);
    const groupBy = String(query.groupBy || "month");
    const topCategoriesRaw = Number(query.topCategories ?? 6);
    const topCategories = Number.isFinite(topCategoriesRaw) ? Math.min(Math.max(1, topCategoriesRaw), 20) : 6;

    const orgId = requireOrgId(req);
    const profile = await ensureProfileWithMigration({ orgId, userId: user._id });

    const profileTxUpdatedAt = profile.transactionsUpdatedAt
      ? new Date(profile.transactionsUpdatedAt as unknown as Date).toISOString()
      : "";

    const fromIso = new Date(from).toISOString();
    const toIso = new Date(to).toISOString();

    const cacheKey = buildTransactionsSummaryCacheKey({
      orgId: orgId.toString(),
      userId: user._id.toString(),
      from: fromIso,
      to: toIso,
      groupBy,
      topCategories,
      transactionsUpdatedAt: profileTxUpdatedAt
    });

    const cached = await getCachedResponse<any>({ cacheKey });
    if (cached && typeof cached === "object") {
      recordResponseCache({ endpoint: "transactions-summary", hit: true });
      return res.json({ ...(cached as any), cache_hit: true });
    }

    recordResponseCache({ endpoint: "transactions-summary", hit: false });

    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    // Compute top categories for the month that includes `toDate` (usually current month).
    const topMonthStart = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
    topMonthStart.setHours(0, 0, 0, 0);
    const topMatchFrom = topMonthStart.getTime() < fromDate.getTime() ? fromDate : topMonthStart;
    const topMatchTo = toDate;
    const topCategoriesMonth = `${topMonthStart.getFullYear()}-${String(topMonthStart.getMonth() + 1).padStart(2, "0")}`;

    const [agg] = await TransactionModel.aggregate([
      {
        $match: {
          orgId,
          userId: user._id,
          date: { $gte: fromDate, $lte: toDate }
        }
      },
      {
        $facet: {
          monthly: [
            {
              $addFields: {
                month: {
                  $dateToString: { format: "%Y-%m", date: "$date" }
                }
              }
            },
            {
              $group: {
                _id: "$month",
                income: {
                  $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] }
                },
                expense: {
                  $sum: { $cond: [{ $eq: ["$type", "expense"] }, { $abs: "$amount" }, 0] }
                }
              }
            },
            { $sort: { _id: 1 } }
          ],
          expense_total: [
            { $match: { type: "expense", date: { $gte: topMatchFrom, $lte: topMatchTo } } },
            { $group: { _id: null, total: { $sum: { $abs: "$amount" } } } }
          ],
          top_categories: [
            { $match: { type: "expense", date: { $gte: topMatchFrom, $lte: topMatchTo } } },
            { $group: { _id: "$category", amount: { $sum: { $abs: "$amount" } } } },
            { $sort: { amount: -1 } },
            { $limit: topCategories }
          ]
        }
      }
    ]);

    const monthlyRaw = Array.isArray(agg?.monthly) ? agg.monthly : [];
    const monthly = monthlyRaw.map((row: any) => ({
      month: String(row?._id),
      income: Number(row?.income || 0),
      expense: Number(row?.expense || 0),
      net: Number(row?.income || 0) - Number(row?.expense || 0)
    }));

    const expenseTotal = Array.isArray(agg?.expense_total) && agg.expense_total.length > 0
      ? Number(agg.expense_total[0]?.total || 0)
      : 0;

    const topRaw = Array.isArray(agg?.top_categories) ? agg.top_categories : [];
    const top_categories = topRaw.map((row: any) => {
      const amount = Number(row?.amount || 0);
      return {
        category: String(row?._id || "Other"),
        amount,
        percentage: expenseTotal > 0 ? Math.round((amount / expenseTotal) * 1000) / 10 : 0
      };
    });

    const responsePayload = {
      period: {
        from: fromDate.toISOString().slice(0, 10),
        to: toDate.toISOString().slice(0, 10),
        groupBy: groupBy
      },
      monthly,
      top_categories,
      top_categories_month: topCategoriesMonth
    };

    await setCachedResponse({
      cacheKey,
      orgId,
      userId: user._id,
      endpoint: "transactions-summary",
      responseData: responsePayload,
      ttlMs: responseCacheTtlMs.transactionsSummary,
    });

    return res.json({ ...responsePayload, cache_hit: false });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error building transactions summary:`, error);
    return res.status(500).json({ message: "Failed to build transactions summary", request_id: req.requestId });
  }
};

export const createGoal = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const profile = await ensureProfile({ orgId, userId: user._id });
    const source = buildMutationSource(req.requestId, "manual", { note: "goal_create" });

    profile.goals.push(req.body);
    setProfileMutationSource(profile, source);
    await profile.save();

    const createdGoal = profile.goals[profile.goals.length - 1];

    res.status(201).json({
      message: "Goal created",
      source,
      goal: mapGoal(createdGoal)
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error creating goal:`, error);
    res.status(500).json({ message: "Failed to create goal", request_id: req.requestId });
  }
};

export const updateGoal = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const goalId = getSingleParam(req.params.goalId);
    if (!goalId) {
      return res.status(400).json({ message: "Invalid goal ID", request_id: req.requestId });
    }
    const orgId = requireOrgId(req);
    const profile = await ensureProfile({ orgId, userId: user._id });
    const source = buildMutationSource(req.requestId, "manual", { note: "goal_update" });

    const { goal } = findGoal(profile, goalId);
    if (!goal) {
      return res.status(404).json({ message: "Goal not found", request_id: req.requestId });
    }

    const updates = req.body as Partial<IFinancialGoal>;
    if (updates.name !== undefined) {
      goal.name = updates.name;
    }
    if (updates.target !== undefined) {
      goal.target = updates.target;
    }
    if (updates.current !== undefined) {
      goal.current = updates.current;
    }
    if (updates.deadline !== undefined) {
      goal.deadline = updates.deadline;
    }
    if (updates.priority !== undefined) {
      goal.priority = updates.priority;
    }

    setProfileMutationSource(profile, source);
    await profile.save();

    return res.json({
      message: "Goal updated",
      source,
      goal: mapGoal(goal)
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error updating goal:`, error);
    return res.status(500).json({ message: "Failed to update goal", request_id: req.requestId });
  }
};

export const deleteGoal = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const goalId = getSingleParam(req.params.goalId);
    if (!goalId) {
      return res.status(400).json({ message: "Invalid goal ID", request_id: req.requestId });
    }
    const orgId = requireOrgId(req);
    const profile = await ensureProfile({ orgId, userId: user._id });
    const source = buildMutationSource(req.requestId, "manual", { note: "goal_delete" });

    const { goalIndex } = findGoal(profile, goalId);
    if (goalIndex === -1) {
      return res.status(404).json({ message: "Goal not found", request_id: req.requestId });
    }

    profile.goals.splice(goalIndex, 1);
    setProfileMutationSource(profile, source);
    await profile.save();

    return res.json({
      message: "Goal deleted",
      source,
      goal_id: goalId
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error deleting goal:`, error);
    return res.status(500).json({ message: "Failed to delete goal", request_id: req.requestId });
  }
};

export const createDebt = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const profile = await ensureProfile({ orgId, userId: user._id });
    const source = buildMutationSource(req.requestId, "manual", { note: "debt_create" });

    profile.debts.push(req.body);
    setProfileMutationSource(profile, source);
    await profile.save();

    const createdDebt = profile.debts[profile.debts.length - 1];

    res.status(201).json({
      message: "Debt created",
      source,
      debt: mapDebt(createdDebt)
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error creating debt:`, error);
    res.status(500).json({ message: "Failed to create debt", request_id: req.requestId });
  }
};

export const updateDebt = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const debtId = getSingleParam(req.params.debtId);
    if (!debtId) {
      return res.status(400).json({ message: "Invalid debt ID", request_id: req.requestId });
    }
    const orgId = requireOrgId(req);
    const profile = await ensureProfile({ orgId, userId: user._id });
    const source = buildMutationSource(req.requestId, "manual", { note: "debt_update" });

    const { debt } = findDebt(profile, debtId);
    if (!debt) {
      return res.status(404).json({ message: "Debt not found", request_id: req.requestId });
    }

    const updates = req.body as Partial<IDebt>;
    if (updates.name !== undefined) {
      debt.name = updates.name;
    }
    if (updates.balance !== undefined) {
      debt.balance = updates.balance;
    }
    if (updates.interest_rate !== undefined) {
      debt.interest_rate = updates.interest_rate;
    }
    if (updates.minimum_payment !== undefined) {
      debt.minimum_payment = updates.minimum_payment;
    }
    if (updates.type !== undefined) {
      debt.type = updates.type;
    }

    setProfileMutationSource(profile, source);
    await profile.save();

    return res.json({
      message: "Debt updated",
      source,
      debt: mapDebt(debt)
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error updating debt:`, error);
    return res.status(500).json({ message: "Failed to update debt", request_id: req.requestId });
  }
};

export const deleteDebt = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const debtId = getSingleParam(req.params.debtId);
    if (!debtId) {
      return res.status(400).json({ message: "Invalid debt ID", request_id: req.requestId });
    }
    const orgId = requireOrgId(req);
    const profile = await ensureProfile({ orgId, userId: user._id });
    const source = buildMutationSource(req.requestId, "manual", { note: "debt_delete" });

    const { debtIndex } = findDebt(profile, debtId);
    if (debtIndex === -1) {
      return res.status(404).json({ message: "Debt not found", request_id: req.requestId });
    }

    profile.debts.splice(debtIndex, 1);
    setProfileMutationSource(profile, source);
    await profile.save();

    return res.json({
      message: "Debt deleted",
      source,
      debt_id: debtId
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error deleting debt:`, error);
    return res.status(500).json({ message: "Failed to delete debt", request_id: req.requestId });
  }
};

export const getDashboardSummary = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const profile = await ensureProfileWithMigration({ orgId, userId: user._id });

    const now = new Date();
    const currentMonth = monthKey(now);

    const profileUpdatedAt = profile.updatedAt ? new Date(profile.updatedAt).toISOString() : "";
    const transactionsUpdatedAt = profile.transactionsUpdatedAt
      ? new Date(profile.transactionsUpdatedAt as unknown as Date).toISOString()
      : "";

    const latestTask = await TaskModel.findOne({ orgId, userId: user._id })
      .sort({ updatedAt: -1 })
      .select({ updatedAt: 1 })
      .lean();
    const tasksUpdatedAt = latestTask?.updatedAt ? new Date(latestTask.updatedAt).toISOString() : "";

    const cacheKey = buildDashboardSummaryCacheKey({
      orgId: orgId.toString(),
      userId: user._id.toString(),
      monthKey: currentMonth,
      profileUpdatedAt,
      transactionsUpdatedAt,
      tasksUpdatedAt,
    });

    const cached = await getCachedResponse<any>({ cacheKey });
    if (cached && typeof cached === "object") {
      recordResponseCache({ endpoint: "dashboard-summary", hit: true });
      return res.json({ ...(cached as any), cache_hit: true });
    }

    recordResponseCache({ endpoint: "dashboard-summary", hit: false });

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const reviewCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    const [
      monthlyRows,
      topCategoriesRows,
      taskOpen,
      taskCompleted,
      taskDismissed,
      nextTasks,
      uncategorizedCount,
      needsMerchantMatchCount,
      duplicateRows,
      budgetEnvelopeSnapshot,
      recurringCandidateResult,
      upcomingReminderCount,
    ] = await Promise.all([
      TransactionModel.aggregate([
        {
          $match: {
            orgId,
            userId: user._id,
            date: { $gte: prevMonthStart, $lte: now }
          }
        },
        {
          $addFields: {
            month: { $dateToString: { format: "%Y-%m", date: "$date" } }
          }
        },
        {
          $group: {
            _id: "$month",
            income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
            expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, { $abs: "$amount" }, 0] } }
          }
        }
      ]),
      TransactionModel.aggregate([
        {
          $match: {
            orgId,
            userId: user._id,
            type: "expense",
            date: { $gte: monthStart, $lte: now }
          }
        },
        { $group: { _id: "$category", amount: { $sum: { $abs: "$amount" } } } },
        { $sort: { amount: -1 } },
        { $limit: 6 }
      ]),
      TaskModel.countDocuments({ orgId, userId: user._id, status: "open" }),
      TaskModel.countDocuments({ orgId, userId: user._id, status: "completed" }),
      TaskModel.countDocuments({ orgId, userId: user._id, status: "dismissed" }),
      TaskModel.find({ orgId, userId: user._id, status: "open" })
        .sort({ dueDate: 1, createdAt: -1 })
        .limit(5)
        .lean(),
      TransactionModel.countDocuments({
        orgId,
        userId: user._id,
        category: { $in: [/^other$/i, /^uncategorized$/i, /^misc$/i] },
      }),
      TransactionModel.countDocuments({
        orgId,
        userId: user._id,
        merchantId: { $exists: false },
        type: { $in: ["expense", "investment"] },
      }),
      TransactionModel.aggregate([
        {
          $match: {
            orgId,
            userId: user._id,
            date: { $gte: reviewCutoff },
          }
        },
        {
          $group: {
            _id: {
              amount: "$amount",
              description: "$description",
              date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            },
            count: { $sum: 1 },
          }
        },
        { $match: { count: { $gt: 1 } } },
      ]),
      getBudgetEnvelopes({ orgId, periodKey: currentMonth }).catch(() => null),
      detectRecurringCandidates({ orgId, daysBack: 365, limit: 8, minOccurrences: 3 }).catch(() => ({
        org_id: orgId.toString(),
        days_back: 365,
        candidates: [],
      })),
      CalendarReminderModel.countDocuments({
        orgId,
        userId: user._id,
        completed: false,
        date: { $gte: now.toISOString().slice(0, 10) },
      }),
    ]);

    const currentKey = currentMonth;
    const previousKey = monthKey(prevMonthStart);

    const currentExpense = Number(monthlyRows.find((row: any) => row._id === currentKey)?.expense || 0);
    const previousExpense = Number(monthlyRows.find((row: any) => row._id === previousKey)?.expense || 0);
    const spendingChangePct =
      previousExpense > 0 ? ((currentExpense - previousExpense) / previousExpense) * 100 : 0;

    const monthlyIncome = Number(profile.annual_income || 0) / 12;
    const monthlyExpenses = Number(profile.monthly_expenses || 0);
    const netCashFlow = monthlyIncome - monthlyExpenses;
    const savingsRate = monthlyIncome > 0 ? (netCashFlow / monthlyIncome) * 100 : 0;
    const emergencyFundMonths =
      monthlyExpenses > 0 ? Number(profile.savings || 0) / monthlyExpenses : null;

    const goals = Array.isArray(profile.goals) ? (profile.goals as IFinancialGoal[]) : [];
    const totalGoalTarget = goals.reduce((sum, goal) => sum + Number(goal.target || 0), 0);
    const totalGoalCurrent = goals.reduce((sum, goal) => sum + Number(goal.current || 0), 0);
    const goalsProgressPct = totalGoalTarget > 0 ? (totalGoalCurrent / totalGoalTarget) * 100 : 0;
    const goalsOnTrack = goals.filter(goal => Number(goal.target || 0) > 0 && Number(goal.current || 0) / Number(goal.target) >= 0.5).length;

    const completeness = {
      has_income: Number(profile.annual_income) > 0,
      has_expenses: Number(profile.monthly_expenses) > 0,
      has_goals: goals.length > 0,
      has_debts: Array.isArray(profile.debts) && profile.debts.length > 0,
      has_transactions: Number(profile.transactionsCount || 0) > 0
    };

    const duplicateGroups = Array.isArray(duplicateRows) ? duplicateRows.length : 0;
    const monthlyClose = {
      period_key: currentMonth,
      status: "ready",
      totals: {
        income: Number(monthlyRows.find((row: any) => row._id === currentKey)?.income || 0),
        expenses: currentExpense,
        net: Number(monthlyRows.find((row: any) => row._id === currentKey)?.income || 0) - currentExpense,
        tx_count: Number(profile.transactionsCount || 0),
      },
      budget:
        budgetEnvelopeSnapshot
          ? {
              planned: budgetEnvelopeSnapshot.totals.planned,
              spent: budgetEnvelopeSnapshot.totals.spent,
              remaining: budgetEnvelopeSnapshot.totals.remaining,
              unbudgeted_spent: budgetEnvelopeSnapshot.totals.unbudgeted_spent,
            }
          : null,
      ready_to_close:
        Boolean(profile.transactionsCount) &&
        uncategorizedCount === 0 &&
        duplicateGroups === 0 &&
        Number(budgetEnvelopeSnapshot?.totals?.unbudgeted_spent || 0) === 0,
    };

    await MonthCloseModel.findOneAndUpdate(
      { orgId, periodKey: currentMonth },
      {
        $set: {
          createdByUserId: user._id,
          status: "succeeded",
          totals: monthlyClose.totals,
          budget: monthlyClose.budget || {},
          topCategories: topCategoriesRows.slice(0, 5).map((row: any) => ({
            category: String(row?._id || "Other"),
            spent: Number(row?.amount || 0),
          })),
          metadata: {
            source: "dashboard_summary",
            ready_to_close: monthlyClose.ready_to_close,
          },
        },
      },
      { upsert: true, new: true }
    ).catch(() => null);

    const anomalies = [
      spendingChangePct >= 20
        ? {
            id: "spending_spike",
            title: "Spending is running above last month",
            severity: spendingChangePct >= 40 ? "high" : "medium",
            metric: Number(spendingChangePct.toFixed(1)),
            detail: `Current-month expenses are up ${spendingChangePct.toFixed(1)}% versus last month.`,
          }
        : null,
      Number(budgetEnvelopeSnapshot?.totals?.unbudgeted_spent || 0) > 0
        ? {
            id: "unbudgeted_spend",
            title: "Unbudgeted spend needs categorization",
            severity: "medium",
            metric: Number(budgetEnvelopeSnapshot?.totals?.unbudgeted_spent || 0),
            detail: `${Number(budgetEnvelopeSnapshot?.totals?.unbudgeted_spent || 0).toFixed(0)} is outside your planned envelopes.`,
          }
        : null,
      recurringCandidateResult.candidates.length > 0
        ? {
            id: "recurring_candidates",
            title: "Recurring charges detected",
            severity: "low",
            metric: recurringCandidateResult.candidates.length,
            detail: `${recurringCandidateResult.candidates.length} charges look recurring and can be formalized into reminders or rules.`,
          }
        : null,
    ].filter(Boolean);

    const responsePayload = {
      generated_at: now.toISOString(),
      cash_flow: {
        monthly_income: monthlyIncome,
        monthly_expenses: monthlyExpenses,
        net: netCashFlow,
        savings_rate_pct: savingsRate
      },
      savings: {
        balance: Number(profile.savings || 0),
        emergency_fund_months: emergencyFundMonths
      },
      goals: {
        total_count: goals.length,
        on_track: goalsOnTrack,
        total_target: totalGoalTarget,
        total_current: totalGoalCurrent,
        progress_pct: goalsProgressPct
      },
      spending: {
        current_month_total: currentExpense,
        previous_month_total: previousExpense,
        change_pct: spendingChangePct,
        top_categories: topCategoriesRows.map((row: any) => ({
          category: String(row?._id || "Other"),
          amount: Number(row?.amount || 0)
        }))
      },
      tasks: {
        open: taskOpen,
        completed: taskCompleted,
        dismissed: taskDismissed,
        upcoming: nextTasks.map(task => ({
          id: task._id,
          title: task.title,
          dueDate: task.dueDate,
          priority: task.priority
        }))
      },
      review_queue: {
        needs_attention: uncategorizedCount + needsMerchantMatchCount + duplicateGroups,
        uncategorized: uncategorizedCount,
        needs_merchant_match: needsMerchantMatchCount,
        suspected_duplicates: duplicateGroups,
        recurring_candidates: recurringCandidateResult.candidates.length,
      },
      monthly_close: monthlyClose,
      signals: {
        anomalies,
        recurring_candidates: recurringCandidateResult.candidates.slice(0, 3).map((candidate) => ({
          id: candidate.candidate_id,
          title: candidate.description_sample,
          confidence: candidate.confidence,
          cadence: candidate.cadence,
        })),
        upcoming_reminders: upcomingReminderCount,
      },
      completeness
    };

    await setCachedResponse({
      cacheKey,
      orgId,
      userId: user._id,
      endpoint: "dashboard-summary",
      responseData: responsePayload,
      ttlMs: responseCacheTtlMs.dashboardSummary,
    });

    return res.json({ ...responsePayload, cache_hit: false });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error building dashboard summary:`, error);
    return res.status(500).json({ message: "Failed to build dashboard summary", request_id: req.requestId });
  }
};

export const getPortfolioSummary = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const monthsRaw = Number((req.query as any)?.months ?? 12);
    const months = Number.isFinite(monthsRaw) ? Math.min(Math.max(1, monthsRaw), 36) : 12;

    const orgId = requireOrgId(req);
    const profile = await ensureProfileWithMigration({ orgId, userId: user._id });

    const now = new Date();
    const currentMonth = monthKey(now);

    const transactionsUpdatedAt = profile.transactionsUpdatedAt
      ? new Date(profile.transactionsUpdatedAt as unknown as Date).toISOString()
      : "";

    const cacheKey = buildPortfolioSummaryCacheKey({
      orgId: orgId.toString(),
      userId: user._id.toString(),
      monthKey: currentMonth,
      months,
      transactionsUpdatedAt,
    });

    const cached = await getCachedResponse<any>({ cacheKey });
    if (cached && typeof cached === "object") {
      recordResponseCache({ endpoint: "portfolio-summary", hit: true });
      return res.json({ ...(cached as any), cache_hit: true });
    }

    recordResponseCache({ endpoint: "portfolio-summary", hit: false });

    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const investmentTx = await TransactionModel.find({ orgId, userId: user._id, type: "investment" })
      .sort({ date: 1 })
      .lean();

    const holdingsMap = new Map<string, { name: string; asset_class: string; invested_amount: number }>();
    const monthlyContributionMap = new Map<string, number>();

    for (const tx of investmentTx) {
      const amount = Math.abs(Number(tx.amount || 0));
      const key = String(tx.description || "Investment");
      const existing = holdingsMap.get(key);
      if (existing) {
        existing.invested_amount += amount;
      } else {
        holdingsMap.set(key, {
          name: key,
          asset_class: inferAssetClass(key),
          invested_amount: amount
        });
      }

      const keyMonth = monthKey(new Date(tx.date));
      monthlyContributionMap.set(keyMonth, Number(monthlyContributionMap.get(keyMonth) || 0) + amount);
    }

    const totalInvested = Array.from(holdingsMap.values()).reduce((sum, item) => sum + item.invested_amount, 0);
    const currentMonthInvested = investmentTx
      .filter(tx => new Date(tx.date) >= currentMonthStart)
      .reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
    const previousMonthInvested = investmentTx
      .filter(tx => {
        const date = new Date(tx.date);
        return date >= previousMonthStart && date <= previousMonthEnd;
      })
      .reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);

    const monthOverMonthChangePct =
      previousMonthInvested > 0
        ? ((currentMonthInvested - previousMonthInvested) / previousMonthInvested) * 100
        : 0;

    const cursor = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    let cumulative = 0;
    const performance: Array<{ month: string; invested: number; cumulative: number }> = [];
    for (let index = 0; index < months; index += 1) {
      const key = monthKey(cursor);
      const invested = Number(monthlyContributionMap.get(key) || 0);
      cumulative += invested;
      performance.push({ month: key, invested, cumulative });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const assetTotals = new Map<string, number>();
    for (const holding of holdingsMap.values()) {
      assetTotals.set(
        holding.asset_class,
        Number(assetTotals.get(holding.asset_class) || 0) + Number(holding.invested_amount || 0)
      );
    }

    const allocations = Array.from(assetTotals.entries()).map(([name, amount]) => ({
      name,
      amount,
      percentage: totalInvested > 0 ? (amount / totalInvested) * 100 : 0
    }));

    const holdings = Array.from(holdingsMap.values())
      .map(holding => ({
        ...holding,
        weight_percentage: totalInvested > 0 ? (holding.invested_amount / totalInvested) * 100 : 0
      }))
      .sort((left, right) => right.invested_amount - left.invested_amount);

    const recentContributions = performance.slice(-3);
    const monthlySip =
      recentContributions.length > 0
        ? recentContributions.reduce((sum, row) => sum + row.invested, 0) / recentContributions.length
        : 0;

    const responsePayload = {
      generated_at: now.toISOString(),
      summary: {
        total_invested: totalInvested,
        monthly_sip_estimate: monthlySip,
        current_month_invested: currentMonthInvested,
        previous_month_invested: previousMonthInvested,
        month_over_month_change_pct: monthOverMonthChangePct,
        total_return_pct: null,
        returns_basis: "not_available_without_live_market_values"
      },
      allocations,
      holdings,
      performance,
      assumptions: [
        "Portfolio values use recorded investment transactions as invested capital.",
        "Return percentage is unavailable until live/mark-to-market valuations are integrated."
      ]
    };

    await setCachedResponse({
      cacheKey,
      orgId,
      userId: user._id,
      endpoint: "portfolio-summary",
      responseData: responsePayload,
      ttlMs: responseCacheTtlMs.portfolioSummary,
    });

    return res.json({ ...responsePayload, cache_hit: false });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error building portfolio summary:`, error);
    return res.status(500).json({ message: "Failed to build portfolio summary", request_id: req.requestId });
  }
};

// ── Command Center ──────────────────────────────────────────────────────────
import { buildCommandCenterPayload } from "../services/commandCenterService";

export const getCommandCenter = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    await ensureProfileWithMigration({ orgId, userId: user._id });

    const payload = await buildCommandCenterPayload({ orgId, userId: user._id });
    return res.json(payload);
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error building command center:`, error);
    return res.status(500).json({ message: "Failed to build command center", request_id: req.requestId });
  }
};

// ── Budget Health ───────────────────────────────────────────────────────────
import { buildBudgetHealthPayload } from "../services/budgetHealthService";

export const getBudgetHealth = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    await ensureProfileWithMigration({ orgId, userId: user._id });

    const payload = await buildBudgetHealthPayload({ orgId, userId: user._id });
    return res.json(payload);
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error building budget health:`, error);
    return res.status(500).json({ message: "Failed to build budget health", request_id: req.requestId });
  }
};

// ── Transaction Approve / Bulk Approve / Always Categorize ──────────────────
import {
  approveTransaction as approveTransactionService,
  bulkApproveTransactions as bulkApproveTransactionsService,
} from "../services/transactionReview";
import CategoryRuleModel from "../models/categoryRuleModel";

export const approveTransactionEndpoint = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const id = String(req.params.id || "");
    const orgId = requireOrgId(req);

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid transaction ID", request_id: req.requestId });
    }

    const updated = await approveTransactionService({
      orgId,
      userId: user._id,
      transactionId: id,
      reviewedBy: user._id.toString(),
    });

    if (!updated) {
      return res.status(404).json({ message: "Transaction not found", request_id: req.requestId });
    }

    return res.json({
      message: "Transaction approved",
      transaction: mapTransactionRecord(updated.toObject()),
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error approving transaction:`, error);
    return res.status(500).json({ message: "Failed to approve transaction", request_id: req.requestId });
  }
};

export const bulkApproveEndpoint = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const { transaction_ids } = req.body as { transaction_ids: string[] };

    if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      return res.status(400).json({ message: "transaction_ids array required", request_id: req.requestId });
    }

    if (transaction_ids.length > 200) {
      return res.status(400).json({ message: "Maximum 200 transactions per bulk approve", request_id: req.requestId });
    }

    const result = await bulkApproveTransactionsService({
      orgId,
      userId: user._id,
      transactionIds: transaction_ids,
      reviewedBy: user._id.toString(),
    });

    return res.json({
      message: "Transactions approved",
      modified: result.modified,
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error bulk approving transactions:`, error);
    return res.status(500).json({ message: "Failed to bulk approve", request_id: req.requestId });
  }
};

export const alwaysCategorizeEndpoint = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const id = String(req.params.id || "");
    const orgId = requireOrgId(req);

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid transaction ID", request_id: req.requestId });
    }

    const transaction = await TransactionModel.findOne({ _id: id, orgId, userId: user._id }).lean();
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found", request_id: req.requestId });
    }

    const description = String(transaction.description || "").trim();
    const category = String(transaction.category || "").trim();

    if (!description || !category) {
      return res.status(400).json({ message: "Transaction needs both description and category to create a rule", request_id: req.requestId });
    }

    // Create or update a category rule for this description pattern
    const rule = await CategoryRuleModel.findOneAndUpdate(
      {
        orgId,
        pattern: description.toLowerCase(),
      },
      {
        $set: {
          orgId,
          userId: user._id,
          pattern: description.toLowerCase(),
          targetCategory: category,
          matchType: "exact",
          matchField: "description" as const,
          merchantId: transaction.merchantId || undefined,
          enabled: true,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
          priority: 0,
          appliedCount: 0,
        },
      },
      { upsert: true, new: true }
    );

    // Also approve the transaction itself
    await approveTransactionService({
      orgId,
      userId: user._id,
      transactionId: id,
      reviewedBy: user._id.toString(),
    });

    return res.json({
      message: "Category rule created and transaction approved",
      rule: {
        id: rule._id?.toString(),
        pattern: rule.pattern,
        category: rule.targetCategory,
      },
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error creating category rule:`, error);
    return res.status(500).json({ message: "Failed to create category rule", request_id: req.requestId });
  }
};
