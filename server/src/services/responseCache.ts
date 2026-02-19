import crypto from "crypto";
import type { Types } from "mongoose";

import { getRedis } from "../config/redis";
import AiResponseCacheModel from "../models/aiResponseCacheModel";

export const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export const responseCacheTtlMs = {
  transactionsSummary: 15 * 60 * 1000,
  dashboardSummary: 2 * 60 * 1000,
  portfolioSummary: 5 * 60 * 1000,
};

export const buildTransactionsSummaryCacheKey = (params: {
  orgId: string;
  userId: string;
  from: string;
  to: string;
  groupBy: string;
  topCategories: number;
  transactionsUpdatedAt?: string;
}) => {
  const txUpdatedAt = params.transactionsUpdatedAt || "";
  return sha256(
    `transactions-summary|${params.orgId}|${params.userId}|${params.from}|${params.to}|${params.groupBy}|${params.topCategories}|${txUpdatedAt}`
  );
};

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

export const buildPortfolioSummaryCacheKey = (params: {
  orgId: string;
  userId: string;
  monthKey: string;
  months: number;
  transactionsUpdatedAt?: string;
}) => {
  const txUpdatedAt = params.transactionsUpdatedAt || "";
  return sha256(
    `portfolio-summary|${params.orgId}|${params.userId}|${params.monthKey}|${params.months}|${txUpdatedAt}`
  );
};

const buildRedisKey = (cacheKey: string) => `finwise:response_cache:${cacheKey}`;

export const getCachedResponse = async <T>(params: { cacheKey: string }): Promise<T | null> => {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(buildRedisKey(params.cacheKey));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      await redis.del(buildRedisKey(params.cacheKey));
      return null;
    }
  }

  const cached = await AiResponseCacheModel.findOne({ cacheKey: params.cacheKey }).lean();
  if (!cached) return null;
  return cached.responseData as T;
};

export const setCachedResponse = async (params: {
  cacheKey: string;
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  endpoint: string;
  responseData: unknown;
  ttlMs: number;
}): Promise<void> => {
  const redis = getRedis();
  if (redis) {
    await redis.set(buildRedisKey(params.cacheKey), JSON.stringify(params.responseData), "PX", params.ttlMs);
    return;
  }

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

