import { Types } from "mongoose";

import AiResponseCacheModel from "../models/aiResponseCacheModel";
import { getEnv } from "../config/env";
import { logger } from "../config/logger";
import { cacheDel, cacheGet, cacheSet, getRedis } from "../config/redis";
import type { AiCoreProcessRequest } from "./aiCoreClient";
import { sha256 } from "./aiCache";
import { summaryCapacityService } from "./summaryCapacityService";

const endpoint = "conversation-insights";
const inFlight = new Map<string, Promise<InsightSnapshot>>();
const MAX_IN_FLIGHT_KEYS = 64;

// Encapsulates a cached conversation insight response along with creation metadata.
// Stores the arbitrary AI output payload data alongside an ISO generation timestamp.
// Used across memory, MongoDB, and Redis multi-tier caching architectures.
export type InsightSnapshot = {
  data: Record<string, unknown>;
  generatedAt: string;
};

// Normalizes arbitrary nested data structures into sorted canonical representations.
// Recursively traverses arrays and sorts object keys lexicographically.
// Guarantees stable and reproducible hash key outputs across equivalent payloads.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

/** Hash actual context, preserving array order and all financial values.
 * Only the request's wall-clock timestamp is reduced to its UTC day. The short
 * TTL bounds age within that day; crossing midnight always changes the key.
 */
// Generates a deterministic SHA256 cache identifier key for an insight request.
// Truncates request context dates to daily resolution while preserving financial figures.
// Incorporates tenant, user, endpoint, and payload structure into hash derivation.
export function conversationInsightsCacheKey(orgId: string, userId: string, request: AiCoreProcessRequest) {
  const snapshot = JSON.parse(JSON.stringify(request));
  if (typeof snapshot.finance_context?.as_of === "string") {
    snapshot.finance_context.as_of = snapshot.finance_context.as_of.slice(0, 10);
  }
  return sha256(JSON.stringify(canonical({ version: 1, endpoint, orgId, userId, request: snapshot })));
}

// Coordinates multi-tier caching, in-flight coalescing, and live insight generation.
// Inspects MongoDB L1 and Redis L2 tiers before falling back to live AI execution.
// Employs distributed Redis locks to avoid redundant duplicate AI generation waves.
export async function getOrGenerateConversationInsights(params: {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  request: AiCoreProcessRequest;
  refresh?: boolean;
  generate: () => Promise<Record<string, unknown>>;
}): Promise<InsightSnapshot & { cacheHit: boolean }> {
  summaryCapacityService.recordRequest();
  const ttl = getEnv().CONVERSATION_INSIGHTS_CACHE_TTL_MS;
  const cacheKey = conversationInsightsCacheKey(String(params.orgId), String(params.userId), params.request);
  const redisCacheKey = `insight:summary:${cacheKey}`;
  const scope = { orgId: params.orgId, userId: params.userId, endpoint, cacheKey };

  if (ttl > 0 && !params.refresh) {
    try {
      // 1. Check persistent MongoDB cache (L1)
      const cached = await AiResponseCacheModel.findOne({ ...scope, expiresAt: { $gt: new Date() } }).lean();
      const snapshot = cached?.responseData as InsightSnapshot | undefined;
      if (snapshot?.data && typeof snapshot.data.response === "string" && typeof snapshot.generatedAt === "string") {
        summaryCapacityService.recordCacheHit("l1_mongo");
        return { ...snapshot, cacheHit: true };
      }

      // 2. Check fast distributed Redis cache (L2)
      const redisCached = await cacheGet<InsightSnapshot>(redisCacheKey);
      if (redisCached?.data && typeof redisCached.data.response === "string" && typeof redisCached.generatedAt === "string") {
        summaryCapacityService.recordCacheHit("l2_redis");
        return { ...redisCached, cacheHit: true };
      }
    } catch (error) {
      logger.warn({ error, operation: endpoint }, "Conversation insight cache read failed");
    }
  }

  // 3. Process-level in-flight coalescing
  const pending = ttl > 0 ? inFlight.get(cacheKey) : undefined;
  if (pending) {
    summaryCapacityService.recordCoalesced("in_flight");
    return { ...await pending, cacheHit: true };
  }

  // 4. Distributed Redis coordination lock & coalescing
  const r = getRedis();
  const distLockKey = `lock:summary:${cacheKey}`;
  let distLockAcquired = false;

  if (r && ttl > 0 && !params.refresh) {
    try {
      const lockResult = await r.set(distLockKey, "1", "EX", 20, "NX");
      distLockAcquired = lockResult === "OK";
      if (!distLockAcquired) {
        summaryCapacityService.recordCoalesced("distributed_redis");
        const pollStart = Date.now();
        while (Date.now() - pollStart < 6000) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          const polled = await cacheGet<InsightSnapshot>(redisCacheKey);
          if (polled?.data && typeof polled.data.response === "string") {
            return { ...polled, cacheHit: true };
          }
        }
      }
    } catch (err) {
      logger.warn({ err, operation: endpoint }, "Distributed coordination lock attempt failed, proceeding with local execution");
    }
  }

  const generate = async (): Promise<InsightSnapshot> => {
    const startGen = Date.now();
    const data = await params.generate();
    const durationMs = Date.now() - startGen;
    const fallbackUsed = Boolean(data.fallback_used);

    summaryCapacityService.recordLiveGeneration({
      durationMs,
      fallbackUsed,
      tokensIn: typeof data.tokens_in === "number" ? data.tokens_in : undefined,
      tokensOut: typeof data.tokens_out === "number" ? data.tokens_out : undefined,
      costUsd: typeof data.cost_usd === "number" ? data.cost_usd : undefined,
    });

    const snapshot = { data, generatedAt: new Date().toISOString() };
    if (ttl > 0) {
      // Briefly reuse a degraded reply to avoid a retry storm; explicit Refresh
      // always retries immediately. Healthy summaries use the configured TTL.
      const lifetime = fallbackUsed ? Math.min(ttl, 15_000) : ttl;
      try {
        await AiResponseCacheModel.updateOne(scope, { $set: {
          ...scope, responseData: snapshot, expiresAt: new Date(Date.now() + lifetime),
        } }, { upsert: true });
      } catch (error) {
        logger.warn({ error, operation: endpoint }, "Conversation insight cache write failed");
      }
      try {
        await cacheSet(redisCacheKey, snapshot, Math.ceil(lifetime / 1000));
      } catch (err) {
        logger.warn({ err, operation: endpoint }, "Redis cache write failed");
      }
    }
    if (distLockAcquired && r) {
      try {
        await cacheDel(distLockKey);
      } catch {
        // ignore
      }
    }
    return snapshot;
  };

  const tracked = ttl > 0 && inFlight.size < MAX_IN_FLIGHT_KEYS;
  const promise = generate();
  if (tracked) inFlight.set(cacheKey, promise);
  try {
    return { ...await promise, cacheHit: false };
  } finally {
    if (tracked && inFlight.get(cacheKey) === promise) inFlight.delete(cacheKey);
    if (distLockAcquired && r) {
      try {
        await cacheDel(distLockKey);
      } catch {
        // ignore
      }
    }
  }
}
