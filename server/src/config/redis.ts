import Redis from "ioredis";
import { getEnv } from "./env";
import { logger } from "./logger";

let _redis: Redis | null = null;

/**
 * Get or create a lazily-connected Redis client.
 * Returns `null` when REDIS_URL is not configured — callers must handle gracefully.
 */
export const getRedis = (): Redis | null => {
  if (_redis) return _redis;

  const env = getEnv();
  if (!env.REDIS_URL) return null;

  _redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    enableAutoPipelining: true,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) return null; // stop retrying
      return Math.min(times * 200, 2000);
    },
  });

  _redis.on("error", (e) =>
    logger.warn(
      { err: e.message, event: "redis_error" },
      "Redis error (non-fatal)",
    ),
  );

  _redis.on("connect", () =>
    logger.info({ event: "redis_connected" }, "Redis connected"),
  );

  return _redis;
};

// ── Cache Helpers ─────────────────────────────────────────────────────

/**
 * Get a cached value by key. Returns `null` on miss or if Redis is unavailable.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const raw = await r.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Set a cached value with a TTL in seconds.
 * Silently no-ops if Redis is unavailable.
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // non-fatal: app continues without cache
  }
}

/**
 * Delete a cached key. Silently no-ops if Redis is unavailable.
 */
export async function cacheDel(pattern: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(pattern);
  } catch {
    // non-fatal
  }
}

/**
 * Delete all keys matching a glob pattern. Use sparingly.
 */
export async function cacheDelPattern(pattern: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    const keys = await r.keys(pattern);
    if (keys.length > 0) {
      await r.del(...keys);
    }
  } catch {
    // non-fatal
  }
}

/**
 * Gracefully close the Redis connection (for shutdown hooks).
 */
export async function closeRedis(): Promise<void> {
  if (_redis) {
    try {
      await _redis.quit();
    } catch {
      // ignore
    }
    _redis = null;
  }
}
