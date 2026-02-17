import type { Types } from "mongoose";

import EntitlementModel, { type IEntitlementDocument, type PlanTier } from "../models/entitlementModel";
import UsageEventModel, { type UsageFeature } from "../models/usageEventModel";
import { HttpError } from "../middleware/httpError";
import { recordUsageEvent } from "../observability/metrics";

export type PlanLimit = {
  monthly_ai_calls: number;
  scenario_depth: number;
  ocr_quota: number;
  export_access: boolean;
};

export const PLAN_CATALOG: Record<
  PlanTier,
  {
    id: PlanTier;
    label: string;
    limits: PlanLimit;
  }
> = {
  free: {
    id: "free",
    label: "Free",
    limits: {
      monthly_ai_calls: 60,
      scenario_depth: 30,
      ocr_quota: 20,
      export_access: false,
    },
  },
  pro: {
    id: "pro",
    label: "Pro",
    limits: {
      monthly_ai_calls: 600,
      scenario_depth: 300,
      ocr_quota: 200,
      export_access: true,
    },
  },
  team: {
    id: "team",
    label: "Team",
    limits: {
      monthly_ai_calls: 3000,
      scenario_depth: 1500,
      ocr_quota: 1000,
      export_access: true,
    },
  },
};

export const getCurrentPeriodKey = (now = new Date()) =>
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

const sumUsageByFeature = async (params: { userId: Types.ObjectId; periodKey: string }) => {
  const rows = await UsageEventModel.aggregate([
    {
      $match: {
        userId: params.userId,
        periodKey: params.periodKey,
      },
    },
    {
      $group: {
        _id: "$feature",
        units: { $sum: "$units" },
      },
    },
  ]);

  const usage: Record<UsageFeature, number> = {
    monthly_ai_calls: 0,
    scenario_depth: 0,
    ocr_quota: 0,
    export_access: 0,
  };
  for (const row of rows) {
    const key = String((row as any)._id) as UsageFeature;
    usage[key] = Number((row as any).units || 0);
  }
  return usage;
};

export const resolvePlanLimits = (entitlement: IEntitlementDocument): PlanLimit => {
  const base = PLAN_CATALOG[entitlement.plan || "free"]?.limits || PLAN_CATALOG.free.limits;
  return {
    monthly_ai_calls:
      typeof entitlement.limitsOverride?.monthly_ai_calls === "number"
        ? entitlement.limitsOverride.monthly_ai_calls
        : base.monthly_ai_calls,
    scenario_depth:
      typeof entitlement.limitsOverride?.scenario_depth === "number"
        ? entitlement.limitsOverride.scenario_depth
        : base.scenario_depth,
    ocr_quota:
      typeof entitlement.limitsOverride?.ocr_quota === "number"
        ? entitlement.limitsOverride.ocr_quota
        : base.ocr_quota,
    export_access:
      typeof entitlement.limitsOverride?.export_access === "boolean"
        ? entitlement.limitsOverride.export_access
        : base.export_access,
  };
};

export const getOrCreateEntitlement = async (userId: Types.ObjectId) => {
  const entitlement =
    (await EntitlementModel.findOne({ userId })) ||
    (await EntitlementModel.create({
      userId,
      plan: "free",
      status: "active",
    }));
  return entitlement;
};

export const getResolvedEntitlements = async (userId: Types.ObjectId) => {
  const entitlement = await getOrCreateEntitlement(userId);
  const periodKey = getCurrentPeriodKey();
  const limits = resolvePlanLimits(entitlement);
  const usage = await sumUsageByFeature({ userId, periodKey });

  const remaining = {
    monthly_ai_calls: Math.max(0, limits.monthly_ai_calls - usage.monthly_ai_calls),
    scenario_depth: Math.max(0, limits.scenario_depth - usage.scenario_depth),
    ocr_quota: Math.max(0, limits.ocr_quota - usage.ocr_quota),
    export_access: limits.export_access,
  };

  return {
    entitlement,
    limits,
    usage,
    remaining,
    period_key: periodKey,
  };
};

export const enforceFeatureLimit = async (params: {
  userId: Types.ObjectId;
  feature: keyof PlanLimit;
  units?: number;
  requestId?: string;
}) => {
  const units = Math.max(1, Number(params.units || 1));
  const resolved = await getResolvedEntitlements(params.userId);
  const limit = resolved.limits[params.feature];

  if (typeof limit === "boolean") {
    if (!limit) {
      throw new HttpError(402, "FEATURE_NOT_AVAILABLE", `${params.feature} is not available on current plan`, {
        feature: params.feature,
        plan: resolved.entitlement.plan,
      });
    }
    return resolved;
  }

  const used = Number((resolved.usage as any)[params.feature] || 0);
  if (used + units > limit) {
    throw new HttpError(402, "FEATURE_LIMIT_REACHED", `${params.feature} monthly limit reached`, {
      feature: params.feature,
      limit,
      used,
      requested_units: units,
      request_id: params.requestId,
    });
  }

  return resolved;
};

export const recordFeatureUsage = async (params: {
  userId: Types.ObjectId;
  feature: UsageFeature;
  units?: number;
  requestId?: string;
  idempotencyKey?: string;
  context?: Record<string, unknown>;
}) => {
  const units = Math.max(0, Number(params.units || 0));
  if (!Number.isFinite(units) || units <= 0) {
    return null;
  }

  try {
    const createPayload: Record<string, unknown> = {
      userId: params.userId,
      feature: params.feature,
      units,
      periodKey: getCurrentPeriodKey(),
      context: params.context || {},
    };

    if (typeof params.requestId === "string" && params.requestId.trim().length > 0) {
      createPayload.requestId = params.requestId;
    }

    if (typeof params.idempotencyKey === "string" && params.idempotencyKey.trim().length > 0) {
      createPayload.idempotencyKey = params.idempotencyKey;
    }

    const created = await UsageEventModel.create(createPayload);
    recordUsageEvent({ feature: params.feature, units });
    return created;
  } catch (error: any) {
    if (error?.code === 11000 && params.idempotencyKey) {
      return null;
    }
    throw error;
  }
};
