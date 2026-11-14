/**
 * @fileoverview Lightweight leader election for singleton periodic work
 * (newsletter scheduler, domain-event poller, nightly optimizer enqueue).
 *
 * Primary: Redis `SET key holder NX PX ttl`, renewed with a Lua compare-and-pexpire so only
 * the current holder can extend the lease. Fallback (no Redis, or Redis errors): an atomic
 * Mongo claim on the `leader_locks` collection. Calling `tryAcquireLeadership` on every tick
 * both acquires and renews; a crashed leader loses the lease after `ttlMs`.
 */
import { randomBytes } from "crypto";
import os from "os";

import { getRedis } from "../config/redis";
import { logger } from "../config/logger";
import LeaderLockModel from "../models/leaderLockModel";

// Unique process identity string combining hostname, process ID, and random hex.
// Distinguishes competing server worker nodes during leader lease acquisition.
// Used as the holder identifier for distributed locks across Redis and Mongo.
export const LEADER_HOLDER_ID = `${os.hostname()}:${process.pid}:${randomBytes(4).toString("hex")}`;

const RENEW_LUA = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end`;
const RELEASE_LUA = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

/** Minimal slice of ioredis used here (lets tests inject a fake). */
// Minimal interface isolating Redis operations required for leader election.
// Supports evaluation of atomic Lua lock renewal scripts and key-value setters.
// Facilitates dependency injection and in-memory mock testing of election logic.
export interface LeaderRedisLike {
  set(key: string, value: string, ...args: any[]): Promise<unknown>;
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

// Optional configuration parameters for leader lock acquisition attempts.
// Allows overriding holder IDs, supplying custom Redis clients, or forcing Mongo.
// Enables fine-grained testing and runtime fallback customization.
export interface LeaderOptions {
  holder?: string;
  redis?: LeaderRedisLike | null;
  /** Force the Mongo path (used by tests and when Redis is known to be down). */
  disableRedis?: boolean;
}

// Formats Redis key names prefixed with standard leader lock namespaces.
// Scopes distinct task lock keys by their unique periodic job names.
// Prevents namespace collisions across diverse background recurring jobs.
const redisKey = (name: string) => `leader:${name}`;

// Attempts to acquire or renew leader lease locks using Redis.
// Executes atomic Lua renewal scripts or sets conditional keys with TTLs.
// Returns true when lock acquisition or lease renewal succeeds.
const acquireViaRedis = async (redis: LeaderRedisLike, name: string, holder: string, ttlMs: number): Promise<boolean> => {
  const renewed = Number(await redis.eval(RENEW_LUA, 1, redisKey(name), holder, ttlMs));
  if (renewed === 1) return true;
  const res = await redis.set(redisKey(name), holder, "PX", ttlMs, "NX");
  return res === "OK";
};

// The unique index on `name` is what makes the upsert race-free; make sure it exists before first use.
let lockIndexReady: Promise<unknown> | null = null;

// Fallback leader acquisition mechanism utilizing MongoDB atomic findAndUpdate.
// Enforces race-free lease claims using unique index constraints on lock names.
// Extends expired locks or upserts new lease documents with expiration limits.
const acquireViaMongo = async (name: string, holder: string, ttlMs: number): Promise<boolean> => {
  lockIndexReady ??= LeaderLockModel.init().catch((error) => {
    lockIndexReady = null;
    throw error;
  });
  await lockIndexReady;
  const now = new Date();
  try {
    const doc = await LeaderLockModel.findOneAndUpdate(
      { name, $or: [{ holder }, { expiresAt: { $lte: now } }] },
      { $set: { holder, expiresAt: new Date(now.getTime() + ttlMs) } },
      { upsert: true, new: true }
    ).lean();
    return doc?.holder === holder;
  } catch (error: any) {
    // Duplicate key: another live holder owns the lease.
    if (error?.code === 11000) return false;
    throw error;
  }
};

/** Acquire (or renew) leadership for `name`. Never throws: errors mean "not leader". */
// Evaluates whether the current node can claim or renew leadership for a task.
// Prefers primary Redis distributed locks and degrades gracefully to MongoDB.
// Swallows unexpected errors and returns false to prevent unhandled node crashes.
export const tryAcquireLeadership = async (name: string, ttlMs: number, options: LeaderOptions = {}): Promise<boolean> => {
  const holder = options.holder ?? LEADER_HOLDER_ID;
  const redis = options.disableRedis ? null : options.redis === undefined ? (getRedis() as unknown as LeaderRedisLike | null) : options.redis;
  try {
    if (redis) {
      try {
        return await acquireViaRedis(redis, name, holder, ttlMs);
      } catch (error) {
        logger.warn({ err: (error as Error)?.message, name }, "leader election: redis failed, falling back to mongo");
      }
    }
    return await acquireViaMongo(name, holder, ttlMs);
  } catch (error) {
    logger.warn({ err: (error as Error)?.message, name }, "leader election failed; assuming follower");
    return false;
  }
};

/** Voluntarily give up the lease (graceful shutdown). */
// Voluntarily relinquishes held leadership locks across Redis and MongoDB.
// Invokes atomic Lua delete scripts and purges Mongo lock entries for the holder.
// Used during graceful worker shutdown to expedite leader failover.
export const releaseLeadership = async (name: string, options: LeaderOptions = {}): Promise<void> => {
  const holder = options.holder ?? LEADER_HOLDER_ID;
  const redis = options.disableRedis ? null : options.redis === undefined ? (getRedis() as unknown as LeaderRedisLike | null) : options.redis;
  try {
    if (redis) await redis.eval(RELEASE_LUA, 1, redisKey(name), holder);
  } catch {
    /* lease expires on its own */
  }
  try {
    await LeaderLockModel.deleteOne({ name, holder });
  } catch {
    /* lease expires on its own */
  }
};

/** Runs `fn` only if this process currently holds (or wins) the lease. Returns whether it ran. */
// Executes an asynchronous task exclusively when holding the leader lock.
// Attempts lease acquisition or renewal before invoking the target callback.
// Returns a boolean indicating whether the task was permitted to run.
export const runIfLeader = async (name: string, ttlMs: number, fn: () => Promise<void>, options: LeaderOptions = {}): Promise<boolean> => {
  if (!(await tryAcquireLeadership(name, ttlMs, options))) return false;
  await fn();
  return true;
};
