import { Types } from "mongoose";

import AiResponseCacheModel from "../models/aiResponseCacheModel";
import { getEnv } from "../config/env";
import { logger } from "../config/logger";
import type { AiCoreProcessRequest } from "./aiCoreClient";
import { sha256 } from "./aiCache";

const endpoint = "conversation-insights";
const inFlight = new Map<string, Promise<InsightSnapshot>>();
const MAX_IN_FLIGHT_KEYS = 64;

type InsightSnapshot = {
  data: Record<string, unknown>;
  generatedAt: string;
};

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
export function conversationInsightsCacheKey(orgId: string, userId: string, request: AiCoreProcessRequest) {
  const snapshot = JSON.parse(JSON.stringify(request));
  if (typeof snapshot.finance_context?.as_of === "string") {
    snapshot.finance_context.as_of = snapshot.finance_context.as_of.slice(0, 10);
  }
  return sha256(JSON.stringify(canonical({ version: 1, endpoint, orgId, userId, request: snapshot })));
}

export async function getOrGenerateConversationInsights(params: {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  request: AiCoreProcessRequest;
  refresh?: boolean;
  generate: () => Promise<Record<string, unknown>>;
}): Promise<InsightSnapshot & { cacheHit: boolean }> {
  const ttl = getEnv().CONVERSATION_INSIGHTS_CACHE_TTL_MS;
  const cacheKey = conversationInsightsCacheKey(String(params.orgId), String(params.userId), params.request);
  const scope = { orgId: params.orgId, userId: params.userId, endpoint, cacheKey };

  if (ttl > 0 && !params.refresh) {
    try {
      // TTL deletion is asynchronous in MongoDB: enforce expiry when reading.
      const cached = await AiResponseCacheModel.findOne({ ...scope, expiresAt: { $gt: new Date() } }).lean();
      const snapshot = cached?.responseData as InsightSnapshot | undefined;
      if (snapshot?.data && typeof snapshot.data.response === "string" && typeof snapshot.generatedAt === "string") {
        return { ...snapshot, cacheHit: true };
      }
    } catch (error) {
      logger.warn({ error, operation: endpoint }, "Conversation insight cache read failed");
    }
  }

  const pending = ttl > 0 ? inFlight.get(cacheKey) : undefined;
  if (pending) return { ...await pending, cacheHit: true };

  const generate = async (): Promise<InsightSnapshot> => {
    const data = await params.generate();
    const snapshot = { data, generatedAt: new Date().toISOString() };
    if (ttl > 0) {
      // Briefly reuse a degraded reply to avoid a retry storm; explicit Refresh
      // always retries immediately. Healthy summaries use the configured TTL.
      const lifetime = data.fallback_used ? Math.min(ttl, 15_000) : ttl;
      try {
        await AiResponseCacheModel.updateOne(scope, { $set: {
          ...scope, responseData: snapshot, expiresAt: new Date(Date.now() + lifetime),
        } }, { upsert: true });
      } catch (error) {
        logger.warn({ error, operation: endpoint }, "Conversation insight cache write failed");
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
  }
}
