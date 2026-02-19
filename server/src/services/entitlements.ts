import type { Types } from "mongoose";

import EntitlementModel, { type IEntitlementDocument, type PlanTier } from "../models/entitlementModel";
import UsageEventModel, { type UsageFeature } from "../models/usageEventModel";
import UsageLedgerModel from "../models/usageLedgerModel";
import { HttpError } from "../middleware/httpError";
import { recordUsageEvent } from "../observability/metrics";
import { CREDIT_FEATURES, type CreditFeature } from "../models/creditGrantModel";
import { sumCreditsByFeature } from "./credits";

export type PlanLimit = {
  monthly_ai_calls: number;
  scenario_depth: number;
  ocr_quota: number;
  export_access: boolean;
  api_requests: number;
  workflow_runs: number;
  connector_sync_records: number;
  marketplace_installs: number;
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
      api_requests: 1000,
      workflow_runs: 50,
      connector_sync_records: 500,
      marketplace_installs: 1,
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
      api_requests: 25_000,
      workflow_runs: 1_000,
      connector_sync_records: 50_000,
      marketplace_installs: 10,
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
      api_requests: 150_000,
      workflow_runs: 10_000,
      connector_sync_records: 400_000,
      marketplace_installs: 100,
    },
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    limits: {
      monthly_ai_calls: 12_000,
      scenario_depth: 6_000,
      ocr_quota: 4_000,
      export_access: true,
      api_requests: 1_000_000,
      workflow_runs: 100_000,
      connector_sync_records: 3_000_000,
      marketplace_installs: 1000,
    },
  },
};

export const getCurrentPeriodKey = (now = new Date()) =>
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

