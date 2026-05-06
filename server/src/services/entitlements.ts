/**
 * @fileoverview Entitlements and Feature Limit Enforcement Service
 *
 * PURPOSE:
 * This service implements the SaaS billing and feature gating logic. It controls
 * which features users can access and how much they can use based on their
 * subscription plan (Free, Pro, Team, Enterprise).
 *
 * CORE CONCEPTS:
 * 1. PLAN TIERS: Each plan (free/pro/team/enterprise) has predefined limits
 *    for features like AI calls, OCR quota, API requests, etc.
 *
 * 2. ENTITLEMENTS: A per-org/user record that tracks their current plan,
 *    status, and any custom limit overrides.
 *
 * 3. USAGE TRACKING: Every feature usage is recorded in both a UsageEvent
 *    (detailed log) and a UsageLedger (aggregated counter for fast lookups).
 *
 * 4. CREDITS: Organizations can receive credit grants that boost their limits
 *    beyond the base plan. Credits are added on top of plan limits.
 *
 * 5. ENFORCEMENT: Before allowing a feature to be used, enforceFeatureLimit
 *    checks if the user has remaining quota. If not, it throws a 402 error.
 *
 * BILLING MODEL:
 *   Effective Limit = Plan Base Limit + Credit Grants - Current Usage
 *   If Effective Limit < requested units -> throw 402 (payment required)
 *
 * CACHING:
 * Entitlement lookups are cached in Redis with a 60-second TTL to avoid
 * hitting the database on every request. The cache is invalidated when
 * new usage is recorded.
 *
 * @module services/entitlements
 */

import type { Types } from "mongoose"; // MongoDB ObjectId type

import EntitlementModel, { type IEntitlementDocument, type PlanTier } from "../models/entitlementModel"; // Plan/entitlement storage
import UsageEventModel, { type UsageFeature } from "../models/usageEventModel"; // Detailed usage event log
import UsageLedgerModel from "../models/usageLedgerModel"; // Aggregated usage counters
import { HttpError } from "../middleware/httpError"; // Typed HTTP errors (402 Payment Required)
import { recordUsageEvent } from "../observability/metrics"; // Metrics for monitoring
import { CREDIT_FEATURES, type CreditFeature } from "../models/creditGrantModel"; // Credit grant definitions
import { sumCreditsByFeature } from "./credits"; // Credit balance calculation
import { cacheGet, cacheSet, cacheDel } from "../config/redis"; // Redis caching layer

/**
 * Defines the shape of plan limits. Each feature has either:
 * - A numeric limit (how many units per month), or
 * - A boolean flag (whether the feature is available at all)
 *
 * NOTE: "export_access" is a boolean (gate), not a counter.
 * All other features are monthly counters that reset on the 1st of each month.
 */
export type PlanLimit = {
  monthly_ai_calls: number; // AI conversation calls per month
  scenario_depth: number; // What-if scenario analyses per month
  ocr_quota: number; // Receipt/document OCR scans per month
  export_access: boolean; // Whether CSV/PDF export is available
  api_requests: number; // API calls per month (for integrations)
  autopilot_actions: number; // Automated financial actions per month
  workflow_runs: number; // Automated workflow executions per month
  connector_sync_records: number; // Bank connector sync records per month
  marketplace_installs: number; // Third-party app installations
};

