import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../models/userModel";
import { getEnv } from "../config/env";
import { PLAN_CATALOG, getResolvedEntitlements, recordFeatureUsage } from "../services/entitlements";

export const getPlans = async (req: Request, res: Response) => {
  return res.json({
    plans: Object.values(PLAN_CATALOG).map(plan => ({
      id: plan.id,
      label: plan.label,
      limits: plan.limits,
    })),
    request_id: req.requestId,
  });
};

export const getMyEntitlements = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const resolved = await getResolvedEntitlements(user._id);

  return res.json({
    plan: resolved.entitlement.plan,
    status: resolved.entitlement.status,
    limits: resolved.limits,
    usage: resolved.usage,
    remaining: resolved.remaining,
    period_key: resolved.period_key,
    request_id: req.requestId,
  });
};

export const ingestUsageEvent = async (req: Request, res: Response) => {
  const token = String(req.header("x-internal-usage-token") || "");
  const env = getEnv();
  if (!env.USAGE_EVENTS_INTERNAL_TOKEN || token !== env.USAGE_EVENTS_INTERNAL_TOKEN) {
    return res.status(403).json({ message: "Forbidden", code: "FORBIDDEN", request_id: req.requestId });
  }

  const body = req.body as {
    user_id: string;
    feature: "monthly_ai_calls" | "scenario_depth" | "ocr_quota" | "export_access";
    units: number;
    idempotency_key?: string;
    context?: Record<string, unknown>;
  };

  const userId = body.user_id;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Invalid user_id", code: "INVALID_USER_ID", request_id: req.requestId });
  }

  await recordFeatureUsage({
    userId: new mongoose.Types.ObjectId(userId),
    feature: body.feature,
    units: Number(body.units),
    requestId: req.requestId,
    idempotencyKey: body.idempotency_key,
    context: body.context,
  });

  return res.status(202).json({ accepted: true, request_id: req.requestId });
};
