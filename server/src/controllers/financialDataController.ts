import { Request, Response } from "express";
import mongoose from "mongoose";
import FinancialProfileModel, {
  IDebt,
  IFinancialGoal,
  IFinancialProfileDocument
} from "../models/financialProfileModel";
import AiResponseCacheModel from "../models/aiResponseCacheModel";
import TransactionModel, { TransactionType } from "../models/transactionModel";
import { IUserDocument } from "../models/userModel";
import { ensureProfileTransactionsMigrated } from "../services/transactionMigration";
import { buildTransactionsSummaryCacheKey, ttlMs } from "../services/aiCache";

const DEFAULT_PROFILE = {
  age: 30,
  annual_income: 0,
  monthly_expenses: 0,
  savings: 0,
  goals: [],
  debts: [],
  transactions: [],
  risk_tolerance: "moderate" as const,
  investment_experience: "beginner" as const
};

type TransactionInput = {
  amount: number;
  category: string;
  description: string;
  date?: string | Date;
  type: "income" | "expense" | "investment";
};

const normalizeTransactionAmount = (
  amount: number,
  type: "income" | "expense" | "investment"
) => {
  const absoluteAmount = Math.abs(Number(amount));
  return type === "income" ? absoluteAmount : -absoluteAmount;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ensureProfile = async (userId: mongoose.Types.ObjectId) => {
  let profile = await FinancialProfileModel.findOne({ userId });

  if (!profile) {
    profile = await FinancialProfileModel.create({
      userId,
      ...DEFAULT_PROFILE
    });
  }

  return profile;
};

const mapTransactionRecord = (transaction: {
  _id: unknown;
  amount: number;
  category: string;
  description: string;
  date: Date;
  type: TransactionType;
}) => ({
  id: String(transaction._id),
  amount: transaction.amount,
  category: transaction.category,
  description: transaction.description,
  date: transaction.date,
  type: transaction.type
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

export const createTransaction = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const body = req.body as TransactionInput;

    const profile = await ensureProfile(user._id);
    await ensureProfileTransactionsMigrated(profile);

    const created = await TransactionModel.create({
      userId: user._id,
      amount: normalizeTransactionAmount(body.amount, body.type),
      category: body.category,
      description: body.description,
      type: body.type,
      date: body.date ? new Date(body.date) : new Date()
    });

    await FinancialProfileModel.updateOne(
      { _id: profile._id },
      {
        $inc: { transactionsCount: 1 },
        $set: { transactionsUpdatedAt: new Date() }
      }
    );

    res.status(201).json({
      message: "Transaction created",
      transaction: mapTransactionRecord(created)
    });
  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error creating transaction:`, error);
    res.status(500).json({ message: "Failed to create transaction", request_id: req.requestId });
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
      category
    } = req.query as {
      page?: number;
      limit?: number;
      from?: Date;
      to?: Date;
      type?: "income" | "expense" | "investment";
      category?: string;
    };

    const profile = await ensureProfile(user._id);
    await ensureProfileTransactionsMigrated(profile);

    const filter: Record<string, unknown> = { userId: user._id };

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

    const [total, docs] = await Promise.all([
      TransactionModel.countDocuments(filter),
      TransactionModel.find(filter).sort({ date: -1 }).skip(skip).limit(safeLimit).lean()
    ]);

    res.json({
      transactions: docs.map(doc => mapTransactionRecord(doc as any)),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1
      }
    });
  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error listing transactions:`, error);
    res.status(500).json({ message: "Failed to fetch transactions", request_id: req.requestId });
  }
};

export const updateTransaction = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { id } = req.params;
    const profile = await ensureProfile(user._id);
    await ensureProfileTransactionsMigrated(profile);

    const existing = await TransactionModel.findOne({ _id: id, userId: user._id });
    if (!existing) {
      return res.status(404).json({ message: "Transaction not found", request_id: req.requestId });
    }

    const updates = req.body as Partial<TransactionInput>;
    const nextType = (updates.type || existing.type) as TransactionType;
    const amountForNormalization =
      updates.amount !== undefined ? updates.amount : Math.abs(existing.amount);

    const nextAmount = normalizeTransactionAmount(amountForNormalization, nextType);
    const updateDoc: Record<string, unknown> = {
      type: nextType,
      amount: nextAmount
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
      { _id: id, userId: user._id },
      { $set: updateDoc },
      { new: true }
    );

    await FinancialProfileModel.updateOne(
      { _id: profile._id },
      { $set: { transactionsUpdatedAt: new Date() } }
    );

    return res.json({
      message: "Transaction updated",
      transaction: updated ? mapTransactionRecord(updated) : mapTransactionRecord(existing)
    });
  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error updating transaction:`, error);
    return res.status(500).json({ message: "Failed to update transaction", request_id: req.requestId });
  }
};

export const deleteTransaction = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { id } = req.params;
    const profile = await ensureProfile(user._id);
    await ensureProfileTransactionsMigrated(profile);

    const deleted = await TransactionModel.findOneAndDelete({ _id: id, userId: user._id });
    if (!deleted) {
      return res.status(404).json({ message: "Transaction not found", request_id: req.requestId });
    }

    const now = new Date();
    const newCount = await TransactionModel.countDocuments({ userId: user._id });
    await FinancialProfileModel.updateOne(
      { _id: profile._id },
      { $set: { transactionsCount: newCount, transactionsUpdatedAt: now } }
    );

    return res.json({
      message: "Transaction deleted",
      transaction_id: id
    });
  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error deleting transaction:`, error);
    return res.status(500).json({ message: "Failed to delete transaction", request_id: req.requestId });
  }
};

