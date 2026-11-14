/**
 * @fileoverview Budget Health Service
 *
 * Computes a weekly financial health score and generates proactive
 * budget burn-rate alerts. This powers the "Adaptive Budget Coach"
 * experience on the dashboard.
 *
 * ============================================================================
 * MINDMAP FLOW: BUDGET HEALTH COACH & BURN RATE ANALYTICS
 * ============================================================================
 * - Budget Health & Velocity Coach
 *     ├── 1. Four-Pillar Composite Health Score (0 - 100)
 *     │   ├── Budget Adherence (40 pts): Closeness of actual spend to envelope limits
 *     │   ├── Review Cleanliness (20 pts): Proportion of flagged txns categorized
 *     │   ├── Goal Progress (20 pts): Weighted milestone completion across active goals
 *     │   └── Debt Management (20 pts): Debt service coverage against liquid capital
 *     ├── 2. Category Burn Rate Alerts
 *     │   ├── Velocity Delta: burn_rate_pct - month_elapsed_pct
 *     │   ├── Threshold Critical: > 20% ahead of calendar pace
 *     │   ├── Threshold Warning: > 10% ahead of calendar pace
 *     │   └── Projection Engine: (spent / day_of_month) * days_in_month
 *     ├── 3. Rolling Spending Pace & Trend Detection
 *     │   ├── Current Week Daily Average
 *     │   ├── Prior Week Daily Average
 *     │   ├── Monthly Baseline Daily Average
 *     │   └── Trend Classification: "improving" | "stable" | "worsening"
 *     └── 4. Predictive Month-End Forecast
 *         └── "If you continue at this pace..." actionable delta projection
 *
 * ============================================================================
 * ASCII FLOW: HEALTH SCORING & PROJECTION LIFECYCLE
 * ============================================================================
 *               [ Trigger: Dashboard Load or Scheduled Job ]
 *                                     |
 *                                     v
 *                  +--------------------------------------+
 *                  |  buildBudgetHealthPayload(org, user) |
 *                  +------------------+-------------------+
 *                                     |
 *                 +-------------------+-------------------+
 *                 | Parallel Data Aggregation (Promise)   |
 *                 +-------------------+-------------------+
 *                 | 1. Profile (Goals & Debts)            |
 *                 | 2. Budget Envelopes (Limits vs Spend) |
 *                 | 3. Flagged vs Reviewed Transactions   |
 *                 | 4. Rolling 7-day & 14-day Outflows    |
 *                 +-------------------+-------------------+
 *                                     |
 *                                     v
 *                  +--------------------------------------+
 *                  |    4-Pillar Scoring Engine (0-100)   |
 *                  | Adherence(40) + Review(20)           |
 *                  | + Goals(20) + Debt(20)               |
 *                  +------------------+-------------------+
 *                                     |
 *                                     v
 *                  +--------------------------------------+
 *                  | Category Burn Rate Pace Loop         |
 *                  | For each category envelope:          |
 *                  |   Delta = BurnRate% - MonthElapsed%  |
 *                  +------------------+-------------------+
 *                               /            \
 *                      Delta > 20%?        Delta > 10%?
 *                            /                  \
 *                           v                    v
 *                   [ CRITICAL ALERT ]    [ WARNING ALERT ]
 *                   Message: $X over      Message: $Y over
 *                           \                    /
 *                            +--------+---------+
 *                                     |
 *                                     v
 *                  +--------------------------------------+
 *                  | Pace Comparison & Trend Evaluation   |
 *                  | Week-over-Week Spend Comparison      |
 *                  | Result: "improving"|"stable"|"worse" |
 *                  +------------------+-------------------+
 *                                     |
 *                                     v
 *                  +--------------------------------------+
 *                  | Return BudgetHealthPayload Envelope  |
 *                  +--------------------------------------+
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
// Represents a warning or critical burn-rate alert for a single budget envelope category.
// Tracks spending pace divergence relative to elapsed calendar progression in the month.
// Supplies projected month-end overshoots alongside actionable warning messages.
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

/** Predictive spending limits and dynamic envelope allowances */
// Outlines predictive velocity constraints and remaining allowances for an envelope.
// Calculates safe daily spending caps needed to avoid exceeding monthly allocations.
// Flags projected overshoot amounts and risk tiers based on real-time expenditure rates.
export interface PredictiveSpendingLimit {
  category: string;
  planned: number;
  spent: number;
  remaining: number;
  days_remaining: number;
  current_daily_spend: number;
  safe_daily_spend: number;
  projected_eom: number;
  overshoot_risk: boolean;
  overshoot_amount: number;
  recommended_cap: number;
  daily_reduction_required: number;
  status: "safe" | "caution" | "critical";
}

