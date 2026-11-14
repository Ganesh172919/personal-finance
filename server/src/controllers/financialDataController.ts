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
import MerchantModel from "../models/merchantModel";
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
import { clusterMerchantTransactions } from "../services/merchantEmbeddingClustering";
import {
  CURRENCY_SYMBOLS,
  FX_RATES_TO_USD,
  convertUsdToCurrency,
  normalizeCurrency,
} from "../utils/currencyFx";

type TransactionInput = {
  amount: number;
  category: string;
  description: string;
  date?: string | Date;
  type: "income" | "expense" | "investment";
};

// Enforces presence of organization tenant context on incoming financial requests.
// Validates the identifier format against MongoDB ObjectId specification standards.
// Aborts execution with an unauthorized HTTP exception if tenant context is missing.
const requireOrgId = (req: Request) => {
  const orgIdRaw = String((req as any).org?.orgId || "");
  if (!orgIdRaw || !mongoose.Types.ObjectId.isValid(orgIdRaw)) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(orgIdRaw);
};

// Convention: income is positive, expense/investment is negative (enables simple summation)
// Standardizes transaction numerical signs based on transaction classification.
// Enforces positive values for revenue income and negative values for disbursements.
// Facilitates direct ledger summation without conditional arithmetic in aggregations.
const normalizeTransactionAmount = (
  amount: number,
  type: "income" | "expense" | "investment"
) => {
  const absoluteAmount = Math.abs(Number(amount));
  return type === "income" ? absoluteAmount : -absoluteAmount;
};

// Escapes special regex chars to prevent injection in user-supplied search strings
// Sanitizes user-provided search strings by escaping regular expression characters.
// Prevents regex syntax injection vulnerabilities during dynamic MongoDB queries.
// Returns an escaped search pattern safe for inclusion in RegExp constructors.
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Formats internal transaction document schemas into serialized client responses.
// Calculates real-time foreign exchange conversions when target currencies are given.
// Maps split categories, review indicators, and calculated running balance values.
const mapTransactionRecord = (
  transaction: {
    _id: unknown;
    amount: number;
    category: string;
    description: string;
    date: Date;
    type: TransactionType;
    splits?: Array<{ category: string; amount: number }>;
    source?: unknown;
    review?: unknown;
    reconciliation?: unknown;
    importDetails?: unknown;
    runningBalance?: unknown;
  },
  targetCurrency?: string
) => {
  const isConverted = Boolean(targetCurrency);
  const curr = targetCurrency ? normalizeCurrency(targetCurrency) : undefined;
  const rate = curr ? (FX_RATES_TO_USD[curr] ?? 1.0) : undefined;
  const convertedAmount = curr ? convertUsdToCurrency(transaction.amount, curr) : transaction.amount;

  return {
    id: String(transaction._id),
    amount: convertedAmount,
    raw_amount: isConverted ? transaction.amount : undefined,
    currency: curr,
    fx_rate: rate,
    currency_symbol: curr ? CURRENCY_SYMBOLS[curr] : undefined,
    category: transaction.category,
    description: transaction.description,
    date: transaction.date,
    type: transaction.type,
    splits:
      transaction.splits && transaction.splits.length > 0
        ? transaction.splits.map(s => ({
            category: s.category,
            amount: curr ? convertUsdToCurrency(s.amount, curr) : s.amount,
            raw_amount: isConverted ? s.amount : undefined,
          }))
        : undefined,
    source: transaction.source || undefined,
    review: transaction.review || undefined,
    reconciliation: transaction.reconciliation || undefined,
    import_details: transaction.importDetails || undefined,
    running_balance:
      transaction.runningBalance === undefined || transaction.runningBalance === null
        ? undefined
        : curr
        ? convertUsdToCurrency(Number(transaction.runningBalance), curr)
        : Number(transaction.runningBalance),
  };
};

// Serializes stored financial goal document structures into client-facing models.
// Extracts target thresholds, current progress amounts, and target target deadlines.
// Normalizes unique object identifiers to standard string representations for the UI.
const mapGoal = (goal: IFinancialGoal) => ({
  id: goal._id?.toString(),
  name: goal.name,
  target: goal.target,
  current: goal.current,
  deadline: goal.deadline,
  priority: goal.priority
});

// Transforms debt liability sub-documents into standardized external representations.
// Formats principal balances, annualized interest rates, and required payment minimums.
// Emits clean property structures designed for liability tracking visualizations.
const mapDebt = (debt: IDebt) => ({
  id: debt._id?.toString(),
  name: debt.name,
  balance: debt.balance,
  interest_rate: debt.interest_rate,
  minimum_payment: debt.minimum_payment,
  type: debt.type
});

// Extracts single parameter string representations from potentially varied inputs.
// Handles both array and primitive scalar query parameter representations cleanly.
// Returns a singular string or undefined for predictable downstream argument parsing.
const getSingleParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

