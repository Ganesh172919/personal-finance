/**
 * @fileoverview Storage layer for the request-path auth cache.
 *
 * Holds the lean user and active-membership projections that every authenticated
 * request needs. Two tiers:
 *   1. a bounded in-process LRU with a short TTL (zero network hops), and
 *   2. Redis (shared across replicas) when REDIS_URL is configured.
 * Without Redis only the local tier exists and its TTL is the full cache TTL
 * (model hooks invalidate it immediately within the process).
 *
 * This file deliberately imports no Mongoose models so the invalidation plugin
 * (utils/authCacheInvalidation.ts) can be applied from model files without an
 * import cycle. Loaders live in services/authCache.ts.
 *
 * Env:
 *   AUTH_CACHE_TTL_SECONDS    Redis/overall TTL. Default 45, 0 disables the cache.
 *                             Defaults to 0 under NODE_ENV=test (tests clear the DB
 *                             with native deleteMany, which bypasses invalidation hooks).
 *   AUTH_CACHE_LOCAL_TTL_MS   Local LRU TTL when Redis is in use (bounds cross-replica
 *                             staleness). Default 5000.
 *   AUTH_CACHE_LOCAL_MAX      Local LRU capacity. Default 5000 entries.
 */
import { cacheDel, cacheGet, cacheSet, getRedis } from "../config/redis";

// Categorizes authentication cache entries into user profiles or memberships.
// "u" designates cached user records while "m" designates cached org memberships.
// Serves as key partition discriminator across in-memory and Redis storage tiers.
export type AuthCacheKind = "u" | "m";

// Safely parses an integer configuration value from environment variables.
// Validates finite positive number semantics to avoid invalid runtime calculations.
// Defaults gracefully to the provided fallback value when undefined or non-numeric.
const intFromEnv = (name: string, fallback: number) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
};

/** Overall TTL in seconds; 0 means the cache is disabled. */
// Computes overall authentication cache time-to-live expiration in seconds.
// Disables caching during test executions to prevent cross-test state leakage.
// Reads dynamically from environment configuration with production safe defaults.
export const authCacheTtlSeconds = () =>
  intFromEnv("AUTH_CACHE_TTL_SECONDS", process.env.NODE_ENV === "test" ? 0 : 45);

// Calculates in-memory local LRU cache retention interval in milliseconds.
// Ensures local cache TTL does not exceed global Redis TTL settings.
// Bounds cache staleness to keep replica instances closely synchronized.
const localTtlMs = () => {
  const overall = authCacheTtlSeconds() * 1000;
  if (!getRedis()) return overall;
  return Math.min(overall, intFromEnv("AUTH_CACHE_LOCAL_TTL_MS", 5_000));
};

// Formats standard namespace cache key for authentication entities.
// Combines partition kind identifier with the unique resource entity ID.
// Guarantees consistent cache key resolution across local memory and Redis keyspaces.
const keyOf = (kind: AuthCacheKind, id: string) => `auth:${kind}:${id}`;

// Represents an entry stored inside the in-memory local auth LRU cache.
// Encapsulates serialized JSON data payload alongside absolute expiration epoch timestamp.
// Enables rapid in-process deserialization without round-trip network overhead.
interface LocalEntry {
  json: string;
  expiresAt: number;
}

const local = new Map<string, LocalEntry>();

// Updates LRU access ordering and enforces bounded maximum entry capacity.
// Evicts oldest cache entries sequentially when collection exceeds configured limits.
// Guarantees strict upper bounds on process heap memory consumption.
const touch = (key: string, entry: LocalEntry) => {
  local.delete(key);
  local.set(key, entry);
  const max = intFromEnv("AUTH_CACHE_LOCAL_MAX", 5_000);
  while (local.size > max) {
    const oldest = local.keys().next().value;
    if (oldest === undefined) break;
    local.delete(oldest);
  }
};

/** Returns the cached JSON string for `id`, or null on a miss. */
// Retrieves cached authentication JSON payload from memory or distributed Redis.
// Checks local LRU tier first and falls back to remote Redis on local cache miss.
// Re-populates local memory cache upon Redis cache hit for subsequent requests.
export const authCacheGet = async (kind: AuthCacheKind, id: string): Promise<string | null> => {
  if (authCacheTtlSeconds() <= 0) return null;
  const key = keyOf(kind, id);
  const hit = local.get(key);
  if (hit) {
    if (hit.expiresAt > Date.now()) {
      touch(key, hit);
      return hit.json;
    }
    local.delete(key);
  }
  if (getRedis()) {
    const remote = await cacheGet<{ json: string }>(key);
    if (remote?.json) {
      touch(key, { json: remote.json, expiresAt: Date.now() + localTtlMs() });
      return remote.json;
    }
  }
  return null;
};

// Writes authentication JSON payload to both local LRU and distributed Redis tiers.
// Applies distinct local and distributed expiration lifespans appropriately.
// Skips persistence entirely when authentication caching is disabled globally.
export const authCacheSet = async (kind: AuthCacheKind, id: string, json: string): Promise<void> => {
  const ttl = authCacheTtlSeconds();
  if (ttl <= 0) return;
  const key = keyOf(kind, id);
  touch(key, { json, expiresAt: Date.now() + localTtlMs() });
  if (getRedis()) await cacheSet(key, { json }, ttl);
};

/**
 * Drops both cached projections for a user. Called from model hooks on any
 * user/membership write (role, org, password, status changes), so the next
 * request re-reads the database.
 */
// Evicts both user and membership cache records across local memory and Redis.
// Triggered on user and membership updates to guarantee immediate freshness.
// Prevents authorization bypasses caused by stale cached privilege records.
export const invalidateAuthCache = async (userId: unknown): Promise<void> => {
  const id = userId == null ? "" : String(userId);
  if (!id) return;
  local.delete(keyOf("u", id));
  local.delete(keyOf("m", id));
  if (getRedis()) {
    await Promise.all([cacheDel(keyOf("u", id)), cacheDel(keyOf("m", id))]);
  }
};

/** Test helper: empties the local tier. */
// Flushes all entries from the local in-process authentication cache map.
// Intended primarily for unit test isolation and diagnostic memory clearing.
// Resets in-process storage tier to an empty initial state immediately.
export const resetAuthCacheLocal = () => local.clear();
