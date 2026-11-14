/**
 * Shared express-rate-limit store backed by Redis (rate-limit-redis) with an
 * in-memory fallback.
 *
 * With several gateway replicas a per-process counter multiplies the effective
 * limit by the replica count, so counters live in Redis. Redis is never a hard
 * dependency: when it is not configured the plain in-memory store is used, and
 * when it fails at runtime the {@link ResilientRateLimitStore} wrapper logs an
 * alert and keeps counting locally until Redis answers again.
 *
 * @module config/rateLimitStore
 */
import type { ClientRateLimitInfo, IncrementResponse, Options, Store } from "express-rate-limit";
import { MemoryStore } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import type Redis from "ioredis";
import { getRedis } from "./redis";
import { logger } from "./logger";

export type RateLimitRedisClient = Pick<Redis, "call">;

export type ResilientStoreOptions = {
  /** Label used in alerts. */
  name: string;
  /** After a Redis failure, stay on the local store for this long before probing Redis again. */
  cooldownMs?: number;
  /** A Redis command slower than this counts as a failure (keeps request latency bounded). */
  commandTimeoutMs?: number;
  now?: () => number;
};

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`rate-limit store timeout after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

/**
 * Wraps a shared (Redis) store and falls back to a local MemoryStore when the
 * shared store errors or times out. The failure is logged once per outage as an
 * alert, and recovery is logged when the shared store answers again.
 */
export class ResilientRateLimitStore implements Store {
  localKeys = false;
  prefix?: string;

  private readonly local = new MemoryStore();
  private degradedUntil = 0;
  private degraded = false;
  private readonly cooldownMs: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(
    private readonly shared: Store,
    private readonly opts: ResilientStoreOptions,
  ) {
    this.cooldownMs = opts.cooldownMs ?? 10_000;
    this.timeoutMs = opts.commandTimeoutMs ?? 250;
    this.now = opts.now ?? Date.now;
    this.prefix = shared.prefix;
  }

  /** True while the local fallback is serving requests. */
  get isDegraded() {
    return this.degraded;
  }

  init(options: Options) {
    this.local.init(options);
    this.shared.init?.(options);
  }

  private async run<T>(op: string, sharedCall: () => Promise<T>, localCall: () => Promise<T> | T): Promise<T> {
    if (this.now() < this.degradedUntil) {
      return localCall();
    }
    try {
      const result = await withTimeout(sharedCall(), this.timeoutMs);
      if (this.degraded) {
        this.degraded = false;
        logger.info({ event: "rate_limit_store_recovered", store: this.opts.name }, "Rate-limit store recovered; using Redis again");
      }
      return result;
    } catch (err) {
      this.degradedUntil = this.now() + this.cooldownMs;
      if (!this.degraded) {
        this.degraded = true;
        logger.error(
          { event: "rate_limit_store_fallback", alert: true, store: this.opts.name, op, err: (err as Error)?.message },
          "ALERT: Redis rate-limit store unavailable; falling back to per-process in-memory counters (limits are no longer shared across replicas)",
        );
      }
      return localCall();
    }
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    return this.run("get", () => Promise.resolve(this.shared.get!(key)), () => this.local.get(key));
  }

  async increment(key: string): Promise<IncrementResponse> {
    return this.run("increment", () => Promise.resolve(this.shared.increment(key)), () => this.local.increment(key));
  }

  async decrement(key: string): Promise<void> {
    await this.run("decrement", () => Promise.resolve(this.shared.decrement(key)), () => this.local.decrement(key));
  }

  async resetKey(key: string): Promise<void> {
    await this.run("resetKey", () => Promise.resolve(this.shared.resetKey(key)), () => this.local.resetKey(key));
  }

  shutdown() {
    this.local.shutdown();
  }
}

/**
 * Builds a rate-limit store for the given key prefix.
 *
 * - Returns `undefined` (express-rate-limit then uses its default in-memory
 *   store) when Redis is not configured, so tests and local dev need no Redis.
 * - Otherwise returns a Redis-backed store wrapped with an in-memory fallback.
 *
 * `client` is injectable for tests.
 */
export const createRateLimitStore = (
  prefix: string,
  options: { client?: RateLimitRedisClient | null; cooldownMs?: number; commandTimeoutMs?: number; now?: () => number } = {},
): Store | undefined => {
  const client = options.client === undefined ? getRedis() : options.client;
  if (!client) {
    logger.warn(
      { event: "rate_limit_store_memory", prefix },
      "Redis not configured: rate limits are per-process (set REDIS_URL for limits shared across replicas)",
    );
    return undefined;
  }

  const redisStore = new RedisStore({
    prefix,
    sendCommand: (...args: string[]) =>
      (client as Redis).call(args[0]!, ...args.slice(1)) as Promise<boolean | number | string | (boolean | number | string)[]>,
  });
  // The script SHAs load eagerly in the RedisStore constructor; if Redis is down
  // those promises reject with no awaiter. The resilient wrapper handles the
  // outage on the first real command, so silence the unhandled rejection.
  redisStore.incrementScriptSha.catch(() => undefined);
  redisStore.getScriptSha.catch(() => undefined);

  return new ResilientRateLimitStore(redisStore, {
    name: prefix,
    cooldownMs: options.cooldownMs,
    commandTimeoutMs: options.commandTimeoutMs,
    now: options.now,
  });
};
