import { Request, Response } from "express";
import mongoose from "mongoose";
import FinancialProfileModel, {
  IDebt,
  IFinancialGoal,
  IFinancialProfileDocument,
  ITransaction
} from "../models/financialProfileModel";
import { IUserDocument } from "../models/userModel";

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

const mapTransaction = (transaction: ITransaction) => ({
  id: transaction._id?.toString(),
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

const findTransaction = (profile: IFinancialProfileDocument, transactionId: string) => {
  const transactions = profile.transactions as ITransaction[];
  const transactionIndex = transactions.findIndex(
    transaction => transaction._id?.toString() === transactionId
  );

  if (transactionIndex === -1) {
    return { transaction: null, transactionIndex: -1 };
  }

  return { transaction: transactions[transactionIndex], transactionIndex };
};

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

const addTransactionToProfile = (profile: IFinancialProfileDocument, input: TransactionInput) => {
  const transaction: ITransaction = {
    amount: normalizeTransactionAmount(input.amount, input.type),
    category: input.category,
    description: input.description,
    type: input.type,
    date: input.date ? new Date(input.date) : new Date()
  };

  profile.transactions.push(transaction);
};

export const createTransaction = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const profile = await ensureProfile(user._id);
    const body = req.body as TransactionInput;

    addTransactionToProfile(profile, body);
    await profile.save();

    const created = profile.transactions[profile.transactions.length - 1];

    res.status(201).json({
      message: "Transaction created",
      transaction: mapTransaction(created)
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

    const profile = await FinancialProfileModel.findOne({ userId: user._id });
    const allTransactions = (profile?.transactions || []).map(mapTransaction);

    const normalizedCategory = category?.trim().toLowerCase();

    const filtered = allTransactions.filter(transaction => {
      const transactionTime = new Date(transaction.date).getTime();

      if (from && transactionTime < new Date(from).getTime()) {
        return false;
      }

      if (to && transactionTime > new Date(to).getTime()) {
        return false;
      }

      if (type && transaction.type !== type) {
        return false;
      }

      if (normalizedCategory && transaction.category.toLowerCase() !== normalizedCategory) {
        return false;
      }

      return true;
    });

    filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    res.json({
      transactions: paginated,
      pagination: {
        page,
        limit,
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / limit) || 1
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
    const profile = await FinancialProfileModel.findOne({ userId: user._id });

    if (!profile) {
      return res.status(404).json({ message: "Financial profile not found", request_id: req.requestId });
    }

    const { transaction } = findTransaction(profile, id);
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found", request_id: req.requestId });
    }

    const updates = req.body as Partial<TransactionInput>;
    const nextType = updates.type || transaction.type;
    const amountForNormalization =
      updates.amount !== undefined ? updates.amount : Math.abs(transaction.amount);

    transaction.type = nextType;
    transaction.amount = normalizeTransactionAmount(amountForNormalization, nextType);

    if (updates.category !== undefined) {
      transaction.category = updates.category;
    }
    if (updates.description !== undefined) {
      transaction.description = updates.description;
    }
    if (updates.date !== undefined) {
      transaction.date = new Date(updates.date);
    }

    await profile.save();

    return res.json({
      message: "Transaction updated",
      transaction: mapTransaction(transaction)
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
    const profile = await FinancialProfileModel.findOne({ userId: user._id });

    if (!profile) {
      return res.status(404).json({ message: "Financial profile not found", request_id: req.requestId });
    }

    const { transactionIndex } = findTransaction(profile, id);
    if (transactionIndex === -1) {
      return res.status(404).json({ message: "Transaction not found", request_id: req.requestId });
    }

    profile.transactions.splice(transactionIndex, 1);
    await profile.save();

    return res.json({
      message: "Transaction deleted",
      transaction_id: id
    });
  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error deleting transaction:`, error);
    return res.status(500).json({ message: "Failed to delete transaction", request_id: req.requestId });
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
