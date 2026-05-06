/**
 * @fileoverview Budget Health Service
 *
 * Computes a weekly financial health score and generates proactive
 * budget burn-rate alerts. This powers the "Adaptive Budget Coach"
 * experience on the dashboard.
 *
 * HEALTH SCORE COMPONENTS (0–100):
 * - Budget adherence (40 points): How close spending is to planned envelopes
 * - Review queue cleanliness (20 points): Proportion of flagged transactions resolved
 * - Goal progress (20 points): Weighted progress across all active goals
 * - Debt management (20 points): Whether minimum payments are manageable
 *
 * BURN RATE ALERTS:
 * For each budget category, if the percentage of budget burned exceeds
 * the percentage of the month elapsed by a configurable threshold,
 * an alert is generated with a "if you continue at this pace" projection.
 *
 * @module services/budgetHealthService
 */

import mongoose from "mongoose";

import TransactionModel from "../models/transactionModel";
import TaskModel from "../models/taskModel";
import { ensureProfile } from "./profileService";
import { getBudgetEnvelopes } from "./financeIntelligence";
import type { IFinancialGoal, IDebt } from "../models/financialProfileModel";

/** A single burn-rate alert for a budget category */
export interface BurnRateAlert {
  category: string;
  planned: number;
  spent: number;
  burn_rate_pct: number;
  month_elapsed_pct: number;
  projected_end_of_month: number;
  overshoot_amount: number;
  severity: "warning" | "critical";
  message: string;
}

/** The weekly health report payload */
export interface BudgetHealthPayload {
  generated_at: string;
  period_key: string;

  health_score: {
    total: number;
    budget_adherence: number;
    review_cleanliness: number;
    goal_progress: number;
    debt_management: number;
  };

  burn_rate_alerts: BurnRateAlert[];

  pace_comparison: {
    current_week_avg_daily: number;
    last_week_avg_daily: number;
    monthly_avg_daily: number;
    trend: "improving" | "stable" | "worsening";
  };

