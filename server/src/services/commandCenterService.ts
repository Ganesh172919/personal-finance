/**
 * @fileoverview Command Center Service
 *
 * Aggregates data from multiple sources into a unified "Today in FinWise"
 * payload. This is the primary daily-use data feed that powers the Financial
 * Command Center dashboard.
 *
 * ============================================================================
 * MINDMAP FLOW: COMMAND CENTER COCKPIT DATA AGGREGATION & TRIAGE
 * ============================================================================
 * - Command Center Daily Cockpit
 *     ├── 1. Concurrent Parallel Ingestion (Promise.all)
 *     │   ├── Liquid Accounts: Checking, savings, cash, wallet balances
 *     │   ├── User Financial Profile: Active goals & structured debts
 *     │   ├── 30-Day Expense History: Average daily burn rate derivation
 *     │   ├── Month-to-Date Spend: Current cycle outflow total
 *     │   ├── Budget Envelopes: Planned vs actual category spending
 *     │   ├── Recurring Rules: Confirmed bills scheduled in next 7 days
 *     │   ├── Calendar Reminders: Approaching financial milestones
 *     │   ├── Task Queue: Open, due soon, and overdue action items
 *     │   └── Recurring Candidates: Unapproved risky subscription detections
 *     ├── 2. Core Financial Metric Derivation
 *     │   ├── Cash Runway: Liquid balance / avg daily burn -> Days remaining
 *     │   ├── Budget Burn Velocity: (Day of month / Days in month) vs (Spent / Planned)
 *     │   ├── Month-End Spending Projection: Projected total vs Planned envelope
 *     │   └── Debt Service Pressure: Min payments due vs liquid cash availability
 *     ├── 3. Tri-Tier Signal Prioritization Engine
 *     │   ├── ACT_NOW: Runway < 14 days, budget blown (>110%), overdue tasks/bills
 *     │   ├── REVIEW_THIS_WEEK: Tasks due in 3 days, pace 95-105%, recurring candidates
 *     │   └── SAFE_TO_IGNORE: Fully funded goals, surplus buffer, healthy runway
 *     └── 4. Unified Client Payload Synthesis
 *         └── JSON envelope with time-of-day greeting (morning/afternoon/evening)
 *
 * ============================================================================
 * ASCII FLOW: DATA AGGREGATION & SIGNAL TRIAGING LIFECYCLE
 * ============================================================================
 *                        [ Client Dashboard Request ]
 *                                     |
 *                                     v
 *                  +--------------------------------------+
 *                  |   Promise.all Concurrent Queries     |
 *                  +------------------+-------------------+
 *                                     |
 *      +------------+-----------+----+----+-----------+------------+
 *      |            |           |         |           |            |
 *      v            v           v         v           v            v
 *  [Accounts] [Transactions] [Budgets] [Rules]   [Reminders]    [Tasks]
 *  Liquid $    30d Daily Burn Planned   Bills 7d  Events 7d     Overdue/
 *              MTD Outflows   vs Spent                          Due Soon
 *      |            |           |         |           |            |
 *      +------------+-----------+----+----+-----------+------------+
 *                                     |
 *                                     v
 *                  +--------------------------------------+
 *                  |     Financial Metric Calculations    |
 *                  | * Runway Days = Liquid / DailySpend  |
 *                  | * Month Burn % = Spent / Planned     |
 *                  | * Projected Total = (Spent/Day)*Days |
 *                  +------------------+-------------------+
 *                                     |
 *                                     v
 *                  +--------------------------------------+
 *                  |    Signal Priority Classification    |
 *                  +------------------+-------------------+
 *                          /          |          \
 *                         /           |           \
 *                        v            v            v
 *                 [ ACT_NOW ]  [ REVIEW_WEEK ]  [ SAFE_TO_IGNORE ]
 *                 Overdue debt  Pacing 95-105%   Goals on track
 *                 Runway <14d   Pending tasks    Runway >90 days
 *                        \            |            /
 *                         \           |           /
 *                          v          v          v
 *                  +--------------------------------------+
 *                  |  buildCommandCenterPayload() Output  |
 *                  |  Delivered to FinanceOS Cockpit UI   |
 *                  +--------------------------------------+
 *
 * DATA SOURCES:
 * - Accounts: Liquid balance (cash runway calculation)
 * - Transactions: Current-month spending velocity and daily burn rate
 * - Budget Envelopes: Planned vs. spent per category
 * - Recurring Rules: Upcoming bills in the next 7 days
 * - Calendar Reminders: Upcoming financial events
 * - Tasks: Open tasks with due-soon breakdown
 * - Goals: Progress and at-risk status
 * - Debts: Total minimum payments vs. available cash
 * - Recurring Candidates: Risky subscriptions without approved rules
 *
 * PRIORITY CHIPS:
 * Each signal is classified into one of three urgency levels:
 * - "act_now":         Requires immediate action (overdue bills, budget blown)
 * - "review_this_week": Should be handled this week (low confidence txns, tasks)
 * - "safe_to_ignore":   Informational only (on-track goals, small variances)
 *
 * @module services/commandCenterService
 */

