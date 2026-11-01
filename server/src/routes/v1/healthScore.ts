/**
 * @fileoverview Health Score Trend API Routes
 *
 * Provides endpoints for tracking and visualizing financial health score trends.
 *
 * ENDPOINTS:
 * - GET /api/v1/finance/health-score/trend — Get trend data with direction
 * - GET /api/v1/finance/health-score/chart — Get chart data points
 * - POST /api/v1/finance/health-score — Record a new health score
 *
 * @module routes/v1/healthScore
 */

import { Router, type Request } from "express";
import passport from "passport";
import { asyncRoute } from "../../utils/asyncRoute.js";
import { orgContext } from "../../middleware/orgContext.js";
import type { IUserDocument } from "../../models/userModel.js";
import {
  recordHealthScore,
  getHealthScoreTrend,
  getHealthScoreChart,
  checkHealthScoreAlert,
} from "../../services/healthScoreService.js";
import { HttpError } from "../../middleware/httpError.js";

const router = Router();
const requireAuth = passport.authenticate("jwt", { session: false });
const requireOrgContext = orgContext;

const requireActor = (req: Request) => {
  const user = req.user as IUserDocument | undefined;
  if (!user?._id || !req.org?.orgId) {
    throw new HttpError(401, "ORG_REQUIRED", "Authenticated organization context required");
  }
  return { userId: user._id.toString(), orgId: req.org.orgId };
};

/**
 * GET /api/v1/finance/health-score/trend
 *
 * Get health score trend for the current user.
 * Returns current score, previous score, trend direction, and history.
 *
 * Query params:
 * - months: number (default 6, max 24)
 */
router.get(
  "/trend",
  requireAuth,
  requireOrgContext,
  asyncRoute(async (req, res) => {
    const { userId, orgId } = requireActor(req);
    const months = Math.max(1, Math.min(parseInt(req.query.months as string) || 6, 24));

    const trend = await getHealthScoreTrend(userId, orgId, months);

    res.json({
      success: true,
      data: {
        current: trend.current
          ? {
              score: trend.current.score,
              breakdown: trend.current.breakdown,
              period: trend.current.period,
              computedAt: trend.current.computedAt,
            }
          : null,
        previous: trend.previous
          ? {
              score: trend.previous.score,
              period: trend.previous.period,
            }
          : null,
        trend: trend.trend,
        change: trend.change,
        history: trend.history.map((s) => ({
          score: s.score,
          period: s.period,
          breakdown: s.breakdown,
        })),
      },
    });
  })
);

/**
 * GET /api/v1/finance/health-score/chart
 *
 * Get health score history formatted for chart rendering.
 * Returns data points with period labels and breakdown components.
 *
 * Query params:
 * - months: number (default 12, max 36)
 */
router.get(
  "/chart",
  requireAuth,
  requireOrgContext,
  asyncRoute(async (req, res) => {
    const { userId, orgId } = requireActor(req);
    const months = Math.max(1, Math.min(parseInt(req.query.months as string) || 12, 36));

    const chartData = await getHealthScoreChart(userId, orgId, months);

    res.json({
      success: true,
      data: chartData,
    });
  })
);

/**
 * POST /api/v1/finance/health-score
 *
 * Record a new health score. Typically called after AI Core computes
 * the score from financial analysis.
 *
 * Body:
 * - score: number (0-100)
 * - breakdown: { savingsRate, debtManagement, budgetAdherence, emergencyFund }
 */
router.post(
  "/",
  requireAuth,
  requireOrgContext,
  asyncRoute(async (req, res) => {
    const { userId, orgId } = requireActor(req);
    const { score, breakdown } = req.body;

    if (typeof score !== "number" || score < 0 || score > 100) {
      throw new HttpError(400, "INVALID_SCORE", "Score must be a number between 0 and 100");
    }

    if (!breakdown || typeof breakdown !== "object") {
      throw new HttpError(400, "INVALID_BREAKDOWN", "Breakdown object is required");
    }

    const healthScore = await recordHealthScore({
      userId,
      orgId,
      score,
      breakdown: {
        savingsRate: breakdown.savingsRate || 0,
        debtManagement: breakdown.debtManagement || 0,
        budgetAdherence: breakdown.budgetAdherence || 0,
        emergencyFund: breakdown.emergencyFund || 0,
      },
    });

    // Check for significant changes
    const alert = await checkHealthScoreAlert(userId, orgId);

    res.json({
      success: true,
      data: {
        score: healthScore.score,
        breakdown: healthScore.breakdown,
        period: healthScore.period,
        trend: healthScore.trend,
        alert: alert?.alert ? alert : null,
      },
    });
  })
);

export default router;