const sumUsageByFeature = async (params: { orgId?: Types.ObjectId; userId: Types.ObjectId; periodKey: string }) => {
  const match =
    params.orgId
      ? {
          periodKey: params.periodKey,
          $or: [{ orgId: params.orgId }, { orgId: { $exists: false }, userId: params.userId }],
        }
      : {
          userId: params.userId,
          periodKey: params.periodKey,
        };

  const rows = await UsageEventModel.aggregate([
    {
      $match: match,
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
    api_requests: 0,
    workflow_runs: 0,
    connector_sync_records: 0,
    marketplace_installs: 0,
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
    api_requests:
      typeof entitlement.limitsOverride?.api_requests === "number"
        ? entitlement.limitsOverride.api_requests
        : base.api_requests,
    workflow_runs:
      typeof entitlement.limitsOverride?.workflow_runs === "number"
        ? entitlement.limitsOverride.workflow_runs
        : base.workflow_runs,
    connector_sync_records:
      typeof entitlement.limitsOverride?.connector_sync_records === "number"
        ? entitlement.limitsOverride.connector_sync_records
        : base.connector_sync_records,
    marketplace_installs:
      typeof entitlement.limitsOverride?.marketplace_installs === "number"
        ? entitlement.limitsOverride.marketplace_installs
        : base.marketplace_installs,
  };
};

export const getOrCreateEntitlement = async (params: { orgId?: Types.ObjectId; userId: Types.ObjectId }) => {
  if (params.orgId) {
    const byOrg = await EntitlementModel.findOne({ orgId: params.orgId });
    if (byOrg) {
      return byOrg;
    }

    const legacy = await EntitlementModel.findOne({ userId: params.userId });
    if (legacy && !legacy.orgId) {
      legacy.orgId = params.orgId;
      await legacy.save();
      return legacy;
    }

    const created = await EntitlementModel.create({
      orgId: params.orgId,
      userId: params.userId,
      plan: "free",
      status: "active",
    });
    return created;
  }

  const entitlement =
    (await EntitlementModel.findOne({ userId: params.userId })) ||
    (await EntitlementModel.create({
      userId: params.userId,
      plan: "free",
      status: "active",
    }));
  return entitlement;
};

export const getResolvedEntitlements = async (params: { orgId?: Types.ObjectId; userId: Types.ObjectId }) => {
  const entitlement = await getOrCreateEntitlement(params);
  const periodKey = getCurrentPeriodKey();
  const baseLimits = resolvePlanLimits(entitlement);
  const usage = await sumUsageByFeature({ orgId: params.orgId, userId: params.userId, periodKey });

  const credits: Record<CreditFeature, number> = params.orgId
    ? await sumCreditsByFeature({ orgId: params.orgId, periodKey })
    : (Object.fromEntries(CREDIT_FEATURES.map(feature => [feature, 0])) as Record<CreditFeature, number>);

  const limits: PlanLimit = { ...baseLimits };
  for (const feature of CREDIT_FEATURES) {
    const baseLimit = (baseLimits as any)[feature];
    if (typeof baseLimit === "number") {
      (limits as any)[feature] = Math.max(0, baseLimit + Math.max(0, Number(credits[feature] || 0)));
    }
  }

  const remaining = {
    monthly_ai_calls: Math.max(0, limits.monthly_ai_calls - usage.monthly_ai_calls),
    scenario_depth: Math.max(0, limits.scenario_depth - usage.scenario_depth),
    ocr_quota: Math.max(0, limits.ocr_quota - usage.ocr_quota),
    export_access: limits.export_access,
    api_requests: Math.max(0, limits.api_requests - usage.api_requests),
    workflow_runs: Math.max(0, limits.workflow_runs - usage.workflow_runs),
    connector_sync_records: Math.max(0, limits.connector_sync_records - usage.connector_sync_records),
    marketplace_installs: Math.max(0, limits.marketplace_installs - usage.marketplace_installs),
  };

  return {
    entitlement,
    base_limits: baseLimits,
    credits,
    limits,
    usage,
    remaining,
    period_key: periodKey,
  };
};

export const enforceFeatureLimit = async (params: {
  orgId?: Types.ObjectId;
  userId: Types.ObjectId;
  feature: keyof PlanLimit;
  units?: number;
  requestId?: string;
}) => {
  const units = Math.max(1, Number(params.units || 1));
  const resolved = await getResolvedEntitlements({ orgId: params.orgId, userId: params.userId });
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
  orgId?: Types.ObjectId;
  userId: Types.ObjectId;
  feature: UsageFeature;
  units?: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  modelName?: string;
  requestId?: string;
  idempotencyKey?: string;
  context?: Record<string, unknown>;
}) => {
  const units = Math.max(0, Number(params.units || 0));
  if (!Number.isFinite(units) || units <= 0) {
    return null;
  }

  const tokensInRaw = Number(params.tokensIn);
  const tokensOutRaw = Number(params.tokensOut);
  const costUsdRaw = Number(params.costUsd);

  const tokensIn = Number.isFinite(tokensInRaw) ? Math.max(0, Math.floor(tokensInRaw)) : undefined;
  const tokensOut = Number.isFinite(tokensOutRaw) ? Math.max(0, Math.floor(tokensOutRaw)) : undefined;
  const costUsd = Number.isFinite(costUsdRaw) ? Math.max(0, costUsdRaw) : undefined;
  const modelName =
    typeof params.modelName === "string" && params.modelName.trim().length > 0
      ? params.modelName.trim().slice(0, 80)
      : undefined;

  try {
    const periodKey = getCurrentPeriodKey();
    const createPayload: Record<string, unknown> = {
      userId: params.userId,
      feature: params.feature,
      units,
      periodKey,
      context: params.context || {},
    };

    if (params.orgId) {
      createPayload.orgId = params.orgId;
    }

    if (tokensIn !== undefined) {
      createPayload.tokensIn = tokensIn;
    }

    if (tokensOut !== undefined) {
      createPayload.tokensOut = tokensOut;
    }

    if (costUsd !== undefined) {
      createPayload.costUsd = costUsd;
    }

    if (modelName) {
      createPayload.modelName = modelName;
    }

    if (typeof params.requestId === "string" && params.requestId.trim().length > 0) {
      createPayload.requestId = params.requestId;
    }

    if (typeof params.idempotencyKey === "string" && params.idempotencyKey.trim().length > 0) {
      createPayload.idempotencyKey = params.idempotencyKey;
    }

    const created = await UsageEventModel.create(createPayload);
    recordUsageEvent({ feature: params.feature, units });

    if (params.orgId) {
      const inc: Record<string, number> = { units };
      if (tokensIn !== undefined) {
        inc.tokensIn = tokensIn;
      }
      if (tokensOut !== undefined) {
        inc.tokensOut = tokensOut;
      }
      if (costUsd !== undefined) {
        inc.costUsd = costUsd;
      }

      await UsageLedgerModel.updateOne(
        { orgId: params.orgId, periodKey, feature: params.feature },
        {
          $setOnInsert: {
            orgId: params.orgId,
            periodKey,
            feature: params.feature,
          },
          $inc: {
            ...inc,
          },
        },
        { upsert: true }
      );
    }
    return created;
  } catch (error: any) {
    if (error?.code === 11000 && params.idempotencyKey) {
      return null;
    }
    throw error;
  }
};