import mongoose from "mongoose";

import AccountModel from "../models/accountModel";
import CalendarReminderModel from "../models/calendarReminderModel";
import RecurringRuleModel from "../models/recurringRuleModel";
import TaskModel from "../models/taskModel";
import TransactionModel from "../models/transactionModel";
import { ensureProfile } from "./profileService";
import { getBudgetEnvelopes } from "./financeIntelligence";
import { detectRecurringCandidates } from "./financeIntelligence";
import type { IFinancialGoal, IDebt } from "../models/financialProfileModel";

/** Priority classification for command center signals */
export type PriorityLevel = "act_now" | "review_this_week" | "safe_to_ignore";

/** A single prioritized signal shown in the command center */
export interface CommandCenterSignal {
  id: string;
  title: string;
  detail: string;
  priority: PriorityLevel;
  metric?: number;
  action_href?: string;
}

/** Multi-account consolidated netting breakdown */
export interface ConsolidatedNetting {
  liquid_assets: number;
  investment_assets: number;
  total_assets: number;
  credit_liabilities: number;
  profile_debts: number;
  total_liabilities: number;
  net_liquid_cash: number;
  net_worth: number;
  netting_status: "surplus" | "balanced" | "deficit";
  net_runway_days: number | null;
  account_breakdown: Array<{
    id: string;
    name: string;
    type: string;
    balance: number;
    currency: string;
  }>;
}

/** The complete command center payload */
export interface CommandCenterPayload {
  generated_at: string;
  time_of_day: "morning" | "afternoon" | "evening";

  cash_runway: {
    balance_available: boolean;
    liquid_balance: number;
    net_liquid_balance?: number;
    avg_daily_expense: number;
    days_remaining: number | null;
    net_days_remaining?: number | null;
    currency: string;
  };

  consolidated_netting: ConsolidatedNetting;

  budget_burn: {
    period_key: string;
    total_planned: number;
    total_spent: number;
    burn_rate_pct: number;
    day_of_month: number;
    days_in_month: number;
    month_elapsed_pct: number;
    projected_total: number;
    on_pace: boolean;
    overshoot_amount: number;
    categories_over_budget: Array<{
      category: string;
      planned: number;
      spent: number;
      over_by: number;
    }>;
  };

  upcoming_bills: Array<{
    id: string;
    name: string;
    amount_estimate: number;
    due_date: string;
    category?: string;
  }>;

  risky_subscriptions: Array<{
    id: string;
    description: string;
    amount_avg: number;
    cadence: string;
    confidence: number;
  }>;

  debt_pressure: {
    total_minimum_due: number;
    total_debt_balance: number;
    debt_count: number;
    pressure_level: PriorityLevel;
  };

  pending_tasks: {
    open: number;
    due_soon: number;
    overdue: number;
  };

  goals_snapshot: {
    total: number;
    on_track: number;
    at_risk: number;
    overall_progress_pct: number;
  };

  priority_signals: CommandCenterSignal[];
}

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const daysInMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

const getTimeOfDay = (hour: number): "morning" | "afternoon" | "evening" =>
  hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

