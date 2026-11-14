import crypto from "crypto";
import type { Types } from "mongoose";

import AiResponseCacheModel from "../models/aiResponseCacheModel";

// Computes a standard SHA-256 hexadecimal hash string for input data.
// Converts arbitrary cache key payloads into uniform fixed-length digests.
// Used for deterministic cache indexing and collision avoidance.
export const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

// Configures standard cache expiration lifetimes across primary summary endpoints.
// Balances data freshness requirements with computational cost savings.
// Defines TTL parameters for transactions, dashboards, and portfolio summaries.
export const responseCacheTtlMs = {
  transactionsSummary: 15 * 60 * 1000,
  dashboardSummary: 2 * 60 * 1000,
  portfolioSummary: 5 * 60 * 1000,
};

// Constructs a deterministic cache key for transaction aggregation summaries.
// Incorporates tenant IDs, date ranges, categorization limits, and update times.
// Automatically invalidates cached records whenever underlying transactions change.
export const buildTransactionsSummaryCacheKey = (params: {
  orgId: string;
  userId: string;
  from: string;
  to: string;
  groupBy: string;
  topCategories: number;
  transactionsUpdatedAt?: string;
  currency?: string;
}) => {
  const txUpdatedAt = params.transactionsUpdatedAt || "";
  const curr = params.currency || "BASE";
  return sha256(
    `transactions-summary|${params.orgId}|${params.userId}|${params.from}|${params.to}|${params.groupBy}|${params.topCategories}|${txUpdatedAt}|${curr}`
  );
};

// Builds a multi-entity invalidation cache key for user dashboard summaries.
// Binds organization identifiers, monthly keys, profile edits, and task updates.
// Guarantees immediate cache busting when profiles or transactions are updated.
export const buildDashboardSummaryCacheKey = (params: {
  orgId: string;
  userId: string;
  monthKey: string;
  profileUpdatedAt?: string;
  transactionsUpdatedAt?: string;
  tasksUpdatedAt?: string;
}) => {
  const profileUpdatedAt = params.profileUpdatedAt || "";
  const txUpdatedAt = params.transactionsUpdatedAt || "";
  const tasksUpdatedAt = params.tasksUpdatedAt || "";
  return sha256(
    `dashboard-summary|${params.orgId}|${params.userId}|${params.monthKey}|${profileUpdatedAt}|${txUpdatedAt}|${tasksUpdatedAt}`
  );
};

// Generates a hashed cache identifier for multi-month portfolio performance views.
// Incorporates withholding tax rates, target currencies, and transaction updates.
// Ensures accurate cache reuse across analytical investment calculations.
export const buildPortfolioSummaryCacheKey = (params: {
  orgId: string;
  userId: string;
  monthKey: string;
  months: number;
  transactionsUpdatedAt?: string;
  currency?: string;
  whtRate?: number;
}) => {
  const txUpdatedAt = params.transactionsUpdatedAt || "";
  const curr = params.currency || "BASE";
  const wht = params.whtRate !== undefined ? String(params.whtRate) : "DEF";
  return sha256(
    `portfolio-summary|${params.orgId}|${params.userId}|${params.monthKey}|${params.months}|${txUpdatedAt}|${curr}|${wht}`
  );
};

// Queries the database cache for pre-computed analytical response payloads.
// Retrieves unexpired cache entries matched by unique deterministic keys.
// Returns deserialized response objects or null when a cache miss occurs.
export const getCachedResponse = async <T>(params: { cacheKey: string }): Promise<T | null> => {
  const cached = await AiResponseCacheModel.findOne({ cacheKey: params.cacheKey }).lean();
  if (!cached) return null;
  return cached.responseData as T;
};

// Persists computed API endpoint responses into the database cache.
// Performs upsert operations with explicit tenant scoping and expiration TTLs.
// Reuses cached calculations across subsequent equivalent client requests.
export const setCachedResponse = async (params: {
  cacheKey: string;
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  endpoint: string;
  responseData: unknown;
  ttlMs: number;
}): Promise<void> => {
  await AiResponseCacheModel.findOneAndUpdate(
    { cacheKey: params.cacheKey },
    {
      $set: {
        orgId: params.orgId,
        userId: params.userId,
        endpoint: params.endpoint,
        responseData: params.responseData,
        expiresAt: new Date(Date.now() + params.ttlMs),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};
