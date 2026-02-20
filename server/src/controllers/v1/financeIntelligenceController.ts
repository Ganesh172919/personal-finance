import type { Request, Response } from "express";
import mongoose from "mongoose";

import { HttpError } from "../../middleware/httpError";
import { buildForecast, detectRecurringCandidates, getBudgetEnvelopes } from "../../services/financeIntelligence";

const requireOrgContext = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(req.org.orgId);
};

export const getBudgetEnvelopesEndpoint = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const periodKey = String((req as any).params?.periodKey || "").trim();

  try {
    const result = await getBudgetEnvelopes({ orgId, periodKey });
    return res.json({ ...result, request_id: req.requestId });
  } catch (error: any) {
    throw new HttpError(400, "INVALID_PERIOD_KEY", error?.message || "Invalid period key (expected YYYY-MM)");
  }
};

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

export const getForecastEndpoint = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const query = req.query as any;

  const result = await buildForecast({
    orgId,
    periodKey: typeof query?.period_key === "string" ? query.period_key : undefined,
    months: query?.months,
    topCategories: query?.top_categories,
  });

  return res.json({ ...result, request_id: req.requestId });
};