export const buildCommandCenterPayload = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
}): Promise<CommandCenterPayload> => {
  const now = new Date();
  const currentPeriod = monthKey(now);
  const dayOfMonth = now.getDate();
  const totalDays = daysInMonth(now);
  const monthElapsedPct = (dayOfMonth / totalDays) * 100;
  const hour = now.getHours();

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysBack = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Parallel data fetching
  const [
    accounts,
    accountTxAgg,
    profile,
    recentSpendAgg,
    currentMonthSpendAgg,
    budgetEnvelopes,
    upcomingRules,
    upcomingReminders,
    taskCounts,
    recurringCandidates,
  ] = await Promise.all([
    // All active accounts across all types for consolidated netting & runway
    AccountModel.find({
      orgId: params.orgId,
      status: { $ne: "closed" },
    })
      .select({ _id: 1, name: 1, type: 1, currency: 1, openingBalance: 1, balance: 1 })
      .lean()
      .catch(() => []),

    // Account transaction totals to derive current balances
    TransactionModel.aggregate([
      {
        $match: {
          orgId: params.orgId,
          accountId: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$accountId",
          total: { $sum: "$amount" },
        },
      },
    ]).catch(() => []),

    // User financial profile (goals, debts)
    ensureProfile({ orgId: params.orgId, userId: params.userId }),

    // Average daily expense over last 30 days
    TransactionModel.aggregate([
      {
        $match: {
          orgId: params.orgId,
          userId: params.userId,
          date: { $gte: thirtyDaysBack, $lte: now },
          amount: { $lt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          total_expense: { $sum: { $abs: "$amount" } },
          count: { $sum: 1 },
        },
      },
    ]).catch(() => []),

    // Current month spending total
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
          total_spent: { $sum: { $abs: "$amount" } },
        },
      },
    ]).catch(() => []),

    // Budget envelopes for current period
    getBudgetEnvelopes({ orgId: params.orgId, periodKey: currentPeriod }).catch(
      () => null
    ),

    // Upcoming recurring rules (next 7 days)
    RecurringRuleModel.find({
      orgId: params.orgId,
      status: "active",
    })
      .select({
        merchantName: 1,
        category: 1,
        amountMin: 1,
        amountMax: 1,
        cron: 1,
        name: 1,
      })
      .lean()
      .catch(() => []),

    // Upcoming calendar reminders
    CalendarReminderModel.find({
      orgId: params.orgId,
      userId: params.userId,
      completed: false,
      date: {
        $gte: now.toISOString().slice(0, 10),
        $lte: sevenDaysAhead.toISOString().slice(0, 10),
      },
    })
      .select({ title: 1, date: 1, amount: 1 })
      .lean()
      .catch(() => []),

    // Task counts
    TaskModel.aggregate([
      {
        $match: {
          orgId: params.orgId,
          userId: params.userId,
          status: "open",
        },
      },
      {
        $group: {
          _id: null,
          open: { $sum: 1 },
          due_soon: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$dueDate", null] },
                    { $lte: ["$dueDate", sevenDaysAhead] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$dueDate", null] },
                    { $lt: ["$dueDate", now] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]).catch(() => []),

    // Recurring candidates (risky subscriptions)
    detectRecurringCandidates({
      orgId: params.orgId,
      daysBack: 180,
      limit: 5,
      minOccurrences: 3,
    }).catch(() => ({ org_id: params.orgId.toString(), days_back: 180, candidates: [] })),
  ]);

  // ── Multi-Account Consolidated Netting & Balances ────
  const txTotalByAccount = new Map<string, number>(
    (accountTxAgg as any[]).map((row: any) => [
      String(row?._id),
      Number(row?.total || 0),
    ])
  );

  let liquidAssets = 0;
  let investmentAssets = 0;
  let creditLiabilities = 0;

  const accountBreakdown: Array<{
    id: string;
    name: string;
    type: string;
    balance: number;
    currency: string;
  }> = [];

  const liquidTypes = new Set(["checking", "savings", "cash", "wallet"]);

  for (const acc of (accounts as any[])) {
    const accountId = String(acc._id || "");
    const txTotal = txTotalByAccount.get(accountId) || 0;
    const rawBalance =
      acc.balance !== undefined
        ? Number(acc.balance)
        : Number(acc.openingBalance || 0) + txTotal;

    const roundedBalance = Math.round(rawBalance * 100) / 100;
    const accType = String(acc.type || "checking").toLowerCase();

    accountBreakdown.push({
      id: accountId,
      name: String(acc.name || "Account"),
      type: accType,
      balance: roundedBalance,
      currency: String(acc.currency || "USD"),
    });

    if (liquidTypes.has(accType)) {
      liquidAssets += Math.max(0, roundedBalance);
    } else if (accType === "brokerage" || accType === "investment") {
      investmentAssets += Math.max(0, roundedBalance);
    } else if (accType === "credit") {
      creditLiabilities += Math.abs(roundedBalance);
    }
  }

  // ── Debt Pressure & Profile Debts ─────────────────────
  const debts = Array.isArray(profile.debts) ? (profile.debts as IDebt[]) : [];
  const totalMinimumDue = debts.reduce(
    (sum, d) => sum + Number(d.minimum_payment || 0),
    0
  );
  const totalDebtBalance = debts.reduce(
    (sum, d) => sum + Number(d.balance || 0),
    0
  );
  const profileDebts = totalDebtBalance;

  const totalAssets = liquidAssets + investmentAssets;
  const totalLiabilities = creditLiabilities + profileDebts;
  const netLiquidCash = liquidAssets - creditLiabilities;
  const netWorth = totalAssets - totalLiabilities;

  const nettingStatus: "surplus" | "balanced" | "deficit" =
    netLiquidCash > 0 ? "surplus" : netLiquidCash === 0 ? "balanced" : "deficit";

  const recentSpend = (recentSpendAgg as any[])?.[0];
  const totalExpense30d = Number(recentSpend?.total_expense || 0);
  const avgDailyExpense = totalExpense30d > 0 ? totalExpense30d / 30 : 0;
  const daysRemaining =
    accounts.length > 0 && avgDailyExpense > 0
      ? Math.round(liquidAssets / avgDailyExpense)
      : null;

  const netRunwayDays =
    accounts.length > 0 && avgDailyExpense > 0
      ? netLiquidCash > 0
        ? Math.round(netLiquidCash / avgDailyExpense)
        : 0
      : null;

  const debtPressure: PriorityLevel =
    totalMinimumDue > liquidAssets * 0.5
      ? "act_now"
      : totalMinimumDue > liquidAssets * 0.25
        ? "review_this_week"
        : "safe_to_ignore";

  // ── Budget Burn ───────────────────────────────────────
  const totalPlanned = budgetEnvelopes?.totals?.planned || 0;
  const totalSpent = budgetEnvelopes?.totals?.spent || 0;
  const burnRatePct = totalPlanned > 0 ? (totalSpent / totalPlanned) * 100 : 0;
  const currentDailyRate =
    dayOfMonth > 0 ? totalSpent / dayOfMonth : 0;
  const projectedTotal = currentDailyRate * totalDays;
  const overshootAmount = Math.max(0, projectedTotal - totalPlanned);
  const onPace = burnRatePct <= monthElapsedPct + 10; // 10% tolerance

  const categoriesOverBudget = (budgetEnvelopes?.envelopes || [])
    .filter((env: any) => !env.unbudgeted && env.planned > 0 && env.spent > env.planned)
    .map((env: any) => ({
      category: env.category,
      planned: env.planned,
      spent: env.spent,
      over_by: Math.round((env.spent - env.planned) * 100) / 100,
    }));

  // ── Upcoming Bills ────────────────────────────────────
  const upcomingBills = (upcomingReminders as any[])
    .map((reminder: any) => ({
      id: String(reminder._id),
      name: String(reminder.title || "Upcoming bill"),
      amount_estimate: Number(reminder.amount || 0),
      due_date: String(reminder.date || ""),
    }))
    .slice(0, 10);

  // ── Risky Subscriptions ───────────────────────────────
  const riskySubscriptions = (recurringCandidates.candidates || [])
    .filter((c: any) => c.confidence >= 0.6)
    .slice(0, 5)
    .map((c: any) => ({
      id: c.candidate_id,
      description: c.description_sample,
      amount_avg: c.amount_avg,
      cadence: c.cadence,
      confidence: c.confidence,
    }));

  // ── Tasks ─────────────────────────────────────────────
  const taskData = (taskCounts as any[])?.[0] || {
    open: 0,
    due_soon: 0,
    overdue: 0,
  };

  // ── Goals Snapshot ────────────────────────────────────
  const goals = Array.isArray(profile.goals)
    ? (profile.goals as IFinancialGoal[])
    : [];
  const totalGoalTarget = goals.reduce(
    (sum, g) => sum + Number(g.target || 0),
    0
  );
  const totalGoalCurrent = goals.reduce(
    (sum, g) => sum + Number(g.current || 0),
    0
  );
  const overallProgressPct =
    totalGoalTarget > 0 ? (totalGoalCurrent / totalGoalTarget) * 100 : 0;
  const onTrack = goals.filter(
    (g) =>
      Number(g.target || 0) > 0 &&
      Number(g.current || 0) / Number(g.target) >= 0.4
  ).length;
  const atRisk = goals.length - onTrack;

  // ── Priority Signals ──────────────────────────────────
  const signals: CommandCenterSignal[] = [];

  // Overdue tasks
  if (taskData.overdue > 0) {
    signals.push({
      id: "overdue_tasks",
      title: `${taskData.overdue} overdue task${taskData.overdue > 1 ? "s" : ""}`,
      detail: "These tasks are past their due date and need attention.",
      priority: "act_now",
      metric: taskData.overdue,
      action_href: "/tasks",
    });
  }

  // Budget overshoot warning
  if (!onPace && totalPlanned > 0 && burnRatePct > 80 && monthElapsedPct < 70) {
    signals.push({
      id: "budget_overshoot",
      title: "Budget is running ahead of pace",
      detail: `You've used ${Math.round(burnRatePct)}% of your budget with ${Math.round(100 - monthElapsedPct)}% of the month remaining.`,
      priority: "act_now",
      metric: Math.round(overshootAmount),
      action_href: "/finance",
    });
  }

  // Categories over budget
  for (const cat of categoriesOverBudget.slice(0, 3)) {
    signals.push({
      id: `over_budget_${cat.category}`,
      title: `${cat.category} is over budget`,
      detail: `Spent ${cat.spent.toFixed(0)} of ${cat.planned.toFixed(0)} planned (over by ${cat.over_by.toFixed(0)}).`,
      priority: "review_this_week",
      metric: cat.over_by,
      action_href: "/finance",
    });
  }

  // Multi-Account Consolidated Netting Deficit
  if (creditLiabilities > 0 && netLiquidCash < 0) {
    signals.push({
      id: "credit_deficit_netting",
      title: "Credit card debt exceeds liquid cash reserve",
      detail: `Credit obligations ($${Math.round(creditLiabilities).toLocaleString()}) exceed liquid assets ($${Math.round(liquidAssets).toLocaleString()}) by $${Math.round(Math.abs(netLiquidCash)).toLocaleString()}.`,
      priority: "act_now",
      metric: Math.round(Math.abs(netLiquidCash)),
      action_href: "/finance?tab=accounts",
    });
  } else if (creditLiabilities > 0 && liquidAssets > 0 && creditLiabilities > 0.5 * liquidAssets) {
    signals.push({
      id: "high_credit_utilization_netting",
      title: "Credit obligations absorb >50% of cash reserve",
      detail: `Credit card balances ($${Math.round(creditLiabilities).toLocaleString()}) absorb ${Math.round((creditLiabilities / liquidAssets) * 100)}% of your liquid cash reserve.`,
      priority: "review_this_week",
      metric: Math.round(creditLiabilities),
      action_href: "/finance?tab=accounts",
    });
  }

  // Net Runway Alert if net buffer is dangerously tight (< 14 days) while gross runway looked ok
  if (
    netRunwayDays !== null &&
    netRunwayDays < 14 &&
    daysRemaining !== null &&
    daysRemaining >= 14 &&
    creditLiabilities > 0
  ) {
    signals.push({
      id: "net_runway_risk",
      title: `Net cash runway is only ~${netRunwayDays} days`,
      detail: `After netting credit card obligations, your net runway drops from ${daysRemaining} to ${netRunwayDays} days.`,
      priority: "act_now",
      metric: netRunwayDays,
      action_href: "/finance?tab=accounts",
    });
  }

  // Debt pressure
  if (accounts.length > 0 && debtPressure === "act_now") {
    signals.push({
      id: "debt_pressure",
      title: "Debt payments exceed half your liquid balance",
      detail: `Minimum payments total ${totalMinimumDue.toFixed(0)} against ${liquidAssets.toFixed(0)} available.`,
      priority: "act_now",
      metric: totalMinimumDue,
      action_href: "/goals-debts",
    });
  }

  // Due-soon tasks
  if (taskData.due_soon > 0 && taskData.overdue === 0) {
    signals.push({
      id: "due_soon_tasks",
      title: `${taskData.due_soon} task${taskData.due_soon > 1 ? "s" : ""} due this week`,
      detail: "Review your task list to stay ahead.",
      priority: "review_this_week",
      metric: taskData.due_soon,
      action_href: "/tasks",
    });
  }

  // Low cash runway
  if (daysRemaining !== null && daysRemaining < 30) {
    signals.push({
      id: "low_cash_runway",
      title: `~${daysRemaining} days of cash runway`,
      detail:
        "Based on your average daily spending, your liquid balance will run out soon.",
      priority: daysRemaining < 14 ? "act_now" : "review_this_week",
      metric: daysRemaining,
      action_href: "/analytics",
    });
  }

  // Goals on track
  if (goals.length > 0 && atRisk === 0) {
    signals.push({
      id: "goals_on_track",
      title: "All goals are on track",
      detail: `${goals.length} goal${goals.length > 1 ? "s" : ""} progressing well.`,
      priority: "safe_to_ignore",
      metric: goals.length,
      action_href: "/goals-debts",
    });
  }

  // At-risk goals
  if (atRisk > 0) {
    signals.push({
      id: "goals_at_risk",
      title: `${atRisk} goal${atRisk > 1 ? "s" : ""} need${atRisk === 1 ? "s" : ""} attention`,
      detail: "These goals are progressing slower than expected.",
      priority: "review_this_week",
      metric: atRisk,
      action_href: "/goals-debts",
    });
  }

  // Sort by priority
  const priorityOrder: Record<PriorityLevel, number> = {
    act_now: 0,
    review_this_week: 1,
    safe_to_ignore: 2,
  };
  signals.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return {
    generated_at: now.toISOString(),
    time_of_day: getTimeOfDay(hour),
    cash_runway: {
      balance_available: accounts.length > 0,
      liquid_balance: Math.round(liquidAssets * 100) / 100,
      net_liquid_balance: Math.round(netLiquidCash * 100) / 100,
      avg_daily_expense: Math.round(avgDailyExpense * 100) / 100,
      days_remaining: daysRemaining,
      net_days_remaining: netRunwayDays,
      currency: budgetEnvelopes?.currency || "USD",
    },
    consolidated_netting: {
      liquid_assets: Math.round(liquidAssets * 100) / 100,
      investment_assets: Math.round(investmentAssets * 100) / 100,
      total_assets: Math.round(totalAssets * 100) / 100,
      credit_liabilities: Math.round(creditLiabilities * 100) / 100,
      profile_debts: Math.round(profileDebts * 100) / 100,
      total_liabilities: Math.round(totalLiabilities * 100) / 100,
      net_liquid_cash: Math.round(netLiquidCash * 100) / 100,
      net_worth: Math.round(netWorth * 100) / 100,
      netting_status: nettingStatus,
      net_runway_days: netRunwayDays,
      account_breakdown: accountBreakdown,
    },
    budget_burn: {
      period_key: currentPeriod,
      total_planned: Math.round(totalPlanned * 100) / 100,
      total_spent: Math.round(totalSpent * 100) / 100,
      burn_rate_pct: Math.round(burnRatePct * 10) / 10,
      day_of_month: dayOfMonth,
      days_in_month: totalDays,
      month_elapsed_pct: Math.round(monthElapsedPct * 10) / 10,
      projected_total: Math.round(projectedTotal * 100) / 100,
      on_pace: onPace,
      overshoot_amount: Math.round(overshootAmount * 100) / 100,
      categories_over_budget: categoriesOverBudget,
    },
    upcoming_bills: upcomingBills,
    risky_subscriptions: riskySubscriptions,
    debt_pressure: {
      total_minimum_due: Math.round(totalMinimumDue * 100) / 100,
      total_debt_balance: Math.round(totalDebtBalance * 100) / 100,
      debt_count: debts.length,
      pressure_level: debtPressure,
    },
    pending_tasks: {
      open: Number(taskData.open || 0),
      due_soon: Number(taskData.due_soon || 0),
      overdue: Number(taskData.overdue || 0),
    },
    goals_snapshot: {
      total: goals.length,
      on_track: onTrack,
      at_risk: atRisk,
      overall_progress_pct: Math.round(overallProgressPct * 10) / 10,
    },
    priority_signals: signals,
  };
};
