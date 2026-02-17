import crypto from "crypto";
import mongoose from "mongoose";

import { IDebt, IFinancialGoal } from "../models/financialProfileModel";
import FinancialProfileModel from "../models/financialProfileModel";
import TaskModel from "../models/taskModel";
import TransactionModel, { TransactionType } from "../models/transactionModel";
import type { TaskEffectInput } from "../schemas/taskSchemas";
import type { MutationSource } from "../types/provenance";
import { publishDomainEvent } from "./domainEvents";
import {
  bumpTransactionMetadata,
  ensureProfileWithMigration,
  setProfileMutationSource,
} from "./profileService";

const normalizeTransactionAmount = (amount: number, type: TransactionType) => {
  const absoluteAmount = Math.abs(Number(amount));
  return type === "income" ? absoluteAmount : -absoluteAmount;
};

export class ActionOutcomeError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type ApplyTaskEffectsParams = {
  userId: mongoose.Types.ObjectId;
  taskId: string;
  effects: TaskEffectInput[];
  idempotencyKey?: string;
  completedAt?: Date;
  note?: string;
  requestId?: string;
  actionLinkId?: string;
};

export type ApplyTaskEffectsResult = {
  task: Record<string, unknown>;
  applied_effects: {
    transactions: string[];
    goals: string[];
    debts: string[];
    profile_updated: boolean;
  };
  links: {
    action_link_id: string;
    task_id: string;
    transaction_ids: string[];
    goal_ids: string[];
    debt_ids: string[];
  };
  provenance: MutationSource;
  idempotent_replay: boolean;
};

const isTransactionUnsupportedError = (error: unknown) => {
  const maybeError = error as { message?: string; code?: number; codeName?: string } | undefined;
  const message = String(maybeError?.message || "");
  const codeName = String(maybeError?.codeName || "");
  const code = Number(maybeError?.code);

  return (
    code === 20 ||
    codeName === "IllegalOperation" ||
    /Transaction numbers are only allowed/i.test(message) ||
    /replica set member/i.test(message) ||
    /does not support transactions/i.test(message)
  );
};

const applyGoalProgress = (params: {
  profile: any;
  goalId: string;
  amount: number;
  mode: "increment" | "set";
}) => {
  const goals = params.profile.goals as IFinancialGoal[];
  const goal = goals.find(item => item?._id?.toString() === params.goalId);
  if (!goal) {
    throw new ActionOutcomeError(404, "GOAL_NOT_FOUND", `Goal not found: ${params.goalId}`);
  }

  if (params.mode === "set") {
    goal.current = Number(params.amount);
  } else {
    goal.current = Number(goal.current || 0) + Number(params.amount || 0);
  }
};

const applyDebtPayment = (params: {
  profile: any;
  debtId: string;
  amount: number;
}) => {
  const debts = params.profile.debts as IDebt[];
  const debt = debts.find(item => item?._id?.toString() === params.debtId);
  if (!debt) {
    throw new ActionOutcomeError(404, "DEBT_NOT_FOUND", `Debt not found: ${params.debtId}`);
  }

  const nextBalance = Number(debt.balance || 0) - Number(params.amount || 0);
  debt.balance = nextBalance > 0 ? nextBalance : 0;
};

const applyProfileUpdate = (params: {
  profile: any;
  updates: {
    annual_income?: number;
    monthly_expenses?: number;
    savings?: number;
  };
}) => {
  if (params.updates.annual_income !== undefined) {
    params.profile.annual_income = Number(params.updates.annual_income);
  }
  if (params.updates.monthly_expenses !== undefined) {
    params.profile.monthly_expenses = Number(params.updates.monthly_expenses);
  }
  if (params.updates.savings !== undefined) {
    params.profile.savings = Number(params.updates.savings);
  }
};