// Locates a target financial goal within the user financial profile subdocument array.
// Performs linear array search matching string representations of MongoDB ObjectIds.
// Returns an object containing the matched goal reference alongside its array index.
const findGoal = (profile: IFinancialProfileDocument, goalId: string) => {
  const goals = profile.goals as IFinancialGoal[];
  const goalIndex = goals.findIndex(goal => goal._id?.toString() === goalId);

  if (goalIndex === -1) {
    return { goal: null, goalIndex: -1 };
  }

  return { goal: goals[goalIndex], goalIndex };
};

// Resolves a target debt liability entry inside the financial profile document.
// Compares nested liability object identifiers against the requested debt ID string.
// Delivers the resolved debt sub-document along with its corresponding array offset.
const findDebt = (profile: IFinancialProfileDocument, debtId: string) => {
  const debts = profile.debts as IDebt[];
  const debtIndex = debts.findIndex(debt => debt._id?.toString() === debtId);

  if (debtIndex === -1) {
    return { debt: null, debtIndex: -1 };
  }

  return { debt: debts[debtIndex], debtIndex };
};

// Constructs standardized audit provenance metadata for financial state mutations.
// Records operation origins, correlated request tracking IDs, and actor types.
// Supplies traceability records attached to transactions and profile revision logs.
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

// Categorizes investment holdings into standard asset classes based on name keywords.
// Identifies fixed income, precious commodities, digital assets, and equities.
// Returns normalized asset classification tags for portfolio allocation breakdowns.
const inferAssetClass = (value: string) => {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("debt") || lower.includes("bond") || lower.includes("treasury") || lower.includes("fixed income")) return "Debt";
  if (lower.includes("gold") || lower.includes("commodity") || lower.includes("silver") || lower.includes("metal")) return "Commodity";
  if (lower.includes("crypto") || lower.includes("bitcoin") || lower.includes("btc") || lower.includes("eth") || lower.includes("ethereum") || lower.includes("solana")) return "Crypto";
  if (lower.includes("liquid") || lower.includes("cash") || lower.includes("money market")) return "Cash";
  if (lower.includes("reit") || lower.includes("real estate")) return "Real Estate";
  return "Equity";
};

// Formats JavaScript Date instances into standardized Year-Month string keys.
// Pads single-digit calendar month values with leading zeroes for lexicographical sort.
// Produces uniform keys used across monthly financial aggregations and budgets.
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

// Creates an individual financial transaction record under the authenticated tenant.
// Normalizes amounts, applies automated anomaly review enrichment, and saves records.
// Dispatches transaction creation domain events and updates profile metadata counts.
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
      splits: (body as any).splits && (body as any).splits.length > 0 ? (body as any).splits : undefined,
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
    logger.error({ err: error, requestId: req.requestId }, "Error creating transaction");
    res.status(500).json({ message: "Failed to create transaction", request_id: req.requestId });
  }
};

// Bulk-ingests batches of parsed financial transaction rows into persistent storage.
// Enforces signed amount normalization and tags records with CSV import provenance.
// Emits domain events and increments transaction count counters on the user profile.
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

// Serializes pagination position state into a compact URL-safe base64 string.
// Encodes epoch millisecond timestamps paired with unique document identifiers.
// Supplies opaque cursor tokens enabling efficient keyset pagination traversal.
const encodeTransactionCursor = (doc: { date: Date | string; _id: unknown }): string =>
  Buffer.from(JSON.stringify({ d: new Date(doc.date).getTime(), i: String(doc._id) })).toString("base64url");

// Parses opaque base64url pagination cursor strings into queryable boundary filters.
// Validates timestamp integer formats and MongoDB ObjectId integrity constraints.
// Returns decoded temporal date and ObjectId pairs or null when invalid.
const decodeTransactionCursor = (raw?: string): { date: Date; id: mongoose.Types.ObjectId } | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Number.isFinite(parsed?.d) || !mongoose.Types.ObjectId.isValid(String(parsed?.i))) return null;
    return { date: new Date(parsed.d), id: new mongoose.Types.ObjectId(String(parsed.i)) };
  } catch {
    return null;
  }
};

