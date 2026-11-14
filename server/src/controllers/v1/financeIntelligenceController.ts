/**
 * @fileoverview Finance Intelligence Controller (v1)
 *
 * Read-only analytics endpoints powered by the financeIntelligence service.
 * Provides budget envelopes, recurring charge detection, and cash-flow forecasting.
 *
 * Routes served:
 *   GET /api/v1/finance/budget-envelopes/:periodKey  - getBudgetEnvelopesEndpoint
 *   GET /api/v1/finance/recurring-candidates          - listRecurringCandidatesEndpoint
 *   GET /api/v1/finance/forecast                      - getForecastEndpoint
 *
 * Key patterns:
 *   - Thin controller: delegates all computation to financeIntelligence service
 *   - Budget envelopes compare planned vs. actual spending per category
 *   - Recurring candidates detected from transaction frequency patterns
 *   - Forecast projects future cash flow based on historical data
 *   - All endpoints scoped to org context
 *
 * @module controllers/v1/financeIntelligenceController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import { HttpError } from "../../middleware/httpError";
import { buildForecast, detectRecurringCandidates, getBudgetEnvelopes } from "../../services/financeIntelligence";

// Validates that organization context is attached to the current request.
// Rejects unauthenticated or missing organization sessions with HTTP 401.
// Returns the resolved organization ID cast to a typed MongoDB ObjectId.
const requireOrgContext = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(req.org.orgId);
};

// Computes budget envelope analytics comparing planned limits to actual spending.
// Delegates calculation to the underlying finance intelligence domain service.
// Returns category envelopes, variance percentages, and currency details.
export const getBudgetEnvelopesEndpoint = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const periodKey = String((req as any).params?.periodKey || "").trim();
  const currency = typeof req.query?.currency === "string" ? req.query.currency : undefined;

  try {
    const result = await getBudgetEnvelopes({ orgId, periodKey, currency, fresh: req.query.fresh === "true" });
    return res.json({ ...result, request_id: req.requestId });
  } catch (error: any) {
    throw new HttpError(400, "INVALID_PERIOD_KEY", error?.message || "Invalid period key (expected YYYY-MM)");
  }
};

// Detects recurring transaction candidates by analyzing spending patterns over time.
// Supports query filters for lookback window, result limits, and minimum occurrences.
// Returns candidate subscriptions and recurring obligations with confidence metrics.
export const listRecurringCandidatesEndpoint = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const query = req.query as any;

  const result = await detectRecurringCandidates({
    orgId,
    daysBack: query?.days_back,
    limit: query?.limit,
    minOccurrences: query?.min_occurrences,
  });

  return res.json({ ...result, request_id: req.requestId });
};

// Generates forward-looking cash flow and spending forecasts for the organization.
// Considers historical monthly aggregates and projects future period balances.
// Returns trend forecasts, category projections, and optional converted currencies.
export const getForecastEndpoint = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const query = req.query as any;

  const result = await buildForecast({
    orgId,
    periodKey: typeof query?.period_key === "string" ? query.period_key : undefined,
    months: query?.months,
    topCategories: query?.top_categories,
    currency: typeof query?.currency === "string" ? query.currency : undefined,
  });

  return res.json({ ...result, request_id: req.requestId });
};