export const applyTaskEffects = async (params: ApplyTaskEffectsParams): Promise<ApplyTaskEffectsResult> => {
  await ensureProfileWithMigration(params.userId);

  const buildReplayResult = (task: Record<string, any>): ApplyTaskEffectsResult => {
    const summary = task.appliedSummary || {};
    const transactions = Array.isArray(summary.transactions)
      ? summary.transactions.map((value: unknown) => String(value))
      : [];
    const goals = Array.isArray(summary.goals) ? summary.goals.map((value: unknown) => String(value)) : [];
    const debts = Array.isArray(summary.debts) ? summary.debts.map((value: unknown) => String(value)) : [];
    const actionLinkId =
      typeof task.actionLinkId === "string" && task.actionLinkId.trim().length > 0
        ? task.actionLinkId
        : params.actionLinkId || `action-${params.taskId}`;

    const provenance: MutationSource = {
      origin: "task_completion",
      task_id: String(task._id || params.taskId),
      request_id: params.requestId,
      action_link_id: actionLinkId,
      actor_type: "user",
      source_ref: `task:${String(task._id || params.taskId)}`,
      note: params.note,
    };

    return {
      task,
      applied_effects: {
        transactions,
        goals,
        debts,
        profile_updated: Boolean(summary.profileUpdated),
      },
      links: {
        action_link_id: actionLinkId,
        task_id: String(task._id || params.taskId),
        transaction_ids: transactions,
        goal_ids: goals,
        debt_ids: debts,
      },
      provenance,
      idempotent_replay: true,
    };
  };

  const runApply = async (session?: mongoose.ClientSession): Promise<ApplyTaskEffectsResult> => {
    const queryOptions = session ? { session } : undefined;

    const task = await TaskModel.findOne({ _id: params.taskId, userId: params.userId }, null, queryOptions);
    if (!task) {
      throw new ActionOutcomeError(404, "TASK_NOT_FOUND", "Task not found");
    }

    if (task.appliedAt) {
      if (
        params.idempotencyKey &&
        typeof task.applyIdempotencyKey === "string" &&
        task.applyIdempotencyKey === params.idempotencyKey
      ) {
        return buildReplayResult(task.toObject());
      }
      throw new ActionOutcomeError(409, "TASK_ALREADY_APPLIED", "Task effects have already been applied");
    }

    const profile = await FinancialProfileModel.findOne({ userId: params.userId }, null, queryOptions);
    if (!profile) {
      throw new ActionOutcomeError(404, "PROFILE_NOT_FOUND", "Financial profile not found");
    }

    const now = new Date();
    const completedAt = params.completedAt || now;
    const actionLinkId = params.actionLinkId || task.actionLinkId || crypto.randomUUID();
    const provenance: MutationSource = {
      origin: "task_completion",
      task_id: task._id,
      request_id: params.requestId,
      action_link_id: actionLinkId,
      actor_type: "user",
      source_ref: `task:${task._id}`,
      note: params.note,
    };
    const createdTransactions: string[] = [];
    const touchedGoals = new Set<string>();
    const touchedDebts = new Set<string>();
    let profileUpdated = false;

    task.applyStatus = "pending";
    task.applyErrorCode = undefined;
    task.applyIdempotencyKey = params.idempotencyKey;
    task.actionLinkId = actionLinkId;

    try {
      for (const effect of params.effects || []) {
        if (effect.type === "transaction") {
          const tx = effect.transaction;
          const created = new TransactionModel({
            userId: params.userId,
            amount: normalizeTransactionAmount(tx.amount, tx.tx_type),
            category: tx.category,
            description: tx.description,
            type: tx.tx_type,
            date: tx.date ? new Date(tx.date) : now,
            source: provenance,
          });
          await created.save(queryOptions);
          createdTransactions.push(created._id.toString());
          profileUpdated = true;
          continue;
        }

        if (effect.type === "goal_progress") {
          applyGoalProgress({
            profile,
            goalId: effect.goal_id,
            amount: effect.amount,
            mode: effect.mode || "increment",
          });
          touchedGoals.add(effect.goal_id);
          profileUpdated = true;
          continue;
        }

        if (effect.type === "debt_payment") {
          applyDebtPayment({
            profile,
            debtId: effect.debt_id,
            amount: effect.amount,
          });
          touchedDebts.add(effect.debt_id);
          profileUpdated = true;
          continue;
        }

        if (effect.type === "profile_update") {
          applyProfileUpdate({
            profile,
            updates: effect.updates,
          });
          profileUpdated = true;
        }
      }

      if (createdTransactions.length > 0) {
        bumpTransactionMetadata(profile, { deltaCount: createdTransactions.length, at: now });
      }

      if (profileUpdated) {
        setProfileMutationSource(profile, provenance);
        await profile.save(queryOptions);
      }

      task.status = "completed";
      task.completedAt = completedAt;
      task.completionEvidence = {
        note: params.note,
        completedAt,
        effects: params.effects as unknown as Array<Record<string, unknown>>,
      };
      task.appliedAt = now;
      task.appliedSummary = {
        transactions: createdTransactions,
        goals: Array.from(touchedGoals),
        debts: Array.from(touchedDebts),
        profileUpdated,
      };
      task.applyStatus = "succeeded";
      task.applyErrorCode = undefined;
      task.outcomeRefs = [
        ...createdTransactions.map(id => `transaction:${id}`),
        ...Array.from(touchedGoals).map(id => `goal:${id}`),
        ...Array.from(touchedDebts).map(id => `debt:${id}`),
      ];

      await task.save(queryOptions);
    } catch (error) {
      const actionOutcomeError = error as ActionOutcomeError;
      task.applyStatus = "failed";
      task.applyErrorCode = actionOutcomeError?.code || "APPLY_FAILED";
      await task.save(queryOptions);
      throw error;
    }

    for (const transactionId of createdTransactions) {
      await publishDomainEvent({
        userId: params.userId,
        eventType: "TransactionCreated",
        aggregateType: "transaction",
        aggregateId: transactionId,
        actionLinkId,
        requestId: params.requestId,
        payload: {
          task_id: task._id,
          source: provenance,
        },
        session,
      });
    }

    await publishDomainEvent({
      userId: params.userId,
      eventType: "TaskApplied",
      aggregateType: "task",
      aggregateId: task._id,
      actionLinkId,
      requestId: params.requestId,
      payload: {
        applied_effects: {
          transactions: createdTransactions,
          goals: Array.from(touchedGoals),
          debts: Array.from(touchedDebts),
          profile_updated: profileUpdated,
        },
      },
      session,
    });

    return {
      task: task.toObject() as unknown as Record<string, unknown>,
      applied_effects: {
        transactions: createdTransactions,
        goals: Array.from(touchedGoals),
        debts: Array.from(touchedDebts),
        profile_updated: profileUpdated,
      },
      links: {
        action_link_id: actionLinkId,
        task_id: task._id,
        transaction_ids: createdTransactions,
        goal_ids: Array.from(touchedGoals),
        debt_ids: Array.from(touchedDebts),
      },
      provenance,
      idempotent_replay: false,
    };
  };

  const session = await mongoose.startSession();
  try {
    let result: ApplyTaskEffectsResult | null = null;
    await session.withTransaction(async () => {
      result = await runApply(session);
    });
    if (result) {
      return result;
    }
  } catch (error) {
    if (!isTransactionUnsupportedError(error)) {
      throw error;
    }
  } finally {
    await session.endSession();
  }

  return runApply();
};