/**
 * The complete catalog of plan tiers and their limits.
 *
 * TIER PROGRESSION:
 * - Free: For individual users exploring the platform
 * - Pro: For power users who need more AI calls and export access
 * - Team: For small organizations with multiple users
 * - Enterprise: For large organizations with high-volume needs
 *
 * The limits scale roughly 5-10x between tiers, giving users clear
 * upgrade motivation as their usage grows.
 *
 * NOTE: These are BASE limits. Actual limits may be higher due to credit grants.
 */
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
      monthly_ai_calls: 60,       // ~2 AI calls per day
      scenario_depth: 30,         // ~1 what-if scenario per day
      ocr_quota: 20,              // ~1 receipt scan per day
      export_access: false,       // No CSV/PDF export
      api_requests: 1000,         // Basic API access
      autopilot_actions: 25,      // Limited automation
      workflow_runs: 50,          // Limited workflows
      connector_sync_records: 500, // Basic bank sync
      marketplace_installs: 1,    // One third-party integration
    },
  },
  pro: {
    id: "pro",
    label: "Pro",
    limits: {
      monthly_ai_calls: 600,       // ~20 AI calls per day
      scenario_depth: 300,         // ~10 scenarios per day
      ocr_quota: 200,              // ~7 receipt scans per day
      export_access: true,         // Full export access
      api_requests: 25_000,        // Generous API access
      autopilot_actions: 500,      // Significant automation
      workflow_runs: 1_000,        // Many workflows
      connector_sync_records: 50_000, // Full bank sync
      marketplace_installs: 10,    // Multiple integrations
    },
  },
  team: {
    id: "team",
    label: "Team",
    limits: {
      monthly_ai_calls: 3000,       // ~100 AI calls per day
      scenario_depth: 1500,         // ~50 scenarios per day
      ocr_quota: 1000,              // ~33 receipt scans per day
      export_access: true,          // Full export access
      api_requests: 150_000,        // High API access
      autopilot_actions: 5_000,     // Heavy automation
      workflow_runs: 10_000,        // Many workflows
      connector_sync_records: 400_000, // High-volume sync
      marketplace_installs: 100,    // Many integrations
    },
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    limits: {
      monthly_ai_calls: 12_000,      // ~400 AI calls per day
      scenario_depth: 6_000,         // ~200 scenarios per day
      ocr_quota: 4_000,              // ~133 receipt scans per day
      export_access: true,           // Full export access
      api_requests: 1_000_000,       // Unlimited-style API access
      autopilot_actions: 50_000,     // Heavy automation
      workflow_runs: 100_000,        // Unlimited-style workflows
      connector_sync_records: 3_000_000, // Massive sync volume
      marketplace_installs: 1000,    // Unlimited integrations
    },
  },
};

/**
 * Generates the current billing period key in "YYYY-MM" format.
 * Usage counters reset at the start of each UTC month.
 * Example: "2024-03" for March 2024.
 */
export const getCurrentPeriodKey = (now = new Date()) =>
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

/**
 * Sums usage across all features for the current billing period.
 *
 * DUAL SOURCE STRATEGY:
 * Usage data comes from two sources for backward compatibility:
 * 1. UsageLedgerModel: Aggregated org-level counters (preferred, fast)
 * 2. UsageEventModel: Individual event records (legacy, slower)
 *
 * When orgId is available, the function:
 * - First reads from the ledger (fast aggregate)
 * - Then adds any legacy per-user events without orgId
 * - Falls back to event aggregation if the ledger is empty
 *
 * When orgId is missing (legacy users), it queries events by userId only.
 *
 * @param {object} params - Query parameters
 * @param {Types.ObjectId} [params.orgId] - Organization ID (optional for legacy)
 * @param {Types.ObjectId} params.userId - User ID
 * @param {string} params.periodKey - Billing period (e.g., "2024-03")
 * @returns {Promise<Record<UsageFeature, number>>} Usage counts per feature
 */
const sumUsageByFeature = async (params: { orgId?: Types.ObjectId; userId: Types.ObjectId; periodKey: string }) => {
  const usage: Record<UsageFeature, number> = {
    monthly_ai_calls: 0,
    scenario_depth: 0,
    ocr_quota: 0,
    export_access: 0,
    api_requests: 0,
    autopilot_actions: 0,
    workflow_runs: 0,
    connector_sync_records: 0,
    marketplace_installs: 0,
  };

  if (params.orgId) {
    const ledgerRows = await UsageLedgerModel.find({ orgId: params.orgId, periodKey: params.periodKey })
      .select({ feature: 1, units: 1 })
      .lean();

    for (const row of ledgerRows as any[]) {
      const key = String((row as any)?.feature || "") as UsageFeature;
      if (!key || !(key in usage)) continue;
      usage[key] = Math.max(0, Number((row as any)?.units || 0));
    }

    // Backward-compatible: include legacy per-user usage events with no orgId.
    const legacyRows = await UsageEventModel.aggregate([
      {
        $match: {
          userId: params.userId,
          periodKey: params.periodKey,
          orgId: { $exists: false },
        },
      },
      {
        $group: {
          _id: "$feature",
          units: { $sum: "$units" },
        },
      },
    ]);

    for (const row of legacyRows as any[]) {
      const key = String((row as any)?._id || "") as UsageFeature;
      if (!key || !(key in usage)) continue;
      usage[key] += Math.max(0, Number((row as any)?.units || 0));
    }

    // Fallback: if ledger is empty but org-scoped usage events exist, prefer the event aggregation.
    if (ledgerRows.length === 0) {
      const orgRows = await UsageEventModel.aggregate([
        { $match: { orgId: params.orgId, periodKey: params.periodKey } },
        { $group: { _id: "$feature", units: { $sum: "$units" } } },
      ]);

      for (const row of orgRows as any[]) {
        const key = String((row as any)?._id || "") as UsageFeature;
        if (!key || !(key in usage)) continue;
        usage[key] += Math.max(0, Number((row as any)?.units || 0));
      }
    }

    return usage;
  }

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

  for (const row of rows as any[]) {
    const key = String((row as any)?._id || "") as UsageFeature;
    if (!key || !(key in usage)) continue;
    usage[key] = Math.max(0, Number((row as any)?.units || 0));
  }
  return usage;
};