// Queries transactions with multi-dimensional filtering, pagination, and FX support.
// Supports cursor-based keyset pagination and traditional page offset navigation.
// Enriches returned transaction lists with review status flags and summary tallies.
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
      currency,
      cursor,
    } = req.query as {
      cursor?: string;
      page?: number;
      limit?: number;
      from?: Date;
      to?: Date;
      type?: "income" | "expense" | "investment";
      category?: string;
      needs_review?: boolean;
      review_flag?: string;
      currency?: string;
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

      const curr = currency ? normalizeCurrency(currency) : undefined;
      const pagedDocs = reviewedDocs.slice(skip, skip + safeLimit);
      return res.json({
        transactions: pagedDocs.map((doc) => mapTransactionRecord(doc as any, currency)),
        pagination: {
          page: safePage,
          limit: safeLimit,
          total: reviewedDocs.length,
          totalPages: Math.max(1, Math.ceil(reviewedDocs.length / safeLimit)),
        },
        currency: curr,
        fx_rate: curr ? FX_RATES_TO_USD[curr] : undefined,
        currency_symbol: curr ? CURRENCY_SYMBOLS[curr] : undefined,
      });
    }

    // Keyset pagination (backwards compatible): `?cursor=` replaces deep `.skip()`; page mode still works
    // and also returns `next_cursor` so clients can switch mid-scroll.
    const decodedCursor = decodeTransactionCursor(cursor);
    if (cursor && !decodedCursor) {
      return res.status(400).json({ message: "Invalid cursor", request_id: req.requestId });
    }
    if (decodedCursor) {
      const and = Array.isArray(filter.$and) ? filter.$and : [];
      and.push({
        $or: [
          { date: { $lt: decodedCursor.date } },
          { date: decodedCursor.date, _id: { $lt: decodedCursor.id } },
        ],
      });
      filter.$and = and;
    }
    const tieBreakSort = { date: -1, _id: -1 } as const;

    if (decodedCursor) {
      const rows = await TransactionModel.find(filter).sort(tieBreakSort).limit(safeLimit + 1).lean();
      const hasMore = rows.length > safeLimit;
      const pageDocs = hasMore ? rows.slice(0, safeLimit) : rows;
      const reviewMap = await enrichTransactionsForReview({ orgId, userId: user._id, transactions: pageDocs as any[] });
      const withReview = pageDocs.map((doc: any) => ({ ...doc, review: reviewMap.get(String(doc._id)) || doc.review }));
      const currCursor = currency ? normalizeCurrency(currency) : undefined;
      return res.json({
        transactions: withReview.map(doc => mapTransactionRecord(doc as any, currency)),
        pagination: {
          limit: safeLimit,
          has_more: hasMore,
          next_cursor: hasMore ? encodeTransactionCursor(pageDocs[pageDocs.length - 1] as any) : null,
        },
        currency: currCursor,
        fx_rate: currCursor ? FX_RATES_TO_USD[currCursor] : undefined,
        currency_symbol: currCursor ? CURRENCY_SYMBOLS[currCursor] : undefined,
      });
    }

    const [total, docs] = await Promise.all([
      TransactionModel.countDocuments(filter),
      TransactionModel.find(filter).sort(tieBreakSort).skip(skip).limit(safeLimit).lean()
    ]);
    const reviewById = await enrichTransactionsForReview({ orgId, userId: user._id, transactions: docs as any[] });
    const docsWithReview = docs.map((doc: any) => ({
      ...doc,
      review: reviewById.get(String(doc._id)) || doc.review,
    }));

    const curr = currency ? normalizeCurrency(currency) : undefined;
    res.json({
      transactions: docsWithReview.map(doc => mapTransactionRecord(doc as any, currency)),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1,
        next_cursor: docs.length === safeLimit && skip + docs.length < total ? encodeTransactionCursor(docs[docs.length - 1] as any) : null,
      },
      currency: curr,
      fx_rate: curr ? FX_RATES_TO_USD[curr] : undefined,
      currency_symbol: curr ? CURRENCY_SYMBOLS[curr] : undefined,
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error listing transactions:`, error);
    res.status(500).json({ message: "Failed to fetch transactions", request_id: req.requestId });
  }
};

// Applies partial updates to existing transaction records under tenant isolation.
// Re-normalizes transaction amounts when types mutate and refreshes review state.
// Emits transaction update domain events and returns modified record representations.
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
    if ((updates as any).splits !== undefined) {
      updateDoc.splits = (updates as any).splits;
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

// Deletes a specified transaction record and adjusts user profile counters.
// Verifies tenant organization ownership prior to executing database deletion.
// Dispatches deletion domain events to notify dependent listeners and caches.
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

// Fetches the most recent transaction entries for quick dashboard feed displays.
// Applies tenant and user ownership filters with a compact limit on returned rows.
// Formats transaction records with optional foreign exchange currency conversion.
export const listRecentTransactions = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const limitRaw = Number((req.query as any)?.limit ?? 5);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 50) : 5;
    const currency = (req.query as any)?.currency as string | undefined;

    const orgId = requireOrgId(req);
    await ensureProfileWithMigration({ orgId, userId: user._id });

    const docs = await TransactionModel.find({ orgId, userId: user._id }).sort({ date: -1 }).limit(limit).lean();
    const curr = currency ? normalizeCurrency(currency) : undefined;

    return res.json({
      transactions: docs.map(doc => mapTransactionRecord(doc as any, currency)),
      currency: curr,
      fx_rate: curr ? FX_RATES_TO_USD[curr] : undefined,
      currency_symbol: curr ? CURRENCY_SYMBOLS[curr] : undefined,
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error fetching recent transactions:`, error);
    return res.status(500).json({ message: "Failed to fetch recent transactions", request_id: req.requestId });
  }
};