  projection: {
    if_you_continue: string;
    projected_month_end_spend: number;
    budget_planned: number;
    delta: number;
  };
}

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const daysInMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const buildBudgetHealthPayload = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
}): Promise<BudgetHealthPayload> => {
  const now = new Date();
  const currentPeriod = monthKey(now);
  const dayOfMonth = now.getDate();
  const totalDays = daysInMonth(now);
  const monthElapsedPct = (dayOfMonth / totalDays) * 100;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Parallel data fetching
  const [
    profile,
    budgetEnvelopes,
    currentWeekSpend,
    lastWeekSpend,
    monthSpend,
    reviewQueueCount,
    totalTxCount,
  ] = await Promise.all([
    ensureProfile({ orgId: params.orgId, userId: params.userId }),

    getBudgetEnvelopes({ orgId: params.orgId, periodKey: currentPeriod }).catch(
      () => null
    ),

    // Current week spending
    TransactionModel.aggregate([
      {
        $match: {
          orgId: params.orgId,
          userId: params.userId,
          date: { $gte: oneWeekAgo, $lte: now },
          amount: { $lt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $abs: "$amount" } },
          count: { $sum: 1 },
        },
      },
    ]).catch(() => []),

    // Last week spending
    TransactionModel.aggregate([
      {
        $match: {
          orgId: params.orgId,
          userId: params.userId,
          date: { $gte: twoWeeksAgo, $lt: oneWeekAgo },
          amount: { $lt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $abs: "$amount" } },
        },
      },
    ]).catch(() => []),

    // Full month spending
    TransactionModel.aggregate([
      {
        $match: {
          orgId: params.orgId,
          userId: params.userId,
          date: { $gte: monthStart, $lte: now },
          amount: { $lt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $abs: "$amount" } },
        },
      },
    ]).catch(() => []),

    // Review queue: transactions with flags
    TransactionModel.countDocuments({
      orgId: params.orgId,
      userId: params.userId,
      "review.needs_attention": true,
    }).catch(() => 0),

    // Total transaction count (for review ratio)
    TransactionModel.countDocuments({
      orgId: params.orgId,
      userId: params.userId,
    }).catch(() => 0),
  ]);

  // ── Budget Adherence Score (0–40) ─────────────────────
  const totalPlanned = budgetEnvelopes?.totals?.planned || 0;
  const totalSpent = budgetEnvelopes?.totals?.spent || 0;
  const burnRatePct = totalPlanned > 0 ? (totalSpent / totalPlanned) * 100 : 0;

  let budgetAdherenceScore = 40;
  if (totalPlanned > 0) {
    const ratio = totalSpent / totalPlanned;
    const expectedRatio = monthElapsedPct / 100;
    const deviation = Math.abs(ratio - expectedRatio);
    // Higher deviation = lower score
    budgetAdherenceScore = Math.round(
      clamp(40 - deviation * 80, 0, 40)
    );
  }

  // ── Review Cleanliness Score (0–20) ───────────────────
  const reviewRatio =
    totalTxCount > 0 ? 1 - Math.min(1, reviewQueueCount / totalTxCount) : 1;
  const reviewCleanlinessScore = Math.round(reviewRatio * 20);

  // ── Goal Progress Score (0–20) ────────────────────────
  const goals = Array.isArray(profile.goals)
    ? (profile.goals as IFinancialGoal[])
    : [];
  let goalProgressScore = 20; // Default if no goals
  if (goals.length > 0) {
    const totalTarget = goals.reduce(
      (sum, g) => sum + Number(g.target || 0),
      0
    );
    const totalCurrent = goals.reduce(
      (sum, g) => sum + Number(g.current || 0),
      0
    );
    const progressRatio = totalTarget > 0 ? totalCurrent / totalTarget : 0;
    goalProgressScore = Math.round(clamp(progressRatio * 20, 0, 20));
  }

  // ── Debt Management Score (0–20) ──────────────────────
  const debts = Array.isArray(profile.debts) ? (profile.debts as IDebt[]) : [];
  let debtManagementScore = 20; // Default if no debts
  if (debts.length > 0) {
    const totalMinPayments = debts.reduce(
      (sum, d) => sum + Number(d.minimum_payment || 0),
      0
    );
    const monthlyIncome = Number(profile.annual_income || 0) / 12;
    if (monthlyIncome > 0) {
      const debtToIncomeRatio = totalMinPayments / monthlyIncome;
      // <20% DTI = full score, >50% DTI = 0
      debtManagementScore = Math.round(
        clamp((1 - (debtToIncomeRatio - 0.2) / 0.3) * 20, 0, 20)
      );
    }
  }

  const totalScore =
    budgetAdherenceScore +
    reviewCleanlinessScore +
    goalProgressScore +
    debtManagementScore;

  // ── Burn Rate Alerts ──────────────────────────────────
  const burnRateAlerts: BurnRateAlert[] = [];
  const envelopes = budgetEnvelopes?.envelopes || [];

  for (const env of envelopes as any[]) {
    if (env.unbudgeted || env.planned <= 0) continue;

    const catBurnPct = (env.spent / env.planned) * 100;
    const threshold = monthElapsedPct + 15; // 15% tolerance

    if (catBurnPct > threshold) {
      const dailyRate = dayOfMonth > 0 ? env.spent / dayOfMonth : 0;
      const projectedEom = dailyRate * totalDays;
      const overshoot = Math.max(0, projectedEom - env.planned);
      const severity: "warning" | "critical" =
        catBurnPct > monthElapsedPct + 30 ? "critical" : "warning";

      const daysLeft = totalDays - dayOfMonth;
      const remaining = env.planned - env.spent;

      burnRateAlerts.push({
        category: env.category,
        planned: env.planned,
        spent: env.spent,
        burn_rate_pct: Math.round(catBurnPct * 10) / 10,
        month_elapsed_pct: Math.round(monthElapsedPct * 10) / 10,
        projected_end_of_month: Math.round(projectedEom * 100) / 100,
        overshoot_amount: Math.round(overshoot * 100) / 100,
        severity,
        message:
          remaining > 0
            ? `If you continue at this pace, ${env.category} will exceed budget by ~${overshoot.toFixed(0)}. You have ~${remaining.toFixed(0)} left for ${daysLeft} days.`
            : `${env.category} is already over budget by ${Math.abs(remaining).toFixed(0)}.`,
      });
    }
  }

  burnRateAlerts.sort((a, b) =>
    a.severity === "critical" && b.severity !== "critical" ? -1 : 1
  );

  // ── Pace Comparison ───────────────────────────────────
  const currentWeekTotal = Number(
    (currentWeekSpend as any[])?.[0]?.total || 0
  );
  const lastWeekTotal = Number((lastWeekSpend as any[])?.[0]?.total || 0);
  const monthTotal = Number((monthSpend as any[])?.[0]?.total || 0);

  const currentWeekAvgDaily = currentWeekTotal / 7;
  const lastWeekAvgDaily = lastWeekTotal / 7;
  const monthlyAvgDaily = dayOfMonth > 0 ? monthTotal / dayOfMonth : 0;

  let trend: "improving" | "stable" | "worsening" = "stable";
  if (lastWeekAvgDaily > 0) {
    const changeRatio =
      (currentWeekAvgDaily - lastWeekAvgDaily) / lastWeekAvgDaily;
    if (changeRatio < -0.1) trend = "improving";
    else if (changeRatio > 0.1) trend = "worsening";
  }

  // ── Projection ────────────────────────────────────────
  const projectedMonthEndSpend = monthlyAvgDaily * totalDays;
  const projectionDelta = projectedMonthEndSpend - totalPlanned;

  let ifYouContinue: string;
  if (projectionDelta > 0 && totalPlanned > 0) {
    ifYouContinue = `At this pace, you'll spend ~${projectedMonthEndSpend.toFixed(0)} this month — ${projectionDelta.toFixed(0)} over your ${totalPlanned.toFixed(0)} budget.`;
  } else if (totalPlanned > 0) {
    ifYouContinue = `At this pace, you'll spend ~${projectedMonthEndSpend.toFixed(0)} this month — ${Math.abs(projectionDelta).toFixed(0)} under budget. Nice!`;
  } else {
    ifYouContinue = `At this pace, you'll spend ~${projectedMonthEndSpend.toFixed(0)} this month. Set up a budget to get proactive alerts.`;
  }

  return {
    generated_at: now.toISOString(),
    period_key: currentPeriod,
    health_score: {
      total: clamp(totalScore, 0, 100),
      budget_adherence: budgetAdherenceScore,
      review_cleanliness: reviewCleanlinessScore,
      goal_progress: goalProgressScore,
      debt_management: debtManagementScore,
    },
    burn_rate_alerts: burnRateAlerts,
    pace_comparison: {
      current_week_avg_daily:
        Math.round(currentWeekAvgDaily * 100) / 100,
      last_week_avg_daily: Math.round(lastWeekAvgDaily * 100) / 100,
      monthly_avg_daily: Math.round(monthlyAvgDaily * 100) / 100,
      trend,
    },
    projection: {
      if_you_continue: ifYouContinue,
      projected_month_end_spend:
        Math.round(projectedMonthEndSpend * 100) / 100,
      budget_planned: Math.round(totalPlanned * 100) / 100,
      delta: Math.round(projectionDelta * 100) / 100,
    },
  };
};