/**
 * Resolves the effective plan limits for an entitlement.
 *
 * MERGE STRATEGY:
 * Start with the base plan limits from PLAN_CATALOG, then overlay any
 * custom overrides from the entitlement document. This allows:
 * - Per-organization limit customization (e.g., negotiated enterprise deals)
 * - Temporary limit boosts (e.g., promotional periods)
 * - Feature flags (e.g., enabling export_access for a free-tier beta tester)
 *
 * @param {IEntitlementDocument} entitlement - The user/org's entitlement record
 * @returns {PlanLimit} The effective limits after applying overrides
 */
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
    autopilot_actions:
      typeof entitlement.limitsOverride?.autopilot_actions === "number"
        ? entitlement.limitsOverride.autopilot_actions
        : base.autopilot_actions,
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

/**
 * Gets the existing entitlement or creates a default "free" one.
 *
 * ORG-FIRST LOOKUP:
 * When an orgId is provided, the function looks up the entitlement by org first.
 * If not found, it checks for a legacy per-user entitlement and migrates it
 * to the org. If neither exists, it creates a new free-tier entitlement.
 *
 * This migration path ensures a smooth transition from per-user to per-org
 * billing without losing existing entitlement data.
 *
 * @param {object} params - Lookup parameters
 * @param {Types.ObjectId} [params.orgId] - Organization ID (preferred)
 * @param {Types.ObjectId} params.userId - User ID (fallback for legacy)
 * @returns {Promise<IEntitlementDocument>} The entitlement document
 */
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

/**
 * Gets the fully resolved entitlements with usage, credits, and remaining quota.
 *
 * This is the "complete picture" function that combines:
 * 1. The entitlement record (plan + overrides)
 * 2. Base plan limits
 * 3. Credit grants (bonus quota)
 * 4. Current period usage
 * 5. Remaining quota (limits + credits - usage)
 *
 * CACHING: Results are cached in Redis for 60 seconds to avoid repeated
 * database queries. The cache is invalidated when usage is recorded.
 *
 * @param {object} params - Lookup parameters
 * @returns {Promise<object>} Complete entitlement resolution with all details
 */
