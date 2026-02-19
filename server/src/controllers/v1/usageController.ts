import type { Request, Response } from "express";
import mongoose from "mongoose";

import { getCurrentPeriodKey, getResolvedEntitlements } from "../../services/entitlements";
import { HttpError } from "../../middleware/httpError";
import UsageLedgerModel from "../../models/usageLedgerModel";

export const getUsageLedger = async (req: Request, res: Response) => {
  if (!req.org?.orgId) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }

  const orgId = new mongoose.Types.ObjectId(req.org.orgId);
  const periodKeyRaw = typeof (req.query as any)?.period_key === "string" ? String((req.query as any).period_key) : "";
  const periodKey = periodKeyRaw?.trim() ? periodKeyRaw.trim() : getCurrentPeriodKey();

  const userIdFromJwt = (req as any).user?._id as mongoose.Types.ObjectId | undefined;
  const apiKeyCreatedBy = String((req as any).apiKey?.createdByUserId || "");
  const userId =
    userIdFromJwt ||
    (apiKeyCreatedBy && mongoose.Types.ObjectId.isValid(apiKeyCreatedBy)
      ? new mongoose.Types.ObjectId(apiKeyCreatedBy)
      : undefined);

  if (!userId) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const resolved = await getResolvedEntitlements({ orgId, userId });
  const ledgerRows = await UsageLedgerModel.find({ orgId, periodKey })
    .select({ feature: 1, units: 1, tokensIn: 1, tokensOut: 1, costUsd: 1, updatedAt: 1 })
    .lean();

  return res.json({
    org_id: orgId.toString(),
    period_key: periodKey,
    plan: resolved.entitlement.plan,
    status: resolved.entitlement.status,
    base_limits: resolved.base_limits,
    credits: resolved.credits,
    limits: resolved.limits,
    usage: resolved.usage,
    remaining: resolved.remaining,
    ledger: ledgerRows.map((row: any) => ({
      feature: String(row.feature),
      units: Number(row.units || 0),
      tokens_in: Number(row.tokensIn || 0),
      tokens_out: Number(row.tokensOut || 0),
      cost_usd: Number(row.costUsd || 0),
      updated_at: row.updatedAt,
    })),
    request_id: req.requestId,
  });
};