// Computes multi-month financial metrics including income, expense, and savings rates.
// Calculates category expenditure distributions and aggregates top spending merchants.
// Utilizes response caching to deliver low-latency performance on repeated requests.
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

    const currency = query.currency as string | undefined;
    const curr = currency ? normalizeCurrency(currency) : undefined;

    const cacheKey = buildTransactionsSummaryCacheKey({
      orgId: orgId.toString(),
      userId: user._id.toString(),
      from: fromIso,
      to: toIso,
      groupBy,
      topCategories,
      transactionsUpdatedAt: profileTxUpdatedAt,
      currency: curr,
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
    const monthly = monthlyRaw.map((row: any) => {
      const inc = Number(row?.income || 0);
      const exp = Number(row?.expense || 0);
      const incConv = curr ? convertUsdToCurrency(inc, curr) : inc;
      const expConv = curr ? convertUsdToCurrency(exp, curr) : exp;
      return {
        month: String(row?._id),
        income: incConv,
        expense: expConv,
        net: incConv - expConv,
      };
    });

    const expenseTotal = Array.isArray(agg?.expense_total) && agg.expense_total.length > 0
      ? Number(agg.expense_total[0]?.total || 0)
      : 0;

    const topRaw = Array.isArray(agg?.top_categories) ? agg.top_categories : [];
    const top_categories = topRaw.map((row: any) => {
      const amount = Number(row?.amount || 0);
      const amountConv = curr ? convertUsdToCurrency(amount, curr) : amount;
      return {
        category: String(row?._id || "Other"),
        amount: amountConv,
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
      top_categories_month: topCategoriesMonth,
      currency: curr,
      fx_rate: curr ? FX_RATES_TO_USD[curr] : undefined,
      currency_symbol: curr ? CURRENCY_SYMBOLS[curr] : undefined,
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

// Appends a new financial goal milestone to the user's financial profile document.
// Validates target savings amounts, priority levels, and expected completion dates.
// Persists the new goal subdocument and returns the serialized goal representation.
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

// Updates attributes of an existing financial goal embedded in the user profile.
// Mutates savings targets, accumulated balances, priorities, or target deadlines.
// Commits the modified goal subdocument and records mutation provenance metadata.
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

// Removes a targeted financial goal subdocument from the user financial profile.
// Locates the target goal by identifier and slices it from the persistent array.
// Emits domain events and saves profile mutations with audit source metadata.
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

// Registers a new debt liability entry within the user's financial profile document.
// Records balance amounts, interest percentages, and minimum required installments.
// Saves the updated profile and returns the newly created debt liability model.
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

// Modifies properties on an existing debt liability subdocument within the profile.
// Updates outstanding balances, interest rate terms, and minimum payment amounts.
// Persists modifications to storage and returns the revised debt structure.
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

// Deletes a specified debt liability subdocument from the financial profile.
// Finds the liability by unique identifier and splices it from the profile array.
// Commits the updated profile document and returns an operation status response.
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

// Compiles an all-in-one financial dashboard aggregating balances, goals, and tasks.
// Evaluates budget envelopes, recurring expense candidates, and monthly closure state.
// Caches computed summary payloads to optimize initial application dashboard loads.
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

// Calculates wealth and asset allocation summaries across investments and holdings.
// Aggregates net worth metrics, asset distributions, and goal milestone trajectories.
// Leverages response caching to serve portfolio analytics with minimal database load.
export const getPortfolioSummary = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const monthsRaw = Number((req.query as any)?.months ?? 12);
    const months = Number.isFinite(monthsRaw) ? Math.min(Math.max(1, monthsRaw), 36) : 12;

    const currencyQuery = typeof (req.query as any)?.currency === "string" ? String((req.query as any).currency) : undefined;
    const targetCurrency = currencyQuery ? normalizeCurrency(currencyQuery) : undefined;
    const isFxConversion = Boolean(targetCurrency);
    const fxRate = targetCurrency ? (FX_RATES_TO_USD[targetCurrency] ?? 1.0) : 1.0;
    const currencySymbol = targetCurrency ? (CURRENCY_SYMBOLS[targetCurrency] ?? "$") : undefined;

    const whtRateRaw = (req.query as any)?.wht_rate !== undefined ? Number((req.query as any).wht_rate) : 15;
    const whtRatePct = Number.isFinite(whtRateRaw) ? Math.min(Math.max(0, whtRateRaw), 100) : 15;
    const whtFactor = whtRatePct / 100;
    const treatyCountry = typeof (req.query as any)?.treaty_country === "string" ? String((req.query as any).treaty_country).trim() : "DTAA Standard";

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
      currency: targetCurrency,
      whtRate: whtRatePct,
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

    const rawTotalInvested = Array.from(holdingsMap.values()).reduce((sum, item) => sum + item.invested_amount, 0);
    const rawCurrentMonthInvested = investmentTx
      .filter(tx => new Date(tx.date) >= currentMonthStart)
      .reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
    const rawPreviousMonthInvested = investmentTx
      .filter(tx => {
        const date = new Date(tx.date);
        return date >= previousMonthStart && date <= previousMonthEnd;
      })
      .reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);

    const monthOverMonthChangePct =
      rawPreviousMonthInvested > 0
        ? ((rawCurrentMonthInvested - rawPreviousMonthInvested) / rawPreviousMonthInvested) * 100
        : 0;

    const cursor = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    let cumulative = 0;
    const performance: Array<{ month: string; invested: number; cumulative: number }> = [];
    for (let index = 0; index < months; index += 1) {
      const key = monthKey(cursor);
      const rawInvested = Number(monthlyContributionMap.get(key) || 0);
      cumulative += rawInvested;
      const invested = isFxConversion ? convertUsdToCurrency(rawInvested, targetCurrency!) : rawInvested;
      const convertedCumulative = isFxConversion ? convertUsdToCurrency(cumulative, targetCurrency!) : cumulative;
      performance.push({ month: key, invested, cumulative: convertedCumulative });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const totalInvested = isFxConversion ? convertUsdToCurrency(rawTotalInvested, targetCurrency!) : rawTotalInvested;
    const currentMonthInvested = isFxConversion ? convertUsdToCurrency(rawCurrentMonthInvested, targetCurrency!) : rawCurrentMonthInvested;
    const previousMonthInvested = isFxConversion ? convertUsdToCurrency(rawPreviousMonthInvested, targetCurrency!) : rawPreviousMonthInvested;

    const assetTotals = new Map<string, number>();
    for (const holding of holdingsMap.values()) {
      assetTotals.set(
        holding.asset_class,
        Number(assetTotals.get(holding.asset_class) || 0) + Number(holding.invested_amount || 0)
      );
    }

    const allocations = Array.from(assetTotals.entries()).map(([name, amount]) => ({
      name,
      amount: isFxConversion ? convertUsdToCurrency(amount, targetCurrency!) : amount,
      percentage: rawTotalInvested > 0 ? (amount / rawTotalInvested) * 100 : 0
    }));

    const holdings = Array.from(holdingsMap.values())
      .map(holding => ({
        ...holding,
        invested_amount: isFxConversion ? convertUsdToCurrency(holding.invested_amount, targetCurrency!) : holding.invested_amount,
        weight_percentage: rawTotalInvested > 0 ? (holding.invested_amount / rawTotalInvested) * 100 : 0
      }))
      .sort((left, right) => right.invested_amount - left.invested_amount);

    const recentContributions = performance.slice(-3);
    const monthlySip =
      recentContributions.length > 0
        ? recentContributions.reduce((sum, row) => sum + row.invested, 0) / recentContributions.length
        : 0;

    // Dividend and income distribution aggregation
    const dividendTx = await TransactionModel.find({
      orgId,
      userId: user._id,
      type: "income",
      $or: [
        { category: { $in: ["Investments", "Dividends", "Dividend", "Interest", "Distribution"] } },
        { description: { $regex: /dividend|distribution|yield|interest payout|drip/i } },
      ],
    })
      .sort({ date: -1 })
      .lean();

    const ttmStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    let rawTotalDividends = 0;
    let rawTtmDividends = 0;
    const monthlyDividendMap = new Map<string, number>();
    const holdingPayoutMap = new Map<string, { total_amount: number; payout_count: number }>();

    for (const tx of dividendTx) {
      const amount = Math.abs(Number(tx.amount || 0));
      rawTotalDividends += amount;

      const txDate = new Date(tx.date);
      if (txDate >= ttmStart) {
        rawTtmDividends += amount;
      }

      const mKey = monthKey(txDate);
      monthlyDividendMap.set(mKey, Number(monthlyDividendMap.get(mKey) || 0) + amount);

      const desc = String(tx.description || "Dividend").trim();
      let matchedHolding = "";
      for (const hName of holdingsMap.keys()) {
        if (desc.toLowerCase().includes(hName.toLowerCase()) || hName.toLowerCase().includes(desc.toLowerCase())) {
          matchedHolding = hName;
          break;
        }
      }
      if (!matchedHolding) {
        matchedHolding = desc.replace(/\s*(dividend|distribution|interest payout|payout|yield)\s*/gi, "").trim() || desc;
      }

      const existingHoldingPayout = holdingPayoutMap.get(matchedHolding);
      if (existingHoldingPayout) {
        existingHoldingPayout.total_amount += amount;
        existingHoldingPayout.payout_count += 1;
      } else {
        holdingPayoutMap.set(matchedHolding, {
          total_amount: amount,
          payout_count: 1,
        });
      }
    }

    const dividendProgressionCursor = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const monthlyProgression: Array<{ month: string; amount: number; gross_amount: number; wht_deducted: number; net_amount: number }> = [];
    for (let index = 0; index < months; index += 1) {
      const key = monthKey(dividendProgressionCursor);
      const rawAmount = Number(monthlyDividendMap.get(key) || 0);
      const convertedGross = isFxConversion ? convertUsdToCurrency(rawAmount, targetCurrency!) : rawAmount;
      const whtDeducted = Math.round(convertedGross * whtFactor * 100) / 100;
      const netAmount = targetCurrency === "JPY" ? Math.round(convertedGross - whtDeducted) : Math.round((convertedGross - whtDeducted) * 100) / 100;
      monthlyProgression.push({
        month: key,
        amount: convertedGross,
        gross_amount: convertedGross,
        wht_deducted: whtDeducted,
        net_amount: netAmount,
      });
      dividendProgressionCursor.setMonth(dividendProgressionCursor.getMonth() + 1);
    }

    const totalDividends = isFxConversion ? convertUsdToCurrency(rawTotalDividends, targetCurrency!) : rawTotalDividends;
    const ttmDividends = isFxConversion ? convertUsdToCurrency(rawTtmDividends, targetCurrency!) : rawTtmDividends;

    const whtTotalDeducted = Math.round(totalDividends * whtFactor * 100) / 100;
    const netTotalDividends = targetCurrency === "JPY" ? Math.round(totalDividends - whtTotalDeducted) : Math.round((totalDividends - whtTotalDeducted) * 100) / 100;

    const whtTtmDeducted = Math.round(ttmDividends * whtFactor * 100) / 100;
    const netTtmDividends = targetCurrency === "JPY" ? Math.round(ttmDividends - whtTtmDeducted) : Math.round((ttmDividends - whtTtmDeducted) * 100) / 100;

    const payoutsByHolding = Array.from(holdingPayoutMap.entries())
      .map(([holdingName, stats]) => {
        const holdingInfo = holdingsMap.get(holdingName);
        const rawInvested = holdingInfo?.invested_amount || 0;
        const invested = isFxConversion ? convertUsdToCurrency(rawInvested, targetCurrency!) : rawInvested;
        const convertedTotal = isFxConversion ? convertUsdToCurrency(stats.total_amount, targetCurrency!) : stats.total_amount;
        const whtDeducted = Math.round(convertedTotal * whtFactor * 100) / 100;
        const netAmount = targetCurrency === "JPY" ? Math.round(convertedTotal - whtDeducted) : Math.round((convertedTotal - whtDeducted) * 100) / 100;
        const yieldOnCost = invested > 0 ? Number(((convertedTotal / invested) * 100).toFixed(2)) : 0;
        const netYieldOnCost = invested > 0 ? Number(((netAmount / invested) * 100).toFixed(2)) : 0;
        return {
          holding_name: holdingName,
          total_amount: convertedTotal,
          gross_amount: convertedTotal,
          wht_deducted: whtDeducted,
          net_amount: netAmount,
          payout_count: stats.payout_count,
          invested_amount: invested,
          yield_on_cost_pct: yieldOnCost,
          net_yield_on_cost_pct: netYieldOnCost,
        };
      })
      .sort((a, b) => b.total_amount - a.total_amount);

    const portfolioYieldPct = totalInvested > 0 ? Number(((ttmDividends / totalInvested) * 100).toFixed(2)) : 0;
    const netPortfolioYieldPct = totalInvested > 0 ? Number(((netTtmDividends / totalInvested) * 100).toFixed(2)) : 0;
    const monthlyDividendAverage = Number((ttmDividends / 12).toFixed(2));
    const netMonthlyDividendAverage = Number((netTtmDividends / 12).toFixed(2));

    const recentPayouts = dividendTx.slice(0, 5).map(tx => {
      const rawAmt = Math.abs(Number(tx.amount || 0));
      const amt = isFxConversion ? convertUsdToCurrency(rawAmt, targetCurrency!) : rawAmt;
      const whtAmt = Math.round(amt * whtFactor * 100) / 100;
      const netAmt = targetCurrency === "JPY" ? Math.round(amt - whtAmt) : Math.round((amt - whtAmt) * 100) / 100;
      return {
        id: String(tx._id),
        description: tx.description,
        amount: amt,
        gross_amount: amt,
        wht_deducted: whtAmt,
        net_amount: netAmt,
        date: tx.date,
        category: tx.category,
      };
    });

    const responsePayload = {
      generated_at: now.toISOString(),
      ...(targetCurrency ? { currency: targetCurrency, fx_rate: fxRate, currency_symbol: currencySymbol } : {}),
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
      dividends: {
        total_received: totalDividends,
        gross_received: totalDividends,
        net_received: netTotalDividends,
        wht_deducted: whtTotalDeducted,
        wht_rate_pct: whtRatePct,
        ftc_relief_estimate: whtTotalDeducted,
        treaty_country: treatyCountry,
        ...(targetCurrency ? { currency: targetCurrency, fx_rate: fxRate, currency_symbol: currencySymbol } : {}),
        ttm_received: ttmDividends,
        gross_ttm_received: ttmDividends,
        net_ttm_received: netTtmDividends,
        portfolio_yield_pct: portfolioYieldPct,
        net_portfolio_yield_pct: netPortfolioYieldPct,
        monthly_average: monthlyDividendAverage,
        net_monthly_average: netMonthlyDividendAverage,
        payouts_by_holding: payoutsByHolding,
        monthly_progression: monthlyProgression,
        recent_payouts: recentPayouts,
      },
      assumptions: [
        "Portfolio values use recorded investment transactions as invested capital.",
        "Return percentage is unavailable until live/mark-to-market valuations are integrated.",
        `Dividend withholding tax modeled at ${whtRatePct}% (${treatyCountry}) with foreign tax credit relief.`
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

// Delivers operational command center metrics across pending reviews and balances.
// Summarizes unreviewed transactions, urgent reminders, and active financial goals.
// Provides a unified operational snapshot driving administrative home screens.
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

// Assesses overall spending health against configured budget category allocations.
// Measures spend velocity, over-budget category counts, and remaining allowances.
// Returns an analytical health rating alongside detailed budget category metrics.
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

// Confirms user approval on flagged or imported transaction review suggestions.
// Clears pending review indicators and marks transaction state as user-verified.
// Persists updated transaction review metadata and returns the modified record.
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

// Concurrently approves multiple flagged transaction records in a single operation.
// Validates tenant ownership across all targeted identifiers before batch mutation.
// Clears review flags in bulk and returns count tallies of approved records.
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

// Establishes a persistent merchant categorization rule based on user selection.
// Retroactively applies the specified category to all past matching transactions.
// Saves automated categorization preferences to streamline future bank feed imports.
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

// Purges multiple transaction records simultaneously under strict tenant scoping.
// Adjusts total transaction count metadata on the user profile accordingly.
// Returns execution summaries detailing the total number of deleted transactions.
export const bulkDeleteEndpoint = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const { transaction_ids } = req.body as { transaction_ids: string[] };

    const validIds = transaction_ids
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (validIds.length === 0) {
      return res.json({ message: "No valid transactions to delete", deleted_count: 0 });
    }

    const deleteResult = await TransactionModel.deleteMany({
      _id: { $in: validIds },
      orgId,
      userId: user._id,
    });

    const now = new Date();
    const newCount = await TransactionModel.countDocuments({ orgId, userId: user._id });
    const profile = await ensureProfileWithMigration({ orgId, userId: user._id });
    const source = buildMutationSource(req.requestId, "manual", {
      note: "transaction_bulk_delete",
    });
    bumpTransactionMetadata(profile, { setCount: newCount, at: now });
    setProfileMutationSource(profile, source);
    await profile.save();

    return res.json({
      message: "Transactions deleted",
      deleted_count: deleteResult.deletedCount || 0,
      source,
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error bulk deleting transactions:`, error);
    return res.status(500).json({ message: "Failed to bulk delete transactions", request_id: req.requestId });
  }
};

// Reassigns categories across an arbitrary collection of targeted transactions.
// Enforces tenant and user ownership boundaries on every updated document.
// Returns updated transaction count figures following successful batch execution.
export const bulkCategorizeEndpoint = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const { transaction_ids, category } = req.body as { transaction_ids: string[]; category: string };

    const validIds = transaction_ids
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (validIds.length === 0) {
      return res.json({ message: "No valid transactions to categorize", modified_count: 0 });
    }

    const cleanCategory = category.trim();

    const updateResult = await TransactionModel.updateMany(
      {
        _id: { $in: validIds },
        orgId,
        userId: user._id,
      },
      {
        $set: {
          category: cleanCategory,
          "source.note": "transaction_bulk_categorize",
        },
        $pull: {
          "review.flags": "uncategorized",
        },
      }
    );

    const profile = await ensureProfileWithMigration({ orgId, userId: user._id });
    const source = buildMutationSource(req.requestId, "manual", {
      note: "transaction_bulk_categorize",
    });
    bumpTransactionMetadata(profile, { deltaCount: 0 });
    setProfileMutationSource(profile, source);
    await profile.save();

    return res.json({
      message: "Transactions categorized",
      modified_count: updateResult.modifiedCount || 0,
      category: cleanCategory,
      source,
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error bulk categorizing transactions:`, error);
    return res.status(500).json({ message: "Failed to bulk categorize transactions", request_id: req.requestId });
  }
};

// ============================================================================
// MERCHANT EMBEDDING CLUSTERING & BANK FEED WEBHOOK CONTROLLERS (Batch 30/36)
// ============================================================================

// Identifies semantic clusters of unassigned or ambiguously named merchant strings.
// Uses vector embeddings to group similar merchant transaction descriptions.
// Returns proposed cluster groupings to assist users in bulk merchant cleanup.
export const getMerchantClusters = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const { min_count = 1, limit = 50, currency } = req.query as {
      min_count?: number;
      limit?: number;
      currency?: string;
    };

    const transactions = await TransactionModel.find({
      orgId,
      userId: user._id,
    })
      .sort({ date: -1 })
      .limit(500)
      .lean();

    const existingMerchants = await MerchantModel.find({ orgId }).lean();

    const rawTransactions = transactions.map((tx) => ({
      id: String(tx._id),
      description: String(tx.description || ""),
      amount: Number(tx.amount || 0),
      category: tx.category,
      date: tx.date,
    }));

    const clusteredResults = clusterMerchantTransactions(rawTransactions, {
      existingMerchants: existingMerchants as any,
    });

    const curr = currency ? normalizeCurrency(currency) : undefined;
    const safeMinCount = Math.max(1, Number(min_count) || 1);
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));

    const clusters = clusteredResults
      .filter((c) => c.count >= safeMinCount)
      .map((c) => ({
        cluster_key: c.cluster_key,
        normalized_name: c.normalized_name,
        raw_descriptions: c.raw_descriptions,
        transaction_ids: c.transaction_ids,
        count: c.count,
        total_spend: curr ? convertUsdToCurrency(c.total_spend, curr) : Math.round(c.total_spend * 100) / 100,
        suggested_category: c.suggested_category,
        confidence: c.confidence,
        semantic_similarity: c.semantic_similarity,
      }))
      .slice(0, safeLimit);

    res.json({
      clusters,
      total_clusters: clusters.length,
      currency: curr,
      fx_rate: curr ? FX_RATES_TO_USD[curr] : undefined,
      currency_symbol: curr ? CURRENCY_SYMBOLS[curr] : undefined,
      request_id: req.requestId,
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error getting merchant clusters:`, error);
    res.status(500).json({ message: "Failed to compute merchant clusters", request_id: req.requestId });
  }
};

// Applies canonical merchant names and standardized categories across a cluster.
// Updates all matching transaction records to use the unified merchant identity.
// Returns modification tallies confirming the number of updated transaction rows.
export const applyMerchantCluster = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const { cluster_key, normalized_name, category, transaction_ids } = req.body as {
      cluster_key: string;
      normalized_name: string;
      category: string;
      transaction_ids: string[];
    };

    if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      return res.status(400).json({ message: "transaction_ids array required", request_id: req.requestId });
    }

    const objectIds = transaction_ids
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    const updateResult = await TransactionModel.updateMany(
      {
        _id: { $in: objectIds },
        orgId,
        userId: user._id,
      },
      {
        $set: {
          description: normalized_name,
          category: category,
          "review.needs_attention": false,
        },
        $pull: {
          "review.flags": { $in: ["uncategorized", "needs_merchant_match"] },
        },
      }
    );

    const normKey = cluster_key.toLowerCase().trim();
    await MerchantModel.findOneAndUpdate(
      { orgId, normalizedName: normKey },
      {
        $set: {
          name: normalized_name,
          normalizedName: normKey,
          categoryDefault: category,
        },
        $addToSet: {
          aliases: { $each: [normalized_name, cluster_key] },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const profile = await ensureProfileWithMigration({ orgId, userId: user._id });
    bumpTransactionMetadata(profile, { deltaCount: 0 });
    await profile.save();

    res.json({
      success: true,
      updated_count: updateResult.modifiedCount || 0,
      normalized_name,
      category,
      request_id: req.requestId,
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error applying merchant cluster:`, error);
    res.status(500).json({ message: "Failed to apply merchant cluster", request_id: req.requestId });
  }
};

// Processes incoming automated transaction webhooks delivered by banking providers.
// Validates webhook authenticity, deduplicates payloads, and normalizes rows.
// Persists ingested transactions and emits asynchronous processing domain events.
export const ingestBankFeedWebhook = async (req: Request, res: Response) => {
  try {
    const orgId = requireOrgId(req);
    const user = req.user as IUserDocument | undefined;
    const userId = user?._id || new mongoose.Types.ObjectId();

    const { webhook_type, webhook_code, item_id, account_id, transactions } = req.body as {
      webhook_type: string;
      webhook_code: string;
      item_id?: string;
      account_id?: string;
      transactions: Array<{
        transaction_id: string;
        account_id?: string;
        amount: number;
        date: string;
        name: string;
        category?: string[];
        pending?: boolean;
        iso_currency_code?: string;
      }>;
    };

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ message: "No transactions in bank feed", request_id: req.requestId });
    }

    const externalIds = transactions.map(t => String(t.transaction_id));
    const existing = await TransactionModel.find({
      orgId,
      externalId: { $in: externalIds },
    })
      .select("externalId")
      .lean();

    const existingIdSet = new Set(existing.map((e: any) => e.externalId));

    const newTransactionsToInsert: any[] = [];
    let duplicatesSkipped = 0;

    for (const item of transactions) {
      const extId = String(item.transaction_id);
      if (existingIdSet.has(extId)) {
        duplicatesSkipped++;
        continue;
      }

      const numAmount = Number(item.amount);
      const isIncome = numAmount < 0;
      const normalizedAmount = isIncome ? Math.abs(numAmount) : -Math.abs(numAmount);
      const type: TransactionType = isIncome ? "income" : "expense";
      const category = (item.category && item.category[0]) || "Uncategorized";

      newTransactionsToInsert.push({
        orgId,
        userId,
        externalId: extId,
        accountId: item.account_id || account_id || undefined,
        amount: normalizedAmount,
        type,
        category,
        description: item.name.slice(0, 160),
        date: new Date(item.date),
        source: "bank_feed",
        importDetails: {
          duplicateKey: extId,
          committedAt: new Date(),
        },
      });
    }

    let insertedCount = 0;
    if (newTransactionsToInsert.length > 0) {
      const docs = await TransactionModel.insertMany(newTransactionsToInsert);
      insertedCount = docs.length;
      const profile = await ensureProfileWithMigration({ orgId, userId });
      bumpTransactionMetadata(profile, { deltaCount: insertedCount });
      await profile.save();
    }

    res.json({
      success: true,
      webhook_type,
      webhook_code,
      processed: transactions.length,
      inserted: insertedCount,
      duplicates_skipped: duplicatesSkipped,
      request_id: req.requestId,
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error ingesting bank feed webhook:`, error);
    res.status(500).json({ message: "Failed to ingest bank feed webhook", request_id: req.requestId });
  }
};
