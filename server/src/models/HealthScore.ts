/**
 * @fileoverview Health Score History Model
 *
 * Persists financial health scores over time for trend tracking.
 * Each record represents a health score calculation at a specific point in time.
 *
 * Health scores are computed by the IncomeExpenseAnalyzerAgent (0-100 scale)
 * and stored here for historical trend analysis.
 *
 * TREND DETECTION:
 * - Improving: Last 3 scores show upward trend
 * - Stable: Last 3 scores within ±5 points
 * - Declining: Last 3 scores show downward trend
 *
 * MINDMAP FLOW
 * ------------
 * ```
 * HealthScore Data Model
 * ├── 1. Tenant Partitioning
 * │   ├── userId: string (indexed)
 * │   ├── orgId: string (indexed)
 * │   └── period: string (e.g., "2026-07")
 * ├── 2. Core Scoring Metrics (0-100 total)
 * │   ├── savingsRate (0-25)
 * │   ├── debtManagement (0-25)
 * │   ├── budgetAdherence (0-25)
 * │   └── emergencyFund (0-25)
 * ├── 3. Trend State
 * │   ├── trend: "improving" | "stable" | "declining"
 * │   └── computedAt: Date
 * └── 4. Static Methods
 *     ├── getLatest(userId, orgId)
 *     ├── getTrend(userId, orgId, months)
 *     └── computeTrend(scores)
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +-------------------------------------------------------------+
 *   |               IncomeExpenseAnalyzer Health Score            |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   |                 Mongoose HealthScore Model                  |
 *   |  { userId, orgId, score, breakdown, period, trend }         |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   |   Static Queries: getLatest() / getTrend()                  |
 *   |   Rendered on FinancialVitals & Dashboard UI                |
 *   +-------------------------------------------------------------+
 * ```
 *
 * @module models/HealthScore
 */

import mongoose, { Schema, Document, Model } from "mongoose";

// Defines the document structure for historical financial health score snapshots.
// Stores category score breakdowns across savings, debt, budget, and emergency funds.
// Tracks calculation periods and overall trajectory indicators for visual dashboards.
/** Health score document interface */
export interface IHealthScore extends Document {
  userId: string;
  orgId: string;
  score: number; // 0-100
  breakdown: {
    savingsRate: number; // 0-25 points
    debtManagement: number; // 0-25 points
    budgetAdherence: number; // 0-25 points
    emergencyFund: number; // 0-25 points
  };
  period: string; // e.g., "2026-07" for monthly
  trend: "improving" | "stable" | "declining";
  computedAt: Date;
}

// Declares the static method signatures available on the HealthScore model.
// Provides typed query helpers for fetching current scores and trend trajectories.
// Includes algorithmic helper methods to determine trend direction across snapshots.
/** Health score model static methods */
interface IHealthScoreModel extends Model<IHealthScore> {
  getLatest(userId: string, orgId: string): Promise<IHealthScore | null>;
  getTrend(userId: string, orgId: string, months?: number): Promise<IHealthScore[]>;
  computeTrend(scores: IHealthScore[]): "improving" | "stable" | "declining";
}

// Defines the Mongoose schema for persisting user financial health scores over time.
// Enforces boundary constraints on component scores and validates YYYY-MM period formatting.
// Automatically manages document creation and modification timestamps on write operations.
const healthScoreSchema = new Schema<IHealthScore, IHealthScoreModel>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    orgId: {
      type: String,
      required: true,
      index: true,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    breakdown: {
      savingsRate: { type: Number, min: 0, max: 25, default: 0 },
      debtManagement: { type: Number, min: 0, max: 25, default: 0 },
      budgetAdherence: { type: Number, min: 0, max: 25, default: 0 },
      emergencyFund: { type: Number, min: 0, max: 25, default: 0 },
    },
    period: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}$/, // YYYY-MM format
    },
    trend: {
      type: String,
      enum: ["improving", "stable", "declining"],
      default: "stable",
    },
    computedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Configures compound database indexes for rapid user and organization lookups.
// Enforces unique score records per user and billing period to prevent duplicate entries.
// Indexes chronological computed dates in descending order to optimize historical lookups.
// Compound index for efficient queries
healthScoreSchema.index({ userId: 1, orgId: 1, period: 1 }, { unique: true });
healthScoreSchema.index({ userId: 1, orgId: 1, computedAt: -1 });

// Retrieves the most recently calculated financial health score record for a user.
// Filters by tenant identifiers and sorts descending by computation timestamp.
// Returns the resolved document or null if no historical calculations exist.
/**
 * Get the most recent health score for a user.
 */
healthScoreSchema.statics.getLatest = async function (
  userId: string,
  orgId: string
): Promise<IHealthScore | null> {
  return this.findOne({ userId, orgId }).sort({ computedAt: -1 }).exec();
};

// Queries a chronological series of health score snapshots for trend evaluation.
// Orders records descending by computation time and limits results to specified months.
// Supplies the historical data array required for financial trajectory visualization.
/**
 * Get health score history for trend analysis.
 */
healthScoreSchema.statics.getTrend = async function (
  userId: string,
  orgId: string,
  months: number = 6
): Promise<IHealthScore[]> {
  return this.find({ userId, orgId })
    .sort({ computedAt: -1 })
    .limit(months)
    .exec();
};

// Evaluates score progression across recent records to classify directional movement.
// Compares average point differentials across window segments against a 5-point threshold.
// Outputs categorical trend classifications of improving, stable, or declining.
/**
 * Compute trend from a list of scores (most recent first).
 * Uses simple linear regression on the last 3 data points.
 */
healthScoreSchema.statics.computeTrend = function (
  scores: IHealthScore[]
): "improving" | "stable" | "declining" {
  if (scores.length < 2) {
    return "stable";
  }

  // Use last 3 scores (or fewer if not available)
  const recent = scores.slice(0, Math.min(3, scores.length));
  const values = recent.map((s) => s.score);

  // Simple trend: compare average of first half to second half
  const midpoint = Math.floor(values.length / 2);
  const olderAvg = values.slice(midpoint).reduce((a, b) => a + b, 0) / (values.length - midpoint);
  const newerAvg = values.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;

  const diff = newerAvg - olderAvg;

  if (diff > 5) return "improving";
  if (diff < -5) return "declining";
  return "stable";
};

// Compiles and exports the HealthScore Mongoose model with custom static methods.
// Exposes data access interfaces for background agents and API dashboard endpoints.
// Enables persistence and retrieval of multidimensional financial vitals metrics.
export const HealthScore = mongoose.model<IHealthScore, IHealthScoreModel>(
  "HealthScore",
  healthScoreSchema
);
