/**
 * @fileoverview Health Score Trend Service
 *
 * Manages financial health score history, trend detection, and analysis.
 * Health scores are computed by the AI Core's IncomeExpenseAnalyzerAgent
 * and persisted here for historical tracking.
 *
 * FEATURES:
 * - Store health scores with breakdowns
 * - Detect trends (improving, stable, declining)
 * - Provide historical data for chart visualization
 * - Alert on significant score changes
 *
 * MINDMAP FLOW
 * ------------
 * ```
 * HealthScore Service
 * ├── 1. Period Identification (getCurrentPeriod)
 * │   └── YYYY-MM UTC period key format
 * ├── 2. Score Ingestion & Component Breakdown
 * │   ├── Overall Score (0-100)
 * │   ├── savingsRate component (0-25)
 * │   ├── debtManagement component (0-25)
 * │   ├── budgetAdherence component (0-25)
 * │   └── emergencyFund component (0-25)
 * ├── 3. Upsert Logic (recordHealthScore)
 * │   ├── Find score by userId + orgId + period
 * │   ├── Update existing record or insert new monthly snapshot
 * │   └── Grade assignment (A, B, C, D, F)
 * └── 4. Trend Analysis Engine (getHealthScoreTrend)
 *     ├── Fetch last 6-12 historical periods
 *     ├── Compare Current vs Previous Score
 *     ├── Trend Categorization:
 *     │   ├── improving (delta >= +3 pts)
 *     │   ├── declining (delta <= -3 pts)
 *     │   └── stable (-3 < delta < +3)
 *     └── Significant Change Alert Flagging
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +---------------------------------------------------------------+
 *   |       Input: User Health Score & 4-Factor Breakdown           |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |                Determine Period (YYYY-MM)                     |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |         Upsert into HealthScore Model (MongoDB)               |
 *   |  - Save score, grade, savings, debt, budget, emergency        |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |                    Trend Evaluation Loop                      |
 *   |  - Compare current score against previous period's score      |
 *   |  - Calculate delta = (current.score - previous.score)         |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                       [Evaluate Delta Threshold]
 *                               /   |   \
 *                              /    |    \
 *                             v     v     v
 *                 delta >= 3     |delta| < 3    delta <= -3
 *                 "improving"      "stable"     "declining"
 *                             \     |     /
 *                              \    |    /
 *                               v   v   v
 *   +---------------------------------------------------------------+
 *   | Return HealthScoreTrend object for Dashboard charts and alert |
 *   +---------------------------------------------------------------+
 * ```
 *
 * @module services/healthScoreService
 */

import { HealthScore, IHealthScore } from "../models/HealthScore.js";
import { logger } from "../config/logger.js";

// Input contract for recording and calculating user financial health metrics.
// Encapsulates overall health scores alongside four key financial dimensions.
// Used by ingestion pipelines receiving evaluations from analytical agents.
interface HealthScoreInput {
  userId: string;
  orgId: string;
  score: number;
  breakdown: {
    savingsRate: number;
    debtManagement: number;
    budgetAdherence: number;
    emergencyFund: number;
  };
}

// Trend analysis representation comparing current and historical health scores.
// Encapsulates comparative deltas, trajectory direction, and chronological logs.
// Powers frontend dashboard indicators and predictive financial insights.
interface HealthScoreTrend {
  current: IHealthScore | null;
  previous: IHealthScore | null;
  trend: "improving" | "stable" | "declining";
  change: number; // Difference from previous score
  history: IHealthScore[];
}

/**
 * Record a new health score for the current period.
 * If a score already exists for this period, it is updated.
 */
// Records or updates the monthly financial health score snapshot for a user.
// Performs upsert operations keyed by tenancy identifiers and current period.
// Emits structured diagnostic logs and returns the saved score document.
export async function recordHealthScore(input: HealthScoreInput): Promise<IHealthScore> {
  const period = getCurrentPeriod();

  const existing = await HealthScore.findOne({
    userId: input.userId,
    orgId: input.orgId,
    period,
  });

  if (existing) {
    existing.score = input.score;
    existing.breakdown = input.breakdown;
    existing.computedAt = new Date();
    await existing.save();

    logger.debug(
      { userId: input.userId, orgId: input.orgId, period, score: input.score },
      "Health score updated for period"
    );
    return existing;
  }

  const healthScore = new HealthScore({
    userId: input.userId,
    orgId: input.orgId,
    score: input.score,
    breakdown: input.breakdown,
    period,
    computedAt: new Date(),
  });

  await healthScore.save();

  logger.debug(
    { userId: input.userId, orgId: input.orgId, period, score: input.score },
    "Health score recorded for period"
  );

  return healthScore;
}

/**
 * Get the health score trend for a user.
 * Returns current score, previous score, trend direction, and history.
 */
// Evaluates historical trajectory patterns across recent health score periods.
// Computes point differentials between consecutive monthly evaluations.
// Returns categorized trend vectors alongside chronological score histories.
export async function getHealthScoreTrend(
  userId: string,
  orgId: string,
  months: number = 6
): Promise<HealthScoreTrend> {
  const history = await HealthScore.getTrend(userId, orgId, months);
  const trend = HealthScore.computeTrend(history);

  const current = history[0] || null;
  const previous = history[1] || null;
  const change = current && previous ? current.score - previous.score : 0;

  return {
    current,
    previous,
    trend,
    change,
    history,
  };
}

/**
 * Get health score history for chart rendering.
 * Returns data points formatted for Recharts.
 */
// Formats historical health scores into data structures tailored for charts.
// Pulls chronological score records filtered by user and organization context.
// Maps score components into modular datasets suitable for visual graphing.
export async function getHealthScoreChart(
  userId: string,
  orgId: string,
  months: number = 12
): Promise<Array<{ period: string; score: number; breakdown: Record<string, number> }>> {
  const scores = await HealthScore.find({ userId, orgId })
    .sort({ computedAt: 1 })
    .limit(months)
    .lean();

  return scores.map((s) => ({
    period: s.period,
    score: s.score,
    breakdown: {
      savingsRate: s.breakdown.savingsRate,
      debtManagement: s.breakdown.debtManagement,
      budgetAdherence: s.breakdown.budgetAdherence,
      emergencyFund: s.breakdown.emergencyFund,
    },
  }));
}

/**
 * Check if the health score has changed significantly since last period.
 * Returns an alert if the change exceeds the threshold.
 */
// Evaluates whether recent score fluctuations breach defined alert boundaries.
// Compares point differentials against configurable sensitivity thresholds.
// Generates contextual alert notifications when significant changes occur.
export async function checkHealthScoreAlert(
  userId: string,
  orgId: string,
  threshold: number = 10
): Promise<{ alert: boolean; message?: string; change?: number } | null> {
  const trend = await getHealthScoreTrend(userId, orgId, 2);

  if (!trend.current || !trend.previous) {
    return null;
  }

  const change = trend.current.score - trend.previous.score;

  if (Math.abs(change) >= threshold) {
    const direction = change > 0 ? "improved" : "declined";
    return {
      alert: true,
      message: `Your financial health score ${direction} by ${Math.abs(change)} points this month.`,
      change,
    };
  }

  return null;
}

/**
 * Get the current period string (YYYY-MM format).
 */
// Generates the standard monthly calendar period string in YYYY-MM format.
// Formats current UTC year and zero-padded month components cleanly.
// Serves as the primary idempotency partition key for monthly health snapshots.
function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