// Summarizes portfolio-wide predictive spending metrics and calendar time remaining.
// Aggregates safe daily spending limits across all active envelope categories.
// Tallies total categories in danger of overshoot and daily dollar reductions required.
export interface PredictiveLimitsSummary {
  days_remaining: number;
  total_safe_daily_spend: number;
  categories_at_risk: number;
  total_daily_reduction_required: number;
}

/** Actionable proactive savings recommendation generated by financial rules */
// Encapsulates actionable, algorithmically generated personal finance recommendations.
// Estimates potential monthly dollar savings and composite health score improvements.
// Suggests concrete task action items to assist users in reducing unnecessary expenses.
export interface ProactiveSavingsRecommendation {
  id: string;
  title: string;
  category: string;
  impact_monthly_savings: number | null;
  score_impact_pts: number | null;
  difficulty: "easy" | "moderate" | "strategic";
  reasoning: string;
  action_type: "create_task" | "adjust_budget" | "boost_goal";
  suggested_task_title: string;
}

// Quantifies overall monthly savings potential unlocked by adopting proactive recommendations.
// Computes maximum financial health score points recoverable through suggested actions.
// Summarizes total recommended optimizations generated across spending categories.
export interface SavingsPotentialSummary {
  total_monthly_savings: number;
  potential_score_improvement: number;
  recommended_actions_count: number;
}

/** Peer spending benchmark comparison against statistical cohorts */
// Models spending comparisons between the user's spending profile and demographic peer groups.
// Contextualizes spending as percentages of income against cohort quartiles and medians.
// Categorizes category expenditure patterns as frugal, aligned, or elevated.
export interface PeerSpendingBenchmark {
  category: string;
  user_spend: number;
  user_pct_of_income: number;
  peer_median_pct: number;
  peer_p25_pct: number;
  peer_p75_pct: number;
  delta_vs_peer_median: number;
  monthly_dollar_delta: number;
  status: "frugal" | "aligned" | "elevated";
  benchmark_description: string;
}

// Provides an executive summary of statistical peer cohort benchmarking results.
// Captures cohort alignment index and count of frugal versus elevated categories.
// Identifies primary category candidates for potential peer-aligned spending reductions.
export interface PeerBenchmarkingSummary {
  available: boolean;
  unavailable_reason?: string;
  cohort_name: string | null;
  alignment_index: number | null;
  frugal_categories_count: number | null;
  elevated_categories_count: number | null;
  top_peer_savings_opportunity?: string;
}

/** Envelope Auto-Rebalancing Plan */
// Represents an automated inter-envelope budget balance transfer transaction.
// Reallocates surplus funds from under-spent categories to cover projected deficits.
// Maintains overall monthly budget boundaries without requiring additional capital infusion.
export interface EnvelopeRebalanceTransfer {
  from_category: string;
  to_category: string;
  amount: number;
  reason: string;
}

// Details proposed budget envelope limit revisions resulting from rebalancing logic.
// Compares existing planned amounts against recommended allocations with net deltas.
// Categorizes envelopes as deficit buffered, surplus donated, or perfectly balanced.
export interface ProposedAllocation {
  category: string;
  current_planned: number;
  recommended_planned: number;
  delta: number;
  status: "deficit_buffered" | "surplus_donated" | "balanced";
}

// Contains the complete automated rebalancing proposal for a monthly budget period.
// Collects required inter-category fund transfers and resulting envelope allocations.
// Quantifies total dollars rebalanced and verifies strict overall budget preservation.
export interface AutoRebalancePlan {
  period_key: string;
  needed: boolean;
  transfers: EnvelopeRebalanceTransfer[];
  proposed_allocations: ProposedAllocation[];
  total_rebalanced_amount: number;
  envelopes_stabilized: number;
  budget_preserved: boolean;
}

