/**
 * @fileoverview Redis Configuration and Cache Helpers
 *
 * This module provides a lazily-initialized Redis client and a set of cache helper
 * functions used throughout the application for:
 * - Rate limiting (express-rate-limit store)
 * - Session storage
 * - API response caching
 * - Optional cache backing store
 *
 * KEY DESIGN DECISIONS:
 * 1. **Lazy Connection**: Redis is not connected until first use. If REDIS_URL is not
 *    configured, all cache operations silently no-op. This allows the app to run
 *    without Redis in development.
 *
 * 2. **Graceful Degradation**: All cache helper functions (cacheGet, cacheSet, etc.)
 *    catch errors and return null/void. The application continues to work without
 *    caching if Redis is temporarily unavailable.
 *
 * 3. **Auto-Pipelining**: ioredis's auto-pipelining batches multiple Redis commands
 *    into a single round-trip, significantly improving performance under load.
 *
 * PRODUCTION INSIGHTS:
 * - Redis is optional in development but recommended for production
 * - The retry strategy uses exponential backoff (200ms, 400ms, 600ms... up to 2s)
 * - After 5 failed retries, the client stops retrying (returns null from retryStrategy)
 * - cacheDelPattern uses incremental SCAN + UNLINK, never the blocking KEYS command
 *
 * @module config/redis
 */

// ── Imports ───────────────────────────────────────────────────────────
import Redis from "ioredis";           // Redis client with clustering, pipelining, and Lua support
import { getEnv } from "./env";        // Environment configuration
import { logger } from "./logger";     // Application logger

// Singleton Redis client instance (null until first use or if REDIS_URL is not set)
let _redis: Redis | null = null;

// Returns the singleton Redis client instance, lazily instantiating it on first invocation.
// Gracefully returns null if the REDIS_URL environment variable is not configured.
export const getRedis = (): Redis | null => {
  // Return existing client if already created (singleton pattern)
  if (_redis) return _redis;

  const env = getEnv();

  // If REDIS_URL is not configured, return null (graceful degradation)
  if (!env.REDIS_URL) return null;

  // Create Redis client with production-ready configuration
  _redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,            // Don't connect until first command
    enableAutoPipelining: true,   // Batch consecutive commands for performance
    maxRetriesPerRequest: 3,      // Retry each command up to 3 times
    retryStrategy(times) {
      // Exponential backoff: 200ms, 400ms, 600ms... up to 2000ms
      // After 5 retries, return null to stop retrying
      if (times > 5) return null;
      return Math.min(times * 200, 2000);
    },
  });

  // Log Redis errors as warnings (non-fatal - app continues without cache)
  _redis.on("error", (e) =>
    logger.warn(
      { err: e.message, event: "redis_error" },
      "Redis error (non-fatal)",
    ),
  );

  // Log successful connection
  _redis.on("connect", () =>
    logger.info({ event: "redis_connected" }, "Redis connected"),
  );

  return _redis;
};

// ── Cache Helpers ─────────────────────────────────────────────────────
// These helpers provide a simple key-value cache interface with TTL support.
// All functions gracefully degrade when Redis is unavailable (return null or no-op).

// Fetches a cached JSON-serialized value from Redis by its unique string key.
// Returns deserialized data or null on cache misses, network errors, or unconfigured Redis.
export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null; // Redis not configured - graceful degradation
  try {
    const raw = await r.get(key);
    return raw ? (JSON.parse(raw) as T) : null; // Parse JSON or return null on miss
  } catch {
    return null; // Redis error - treat as cache miss
  }
}

// Serializes and stores a key-value pair in Redis with an explicit time-to-live expiration.
// Silently suppresses network exceptions to allow uninterrupted application execution.
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const r = getRedis();
  if (!r) return; // Redis not configured - no-op
  try {
    // "EX" flag: set expiry in seconds
    await r.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // non-fatal: app continues without cache
  }
}

// Deletes a specific cache entry from Redis matching the provided key string.
// No-ops gracefully without throwing errors if Redis is offline or disconnected.
export async function cacheDel(key: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(key);
  } catch {
    // non-fatal
  }
}

// Invalidates all cached Redis keys matching a glob pattern. Uses incremental SCAN +
// UNLINK (never the blocking KEYS command) so a large keyspace cannot stall Redis.
// Returns the number of keys removed (0 when Redis is unavailable).
export async function cacheDelPattern(pattern: string): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  return scanDelete(r, pattern);
}

// SCAN + UNLINK loop; exported so it can be exercised against any ioredis-compatible client.
export async function scanDelete(
  client: Pick<Redis, "scan" | "unlink">,
  pattern: string,
  count = 200,
): Promise<number> {
  let removed = 0;
  try {
    let cursor = "0";
    do {
      const [next, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", count);
      cursor = String(next);
      if (keys.length > 0) {
        removed += await client.unlink(...keys);
      }
    } while (cursor !== "0");
  } catch (err) {
    // non-fatal: stale cache entries still expire via their TTL
    logger.warn({ err: (err as Error)?.message, pattern, event: "redis_scan_delete_failed" }, "cacheDelPattern failed");
  }
  return removed;
}

// Gracefully terminates the active Redis connection pool during application shutdown.
// Awaits in-flight commands and resets the client singleton handle to null.
export async function closeRedis(): Promise<void> {
  if (_redis) {
    try {
      await _redis.quit(); // Graceful close (waits for pending commands)
    } catch {
      // ignore errors during shutdown
    }
    _redis = null; // Clear reference for garbage collection
  }
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **Graceful Degradation**: The app works without Redis. All cache functions
 *    return null or no-op when Redis is unavailable. This is a production pattern
 *    that prevents cache failures from taking down the application.
 *
 * 2. **Singleton Pattern with Lazy Init**: The Redis client is created once on
 *    first use, not at import time. This avoids connection errors during module
 *    loading and allows the app to start without Redis.
 *
 * 3. **Auto-Pipelining**: ioredis batches consecutive commands into a single
 *    round-trip. This is a free performance optimization that requires no code changes.
 *
 * 4. **JSON Serialization**: Values are stored as JSON strings. This works for
 *    most data types but has overhead for simple strings/numbers. For high-frequency
 *    simple values, consider using Redis's native string/number storage.
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * redis.ts → used by rate limiters (express-rate-limit)
 * redis.ts → used by cache helpers in services (aiCache, responseCache)
 * redis.ts → used by optional response and application caches
 * redis.ts → closed by server.ts during graceful shutdown
 * ══════════════════════════════════════════════════════════════════════
 */
