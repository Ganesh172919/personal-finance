/**
 * @fileoverview Redis Configuration and Cache Helpers
 *
 * This module provides a lazily-initialized Redis client and a set of cache helper
 * functions used throughout the application for:
 * - Rate limiting (express-rate-limit store)
 * - Session storage
 * - API response caching
 * - BullMQ job queue backing store
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
 * - cacheDelPattern uses KEYS command which is O(N) - use sparingly in production
 *
 * @module config/redis
 */

// ── Imports ───────────────────────────────────────────────────────────
import Redis from "ioredis";           // Redis client with clustering, pipelining, and Lua support
import { getEnv } from "./env";        // Environment configuration
import { logger } from "./logger";     // Application logger

// Singleton Redis client instance (null until first use or if REDIS_URL is not set)
let _redis: Redis | null = null;

/**
 * Get or create a lazily-connected Redis client.
 *
 * This function implements the singleton pattern with lazy initialization.
 * The Redis client is created on first call and reused for subsequent calls.
 * Returns `null` when REDIS_URL is not configured — callers must handle gracefully.
 *
 * LAZY CONNECTION:
 * `lazyConnect: true` means the client won't actually connect until the first
 * command is sent. This allows the app to start even if Redis is temporarily down.
 *
 * AUTO-PIPELINING:
 * `enableAutoPipelining: true` batches consecutive Redis commands into a single
 * round-trip. For example, if you call cacheGet() 5 times in a row, ioredis
 * will batch them into one network request instead of 5.
 *
 * @returns {Redis | null} Redis client instance, or null if REDIS_URL is not configured
 */
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

/**
 * Get a cached value by key.
 *
 * Uses JSON deserialization to reconstruct the original value.
 * Returns `null` on cache miss OR if Redis is unavailable.
 *
 * TYPE PARAMETER:
 * <T> allows the caller to specify the expected return type, e.g.:
 *   const user = await cacheGet<User>("user:123");
 *
 * @param key - The cache key to look up
 * @returns The cached value (deserialized from JSON), or null on miss
 */
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

/**
 * Set a cached value with a TTL (time-to-live) in seconds.
 *
 * Uses JSON serialization to store the value.
 * Silently no-ops if Redis is unavailable (non-fatal).
 *
 * PRODUCTION INSIGHT:
 * The "EX" flag sets the key to expire after N seconds. This prevents
 * stale data from persisting indefinitely and manages memory usage.
 *
 * @param key - The cache key to set
 * @param value - The value to cache (will be JSON-serialized)
 * @param ttlSeconds - Time-to-live in seconds (key auto-deletes after this)
 */
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

/**
 * Delete a cached key.
 *
 * @param key - The cache key to delete
 */
export async function cacheDel(key: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(key);
  } catch {
    // non-fatal
  }
}

/**
 * Delete all keys matching a glob pattern.
 *
 * WARNING: Uses the Redis KEYS command which is O(N) where N is the total
 * number of keys in the database. In production with large keyspaces,
 * prefer SCAN-based deletion or use Redis namespaces with TTLs instead.
 *
 * @param pattern - Redis glob pattern (e.g., "cache:user:*")
 */
export async function cacheDelPattern(pattern: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    const keys = await r.keys(pattern);
    if (keys.length > 0) {
      await r.del(...keys); // Spread operator to pass keys as separate arguments
    }
  } catch {
    // non-fatal
  }
}

/**
 * Gracefully close the Redis connection.
 *
 * Called during server shutdown (in server.ts) to ensure clean resource cleanup.
 * Uses QUIT command which waits for pending commands to complete before closing.
 */
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
 * redis.ts → used by BullMQ job queue (via modules/queue/jobQueue.ts)
 * redis.ts → closed by server.ts during graceful shutdown
 * ══════════════════════════════════════════════════════════════════════
 */