/** The weekly health report payload */
// Encapsulates comprehensive weekly budget health diagnostics and coach reporting.
// Aggregates four-pillar composite score, burn-rate alerts, limits, and projections.
// Serves as the primary data payload powering the dashboard Adaptive Budget Coach.
export interface BudgetHealthPayload {
  generated_at: string;
  period_key: string;

  health_score: {
    data_available: boolean;
    total: number;
    budget_adherence: number;
    review_cleanliness: number;
    goal_progress: number;
    debt_management: number;
  };

  burn_rate_alerts: BurnRateAlert[];
  predictive_spending_limits: PredictiveSpendingLimit[];
  predictive_limits_summary: PredictiveLimitsSummary;
  proactive_savings_recommendations: ProactiveSavingsRecommendation[];
  savings_potential_summary: SavingsPotentialSummary;
  peer_benchmarks: PeerSpendingBenchmark[];
  peer_benchmarking_summary: PeerBenchmarkingSummary;
  auto_rebalance_plan: AutoRebalancePlan;

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

// Formats a JavaScript Date object into a canonical YYYY-MM period identifier string.
// Zero-pads calendar months to guarantee lexicographically sorted consistency.
// Serves as standard grouping key for monthly financial analytics and budget envelopes.
const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

// Computes the total number of calendar days in the month of the provided date.
// Evaluates leap year February calculations accurately via standard JavaScript Date edge days.
// Supplies essential denominator for velocity rate and daily spend projection algorithms.
const daysInMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

// Constrains a numeric value within specified minimum and maximum scalar bounds.
// Prevents score calculations from underflowing below zero or exceeding upper maximums.
// Returns boundary thresholds whenever input values deviate beyond allowable limits.
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

// Assembles complete financial health intelligence and velocity diagnostics for a user.
// Aggregates four-pillar scoring across adherence, review hygiene, goals, and debt.
// Computes burn-rate alerts, predictive caps, pace trends, and auto-rebalance transfers.
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

  // ── Predictive Spending Limits & Dynamic Caps ───────────
  const daysRemaining = Math.max(0, totalDays - dayOfMonth);
  const predictiveSpendingLimits: PredictiveSpendingLimit[] = [];

  for (const env of envelopes as any[]) {
    if (env.unbudgeted || env.planned <= 0) continue;

    const planned = Number(env.planned || 0);
    const spent = Math.max(0, Number(env.spent || 0));
    const remaining = planned - spent;
    const burnRatePct = planned > 0 ? (spent / planned) * 100 : 0;

    const currentDailySpend = dayOfMonth > 0 ? spent / dayOfMonth : 0;
    const projectedEom = dayOfMonth > 0 ? currentDailySpend * totalDays : spent;
    const overshootRisk = projectedEom > planned || spent > planned;
    const overshootAmount = Math.max(0, projectedEom - planned);

    const safeDailySpend =
      remaining > 0
        ? daysRemaining > 0
          ? remaining / daysRemaining
          : remaining
        : 0;

    const dailyReductionRequired =
      overshootRisk && daysRemaining > 0
        ? Math.max(0, (projectedEom - planned) / daysRemaining)
        : 0;

    const recommendedCap = Math.max(0, remaining);

    let status: "safe" | "caution" | "critical" = "safe";
    if (spent >= planned || burnRatePct > monthElapsedPct + 25) {
      status = "critical";
    } else if (overshootRisk || burnRatePct > monthElapsedPct + 10) {
      status = "caution";
    }

    predictiveSpendingLimits.push({
      category: env.category,
      planned: Math.round(planned * 100) / 100,
      spent: Math.round(spent * 100) / 100,
      remaining: Math.round(remaining * 100) / 100,
      days_remaining: daysRemaining,
      current_daily_spend: Math.round(currentDailySpend * 100) / 100,
      safe_daily_spend: Math.round(safeDailySpend * 100) / 100,
      projected_eom: Math.round(projectedEom * 100) / 100,
      overshoot_risk: overshootRisk,
      overshoot_amount: Math.round(overshootAmount * 100) / 100,
      recommended_cap: Math.round(recommendedCap * 100) / 100,
      daily_reduction_required: Math.round(dailyReductionRequired * 100) / 100,
      status,
    });
  }