export const listRecentTransactions = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const limitRaw = Number((req.query as any)?.limit ?? 5);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 50) : 5;

    const profile = await ensureProfile(user._id);
    await ensureProfileTransactionsMigrated(profile);

    const docs = await TransactionModel.find({ userId: user._id }).sort({ date: -1 }).limit(limit).lean();

    return res.json({
      transactions: docs.map(doc => mapTransactionRecord(doc as any))
    });
  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error fetching recent transactions:`, error);
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

    const profile = await ensureProfile(user._id);
    await ensureProfileTransactionsMigrated(profile);

    const profileTxUpdatedAt = profile.transactionsUpdatedAt
      ? new Date(profile.transactionsUpdatedAt as unknown as Date).toISOString()
      : "";

    const fromIso = new Date(from).toISOString();
    const toIso = new Date(to).toISOString();

    const cacheKey = buildTransactionsSummaryCacheKey({
      userId: user._id.toString(),
      from: fromIso,
      to: toIso,
      groupBy,
      topCategories,
      transactionsUpdatedAt: profileTxUpdatedAt
    });

    const cached = await AiResponseCacheModel.findOne({ cacheKey }).lean();
    if (cached?.responseData && typeof cached.responseData === "object") {
      return res.json({ ...(cached.responseData as any), cache_hit: true });
    }

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

    await AiResponseCacheModel.findOneAndUpdate(
      { cacheKey },
      {
        $set: {
          userId: user._id,
          endpoint: "transactions-summary",
          responseData: responsePayload,
          expiresAt: new Date(Date.now() + ttlMs.transactionsSummary)
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ ...responsePayload, cache_hit: false });
  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error building transactions summary:`, error);
    return res.status(500).json({ message: "Failed to build transactions summary", request_id: req.requestId });
  }
};

export const createGoal = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const profile = await ensureProfile(user._id);

    profile.goals.push(req.body);
    await profile.save();

    const createdGoal = profile.goals[profile.goals.length - 1];

    res.status(201).json({
      message: "Goal created",
      goal: mapGoal(createdGoal)
    });
  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error creating goal:`, error);
    res.status(500).json({ message: "Failed to create goal", request_id: req.requestId });
  }
};

export const updateGoal = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { goalId } = req.params;
    const profile = await FinancialProfileModel.findOne({ userId: user._id });

    if (!profile) {
      return res.status(404).json({ message: "Financial profile not found", request_id: req.requestId });
    }

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

    await profile.save();

    return res.json({
      message: "Goal updated",
      goal: mapGoal(goal)
    });
  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error updating goal:`, error);
    return res.status(500).json({ message: "Failed to update goal", request_id: req.requestId });
  }
};

export const deleteGoal = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { goalId } = req.params;
    const profile = await FinancialProfileModel.findOne({ userId: user._id });

    if (!profile) {
      return res.status(404).json({ message: "Financial profile not found", request_id: req.requestId });
    }

    const { goalIndex } = findGoal(profile, goalId);
    if (goalIndex === -1) {
      return res.status(404).json({ message: "Goal not found", request_id: req.requestId });
    }

    profile.goals.splice(goalIndex, 1);
    await profile.save();

    return res.json({
      message: "Goal deleted",
      goal_id: goalId
    });
  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error deleting goal:`, error);
    return res.status(500).json({ message: "Failed to delete goal", request_id: req.requestId });
  }
};

export const createDebt = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const profile = await ensureProfile(user._id);

    profile.debts.push(req.body);
    await profile.save();

    const createdDebt = profile.debts[profile.debts.length - 1];

    res.status(201).json({
      message: "Debt created",
      debt: mapDebt(createdDebt)
    });
  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error creating debt:`, error);
    res.status(500).json({ message: "Failed to create debt", request_id: req.requestId });
  }
};

export const updateDebt = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { debtId } = req.params;
    const profile = await FinancialProfileModel.findOne({ userId: user._id });

    if (!profile) {
      return res.status(404).json({ message: "Financial profile not found", request_id: req.requestId });
    }

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

    await profile.save();

    return res.json({
      message: "Debt updated",
      debt: mapDebt(debt)
    });
  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error updating debt:`, error);
    return res.status(500).json({ message: "Failed to update debt", request_id: req.requestId });
  }
};

export const deleteDebt = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { debtId } = req.params;
    const profile = await FinancialProfileModel.findOne({ userId: user._id });

    if (!profile) {
      return res.status(404).json({ message: "Financial profile not found", request_id: req.requestId });
    }

    const { debtIndex } = findDebt(profile, debtId);
    if (debtIndex === -1) {
      return res.status(404).json({ message: "Debt not found", request_id: req.requestId });
    }

    profile.debts.splice(debtIndex, 1);
    await profile.save();

    return res.json({
      message: "Debt deleted",
      debt_id: debtId
    });
  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error deleting debt:`, error);
    return res.status(500).json({ message: "Failed to delete debt", request_id: req.requestId });
  }
};