export const getResolvedEntitlements = async (params: { orgId?: Types.ObjectId; userId: Types.ObjectId }): Promise<{
  entitlement: IEntitlementDocument;
  base_limits: PlanLimit;
  credits: Record<CreditFeature, number>;
  limits: PlanLimit;
  usage: Record<string, number>;
  remaining: Record<string, number | boolean>;
  period_key: string;
}> => {
  // STEP 1: Check Redis cache (60-second TTL)
  const periodKey = getCurrentPeriodKey();
  const cacheKey = `ent:${params.orgId?.toString() ?? params.userId.toString()}:${periodKey}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cached = await cacheGet<any>(cacheKey);
  if (cached) return cached; // Cache hit -- skip all database queries

  // STEP 2: Get entitlement and resolve base plan limits
  const entitlement = await getOrCreateEntitlement(params);
  const baseLimits = resolvePlanLimits(entitlement);

  // STEP 3: Get current period usage from the database
  const usage = await sumUsageByFeature({ orgId: params.orgId, userId: params.userId, periodKey });

  // STEP 4: Get credit grants (bonus quota from promotions, referrals, etc.)
  const credits: Record<CreditFeature, number> = params.orgId
    ? await sumCreditsByFeature({ orgId: params.orgId, periodKey })
    : (Object.fromEntries(CREDIT_FEATURES.map(feature => [feature, 0])) as Record<CreditFeature, number>);

  // STEP 5: Calculate effective limits = base plan + credit grants
  const limits: PlanLimit = { ...baseLimits };
  for (const feature of CREDIT_FEATURES) {
    const baseLimit = (baseLimits as any)[feature];
    if (typeof baseLimit === "number") {
      (limits as any)[feature] = Math.max(0, baseLimit + Math.max(0, Number(credits[feature] || 0)));
    }
  }

  // STEP 6: Calculate remaining quota = effective limits - current usage
  const remaining = {
    monthly_ai_calls: Math.max(0, limits.monthly_ai_calls - usage.monthly_ai_calls),
    scenario_depth: Math.max(0, limits.scenario_depth - usage.scenario_depth),
    ocr_quota: Math.max(0, limits.ocr_quota - usage.ocr_quota),
    export_access: limits.export_access,
    api_requests: Math.max(0, limits.api_requests - usage.api_requests),
    autopilot_actions: Math.max(0, limits.autopilot_actions - usage.autopilot_actions),
    workflow_runs: Math.max(0, limits.workflow_runs - usage.workflow_runs),
    connector_sync_records: Math.max(0, limits.connector_sync_records - usage.connector_sync_records),
    marketplace_installs: Math.max(0, limits.marketplace_installs - usage.marketplace_installs),
  };

  const result = {
    entitlement,
    base_limits: baseLimits,
    credits,
    limits,
    usage,
    remaining,
    period_key: periodKey,
  };

  await cacheSet(cacheKey, result, 60); // 60s TTL
  return result;
};

/**
 * Enforces a feature limit before allowing an operation.
 *
 * This is the GATEKEEPER function -- call it before executing any
 * rate-limited feature. It throws a 402 HTTP error if:
 * - The feature is not available on the current plan (boolean check)
 * - The user has exceeded their monthly limit (numeric check)
 *
 * USAGE PATTERN:
 *   await enforceFeatureLimit({ orgId, userId, feature: "monthly_ai_calls" });
 *   // ... proceed with the AI call ...
 *
 * @param {object} params - Enforcement parameters
 * @param {Types.ObjectId} [params.orgId] - Organization ID
 * @param {Types.ObjectId} params.userId - User ID
 * @param {keyof PlanLimit} params.feature - Which feature to check
 * @param {number} [params.units=1] - How many units the operation needs
 * @param {string} [params.requestId] - Request ID for error context
 * @returns {Promise<object>} The resolved entitlements (for downstream use)
 * @throws {HttpError} 402 if the feature is not available or limit is reached
 */
export const enforceFeatureLimit = async (params: {
  orgId?: Types.ObjectId;
  userId: Types.ObjectId;
  feature: keyof PlanLimit;
  units?: number;
  requestId?: string;
}) => {
  const units = Math.max(1, Number(params.units || 1));
  // Get the full entitlement resolution (cached if recent)
  const resolved = await getResolvedEntitlements({ orgId: params.orgId, userId: params.userId });
  const limit = resolved.limits[params.feature];

  // BOOLEAN CHECK: For features like export_access that are either on or off
  if (typeof limit === "boolean") {
    if (!limit) {
      throw new HttpError(402, "FEATURE_NOT_AVAILABLE", `${params.feature} is not available on current plan`, {
        feature: params.feature,
        plan: resolved.entitlement.plan,
      });
    }
    return resolved; // Feature is available, no numeric limit to check
  }

  // NUMERIC CHECK: For features with monthly quotas
  const used = Number((resolved.usage as any)[params.feature] || 0);
  if (used + units > limit) {
    throw new HttpError(402, "FEATURE_LIMIT_REACHED", `${params.feature} monthly limit reached`, {
      feature: params.feature,
      limit,       // Total allowed (plan + credits)
      used,        // Already consumed this period
      requested_units: units, // How many the caller wants
      request_id: params.requestId,
    });
  }

  return resolved; // Limit not reached, return resolved for downstream use
};

/**
 * Records feature usage after an operation completes.
 *
 * DUAL WRITE STRATEGY:
 * 1. Creates a UsageEvent document (detailed log with tokens, cost, model info)
 * 2. Increments the UsageLedger counter (fast aggregate for limit checks)
 * 3. Invalidates the entitlements cache (so next check sees updated usage)
 *
 * IDEMPOTENCY: If an idempotencyKey is provided and a duplicate event exists,
 * the function silently returns null instead of throwing. This prevents
 * double-counting from retries.
 *
 * @param {object} params - Usage recording parameters
 * @param {Types.ObjectId} [params.orgId] - Organization ID
 * @param {Types.ObjectId} params.userId - User ID
 * @param {UsageFeature} params.feature - Which feature was used
 * @param {number} [params.units=1] - How many units were consumed
 * @param {number} [params.tokensIn] - AI input tokens (for cost tracking)
 * @param {number} [params.tokensOut] - AI output tokens (for cost tracking)
 * @param {number} [params.costUsd] - Estimated cost in USD
 * @param {string} [params.modelName] - AI model used (for cost analysis)
 * @param {string} [params.idempotencyKey] - Deduplication key for retries
 * @returns {Promise<object|null>} The created usage event, or null if duplicate
 */
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
  // Validate and sanitize inputs
  const units = Math.max(0, Number(params.units || 0));
  if (!Number.isFinite(units) || units <= 0) {
    return null; // No usage to record
  }

  // Sanitize optional cost/token metrics (AI-specific metadata)
  const tokensInRaw = Number(params.tokensIn);
  const tokensOutRaw = Number(params.tokensOut);
  const costUsdRaw = Number(params.costUsd);

  const tokensIn = Number.isFinite(tokensInRaw) ? Math.max(0, Math.floor(tokensInRaw)) : undefined;
  const tokensOut = Number.isFinite(tokensOutRaw) ? Math.max(0, Math.floor(tokensOutRaw)) : undefined;
  const costUsd = Number.isFinite(costUsdRaw) ? Math.max(0, costUsdRaw) : undefined;
  const modelName =
    typeof params.modelName === "string" && params.modelName.trim().length > 0
      ? params.modelName.trim().slice(0, 80) // Truncate long model names
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

    // WRITE 1: Create detailed usage event (audit log with full metadata)
    const created = await UsageEventModel.create(createPayload);
    recordUsageEvent({ feature: params.feature, units }); // Emit metrics

    // WRITE 2: Increment the aggregated ledger counter (fast lookups for enforcement)
    // Only done for org-scoped usage (user-scoped is aggregated from events)
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

      // $setOnInsert + $inc + upsert: creates the ledger entry on first usage,
      // then increments on subsequent uses within the same period
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

    // WRITE 3: Invalidate the Redis cache so the next entitlement check
    // sees the updated usage. Without this, the user could exceed their
    // limit within the 60-second cache window.
    const entCacheKey = `ent:${params.orgId?.toString() ?? params.userId.toString()}:${periodKey}`;
    await cacheDel(entCacheKey);

    return created;
  } catch (error: any) {
    // Handle duplicate key errors from idempotency keys
    // MongoDB error code 11000 = duplicate key violation
    if (error?.code === 11000 && params.idempotencyKey) {
      return null; // Silently ignore -- this is expected for retries
    }
    throw error; // Re-throw unexpected errors
  }
};

// =============================================================================
// END-OF-FILE SUMMARY
// =============================================================================
//
// KEY TAKEAWAYS:
//
// 1. FOUR-TIER PLAN MODEL: The Free/Pro/Team/Enterprise tiers provide clear
//    upgrade paths. Limits scale ~5-10x between tiers, giving users concrete
//    reasons to upgrade as their usage grows.
//
// 2. CREDIT SYSTEM: Credit grants add flexibility beyond rigid plan limits.
//    Organizations can receive bonus quota through promotions, referrals,
//    or manual adjustments without changing their plan tier.
//
// 3. DUAL USAGE TRACKING: Usage is stored in both a detailed event log
//    (UsageEventModel) and an aggregated counter (UsageLedgerModel). The
//    event log provides an audit trail; the ledger provides fast lookups.
//
// 4. CACHE INVALIDATION: The Redis cache (60s TTL) is explicitly invalidated
//    when usage is recorded. This prevents a race condition where the user
//    could exceed their limit within the cache window.
//
// 5. ENFORCE-THEN-RECORD: The typical usage pattern is:
//    1. enforceFeatureLimit() -- check before the operation
//    2. ... do the operation ...
//    3. recordFeatureUsage() -- record after the operation
//    This two-step approach prevents over-counting if the operation fails.
//
// 6. ORG-FIRST MIGRATION: The entitlement lookup prioritizes org-level records
//    and automatically migrates legacy per-user records. This enables a smooth
//    transition from individual to organizational billing.
// =============================================================================