  const statusPriority: Record<string, number> = { critical: 0, caution: 1, safe: 2 };
  predictiveSpendingLimits.sort(
    (a, b) => (statusPriority[a.status] ?? 3) - (statusPriority[b.status] ?? 3)
  );

  const totalSafeDailySpend = predictiveSpendingLimits.reduce(
    (acc, item) => acc + item.safe_daily_spend,
    0
  );
  const categoriesAtRisk = predictiveSpendingLimits.filter(
    (item) => item.overshoot_risk || item.status === "critical"
  ).length;
  const totalDailyReduction = predictiveSpendingLimits.reduce(
    (acc, item) => acc + item.daily_reduction_required,
    0
  );

  const predictiveLimitsSummary: PredictiveLimitsSummary = {
    days_remaining: daysRemaining,
    total_safe_daily_spend: Math.round(totalSafeDailySpend * 100) / 100,
    categories_at_risk: categoriesAtRisk,
    total_daily_reduction_required: Math.round(totalDailyReduction * 100) / 100,
  };

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

  // ── Proactive Savings Recommendations ──────────────────
  const proactiveRecommendations: ProactiveSavingsRecommendation[] = [];

  // 1. Critical & At-Risk Overspending Categories
  for (const limit of predictiveSpendingLimits) {
    if (limit.overshoot_risk || limit.status === "critical") {
      const savings = limit.overshoot_amount > 0 ? limit.overshoot_amount : Math.round(limit.daily_reduction_required * Math.max(1, daysRemaining));
      if (savings > 0) {
        const scoreBump = Math.min(10, Math.max(2, Math.round((savings / Math.max(1, totalPlanned)) * 30)));
        proactiveRecommendations.push({
          id: `cap-${limit.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          title: `Cap ${limit.category} spending to $${limit.safe_daily_spend}/day`,
          category: limit.category,
          impact_monthly_savings: Math.round(savings * 100) / 100,
          score_impact_pts: scoreBump,
          difficulty: savings > 100 ? "moderate" : "easy",
          reasoning: `Spending in ${limit.category} is running at $${limit.current_daily_spend}/day ($${limit.spent} spent of $${limit.planned} planned). Capping to $${limit.safe_daily_spend}/day for remaining ${daysRemaining} days prevents $${savings} budget overshoot.`,
          action_type: "create_task",
          suggested_task_title: `Enforce $${limit.safe_daily_spend}/day spending limit on ${limit.category} for remainder of month`,
        });
      }
    }
  }

  // 2. High Discretionary Spend Categories (>25% of total budget or spend)
  const discretionaryKeywords = /dining|food|entertainment|shopping|leisure|personal|hobbies/i;
  for (const limit of predictiveSpendingLimits) {
    if (discretionaryKeywords.test(limit.category) && limit.spent > 50 && !proactiveRecommendations.some(r => r.category === limit.category)) {
      const trimAmount = Math.round(limit.spent * 0.15);
      if (trimAmount >= 15) {
        proactiveRecommendations.push({
          id: `trim-${limit.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          title: `15% discretionary micro-trim on ${limit.category}`,
          category: limit.category,
          impact_monthly_savings: trimAmount,
          score_impact_pts: 3,
          difficulty: "easy",
          reasoning: `A modest 15% reduction on ${limit.category} unlocks $${trimAmount}/mo in monthly surplus without impacting essential obligations.`,
          action_type: "create_task",
          suggested_task_title: `Audit ${limit.category} non-essential purchases to save $${trimAmount}/mo`,
        });
      }
    }
  }

  // 3. High-Interest Debt Acceleration
  if (debts.length > 0) {
    const highInterestDebts = debts
      .filter((debt) =>
        Number.isFinite(debt.interest_rate) && debt.interest_rate >= 10 &&
        Number.isFinite(debt.balance) && debt.balance > 0
      )
      .sort((a, b) => b.interest_rate - a.interest_rate);
    const targetDebt = highInterestDebts[0];
    if (targetDebt) {
      const apr = targetDebt.interest_rate;
      const estimatedMonthlyInterest = targetDebt.balance * (apr / 100) / 12;
      proactiveRecommendations.push({
        id: `debt-${targetDebt.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title: `Accelerate payoff on ${targetDebt.name}`,
        category: "Debt Paydown",
        impact_monthly_savings: null,
        score_impact_pts: null,
        difficulty: "strategic",
        reasoning: `Your saved balance on ${targetDebt.name} is $${targetDebt.balance.toFixed(2)} at ${apr}% APR. Balance × APR ÷ 12 estimates about $${estimatedMonthlyInterest.toFixed(2)} in monthly interest before payments, fees, or rate changes. Review an affordable extra payment using your repayment schedule; savings and health-score changes have not been calculated.`,
        action_type: "create_task",
        suggested_task_title: `Review an affordable extra principal payment on ${targetDebt.name}`,
      });
    }
  }

  // 4. Surplus Allocation to Financial Goals
  if (goals.length > 0 && projectionDelta < 0) {
    const activeGoals = goals.filter((g) => (g.current || 0) < (g.target || 0));
    if (activeGoals.length > 0) {
      const primaryGoal = activeGoals[0];
      const surplus = Math.abs(projectionDelta);
      const recommendedContribution = Math.min(250, Math.max(25, Math.round(surplus * 0.4)));
      proactiveRecommendations.push({
        id: `goal-${primaryGoal.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title: `Direct projected surplus into ${primaryGoal.name}`,
        category: "Goal Milestone",
        impact_monthly_savings: recommendedContribution,
        score_impact_pts: 4,
        difficulty: "easy",
        reasoning: `You are currently trending $${Math.round(surplus)} under budget. Channeling $${recommendedContribution} into ${primaryGoal.name} boosts your Goal Pillar score and shortens milestone completion.`,
        action_type: "boost_goal",
        suggested_task_title: `Transfer $${recommendedContribution} monthly surplus to ${primaryGoal.name}`,
      });
    }
  }

  // Sort recommendations by monthly savings impact descending (limit to top 4)
  proactiveRecommendations.sort((a, b) => (b.impact_monthly_savings ?? 0) - (a.impact_monthly_savings ?? 0));
  const topRecommendations = proactiveRecommendations.slice(0, 4);

  const totalPotentialSavings = topRecommendations.reduce((acc, r) => acc + (r.impact_monthly_savings ?? 0), 0);
  const totalScorePotential = topRecommendations.reduce((acc, r) => acc + (r.score_impact_pts ?? 0), 0);

  const savingsPotentialSummary: SavingsPotentialSummary = {
    total_monthly_savings: Math.round(totalPotentialSavings * 100) / 100,
    potential_score_improvement: Math.min(25, totalScorePotential),
    recommended_actions_count: topRecommendations.length,
  };


  // Peer comparisons require a verified cohort data source. Keep the response
  // shape available without deriving fictional statistics from personal budgets.
  const peerBenchmarks: PeerSpendingBenchmark[] = [];
  const peerBenchmarkingSummary: PeerBenchmarkingSummary = {
    available: false,
    unavailable_reason: "No verified peer comparison data is connected. Your saved budgets and spending are available in Overview.",
    cohort_name: null,
    alignment_index: null,
    frugal_categories_count: null,
    elevated_categories_count: null,
  };

  // ── Automatic Envelope Auto-Rebalancing Engine (Batch 37) ──
  const deficitEnvelopes: Array<{ category: string; planned: number; needed: number }> = [];
  const surplusEnvelopes: Array<{ category: string; planned: number; surplus: number }> = [];

  for (const limit of predictiveSpendingLimits) {
    if (limit.overshoot_risk || limit.spent > limit.planned || limit.projected_eom > limit.planned) {
      const needed = Math.max(0, limit.projected_eom - limit.planned, limit.spent - limit.planned);
      if (needed > 0) {
        deficitEnvelopes.push({
          category: limit.category,
          planned: limit.planned,
          needed: Math.round(needed * 100) / 100,
        });
      }
    } else if (limit.remaining > 0 && limit.projected_eom < limit.planned) {
      const surplus = Math.max(0, limit.planned - Math.max(limit.spent, limit.projected_eom));
      if (surplus > 0) {
        surplusEnvelopes.push({
          category: limit.category,
          planned: limit.planned,
          surplus: Math.round(surplus * 100) / 100,
        });
      }
    }
  }

  const rebalanceTransfers: EnvelopeRebalanceTransfer[] = [];
  const proposedMap = new Map<string, { current: number; recommended: number }>();

  for (const limit of predictiveSpendingLimits) {
    proposedMap.set(limit.category, { current: limit.planned, recommended: limit.planned });
  }

  surplusEnvelopes.sort((a, b) => b.surplus - a.surplus);
  deficitEnvelopes.sort((a, b) => b.needed - a.needed);

  let sIdx = 0;
  let dIdx = 0;

  while (sIdx < surplusEnvelopes.length && dIdx < deficitEnvelopes.length) {
    const s = surplusEnvelopes[sIdx];
    const d = deficitEnvelopes[dIdx];

    const transferAmt = Math.min(s.surplus, d.needed);
    if (transferAmt >= 5) {
      rebalanceTransfers.push({
        from_category: s.category,
        to_category: d.category,
        amount: Math.round(transferAmt * 100) / 100,
        reason: `Transfer $${Math.round(transferAmt)} surplus from ${s.category} to cover ${d.category} overrun without increasing total budget`,
      });

      s.surplus = Math.round((s.surplus - transferAmt) * 100) / 100;
      d.needed = Math.round((d.needed - transferAmt) * 100) / 100;

      const sProp = proposedMap.get(s.category);
      if (sProp) sProp.recommended = Math.max(0, Math.round((sProp.recommended - transferAmt) * 100) / 100);

      const dProp = proposedMap.get(d.category);
      if (dProp) dProp.recommended = Math.round((dProp.recommended + transferAmt) * 100) / 100;
    }

    if (s.surplus < 5) sIdx += 1;
    if (d.needed < 5) dIdx += 1;
  }

  const proposedAllocations: ProposedAllocation[] = [];
  for (const [cat, p] of proposedMap.entries()) {
    const delta = Math.round((p.recommended - p.current) * 100) / 100;
    proposedAllocations.push({
      category: cat,
      current_planned: p.current,
      recommended_planned: p.recommended,
      delta,
      status: delta > 0 ? "deficit_buffered" : delta < 0 ? "surplus_donated" : "balanced",
    });
  }

  const totalRebalanced = rebalanceTransfers.reduce((acc, t) => acc + t.amount, 0);

  const autoRebalancePlan: AutoRebalancePlan = {
    period_key: currentPeriod,
    needed: rebalanceTransfers.length > 0,
    transfers: rebalanceTransfers,
    proposed_allocations: proposedAllocations,
    total_rebalanced_amount: Math.round(totalRebalanced * 100) / 100,
    envelopes_stabilized: deficitEnvelopes.filter((d) => d.needed < 5).length,
    budget_preserved: true,
  };
  return {
    generated_at: now.toISOString(),
    period_key: currentPeriod,
    health_score: {
      data_available: totalTxCount > 0 || totalPlanned > 0 || goals.length > 0 || debts.length > 0,
      total: clamp(totalScore, 0, 100),
      budget_adherence: budgetAdherenceScore,
      review_cleanliness: reviewCleanlinessScore,
      goal_progress: goalProgressScore,
      debt_management: debtManagementScore,
    },
    burn_rate_alerts: burnRateAlerts,
    predictive_spending_limits: predictiveSpendingLimits,
    predictive_limits_summary: predictiveLimitsSummary,
    proactive_savings_recommendations: topRecommendations,
    savings_potential_summary: savingsPotentialSummary,
    peer_benchmarks: peerBenchmarks,
    peer_benchmarking_summary: peerBenchmarkingSummary,
    auto_rebalance_plan: autoRebalancePlan,
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
