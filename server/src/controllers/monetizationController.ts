/**
 * @fileoverview Monetization Controller
 *
 * Exposes plan catalog, per-user/org entitlement resolution, and an internal
 * usage-event ingestion endpoint for metered billing.
 *
 * Routes served:
 *   GET  /api/monetization/plans           - getPlans
 *   GET  /api/monetization/entitlements    - getMyEntitlements
 *   POST /api/monetization/usage-events    - ingestUsageEvent (internal-only)
 *
 * Key patterns:
 *   - getPlans returns the static plan catalog (free/pro/team limits)
 *   - getMyEntitlements resolves the caller's current plan, usage, and remaining quota
 *   - ingestUsageEvent is a server-to-server endpoint protected by x-internal-usage-token
 *   - Falls back to user's default org if org_id is not provided in usage events
 *
 * @module controllers/monetizationController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../models/userModel";
import type { UsageFeature } from "../models/usageEventModel";
import { getEnv } from "../config/env";
import { PLAN_CATALOG, getResolvedEntitlements, recordFeatureUsage } from "../services/entitlements";
import OrgMemberModel from "../models/orgMemberModel";

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
  const orgId = req.org?.orgId ? new mongoose.Types.ObjectId(req.org.orgId) : undefined;
  const resolved = await getResolvedEntitlements({ orgId, userId: user._id });

  return res.json({
    org_id: orgId ? orgId.toString() : undefined,
    plan: resolved.entitlement.plan,
    status: resolved.entitlement.status,
    base_limits: resolved.base_limits,
    credits: resolved.credits,
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
    org_id?: string;
    user_id: string;
    feature: UsageFeature;
    units: number;
    idempotency_key?: string;
    context?: Record<string, unknown>;
  };

  const userId = body.user_id;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Invalid user_id", code: "INVALID_USER_ID", request_id: req.requestId });
  }

  const orgId =
    body.org_id && mongoose.Types.ObjectId.isValid(body.org_id)
      ? new mongoose.Types.ObjectId(body.org_id)
      : await OrgMemberModel.findOne({ userId: new mongoose.Types.ObjectId(userId), status: "active" })
          .sort({ isDefault: -1, createdAt: 1 })
          .select({ orgId: 1 })
          .lean()
          .then(member => (member?.orgId ? (member.orgId as unknown as mongoose.Types.ObjectId) : undefined));

  await recordFeatureUsage({
    orgId,
    userId: new mongoose.Types.ObjectId(userId),
    feature: body.feature,
    units: Number(body.units),
    requestId: req.requestId,
    idempotencyKey: body.idempotency_key,
    context: body.context,
  });

  return res.status(202).json({ accepted: true, request_id: req.requestId });
};
