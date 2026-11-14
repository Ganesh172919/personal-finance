import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { getRedis } from "../config/redis";
import { logger } from "../config/logger";
import { HttpError } from "./httpError";

/**
 * Idempotency-Key support for expensive, billable endpoints (AI calls).
 *
 * Behaviour (opt-in: a request without the header is untouched):
 *  - First request with a key runs normally; its 2xx/4xx JSON response is stored.
 *  - A retry with the same key and same body replays the stored response
 *    (header `Idempotent-Replay: true`) without re-running the work or billing again.
 *  - A retry while the first is still running gets 409 IDEMPOTENCY_IN_PROGRESS.
 *  - Reusing a key with a different body gets 422 IDEMPOTENCY_KEY_REUSED.
 *  - 5xx responses and aborted connections release the key so the client can retry.
 *  - `streaming: true` (SSE routes) cannot replay a stream, so any duplicate
 *    key gets 409 instead.
 *
 * Storage is Redis when configured (shared across replicas), otherwise an
 * in-process map (single replica only). A store failure fails open: the request
 * proceeds without idempotency protection rather than being rejected.
 */

export type IdempotencyRecord =
  | { state: "in_progress"; fingerprint: string }
  | { state: "done"; fingerprint: string; status: number; body: unknown };

export interface IdempotencyStore {
  /** Atomically claims the key. Returns false if it already exists. */
  claim(key: string, record: IdempotencyRecord, ttlSeconds: number): Promise<boolean>;
  get(key: string): Promise<IdempotencyRecord | null>;
  set(key: string, record: IdempotencyRecord, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

const KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/;
const IN_PROGRESS_TTL_SECONDS = 120; // protects against a crashed process holding the key forever
const DONE_TTL_SECONDS = 24 * 60 * 60;
const MAX_STORED_BODY_BYTES = 256 * 1024;

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, { record: IdempotencyRecord; expiresAt: number }>();

  private live(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  async claim(key: string, record: IdempotencyRecord, ttlSeconds: number) {
    if (this.live(key)) return false;
    this.entries.set(key, { record, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }

  async get(key: string) {
    return this.live(key)?.record ?? null;
  }

  async set(key: string, record: IdempotencyRecord, ttlSeconds: number) {
    this.entries.set(key, { record, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string) {
    this.entries.delete(key);
  }

  get size() {
    return this.entries.size;
  }
}

export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(private readonly redis: NonNullable<ReturnType<typeof getRedis>>) {}

  async claim(key: string, record: IdempotencyRecord, ttlSeconds: number) {
    const result = await this.redis.set(key, JSON.stringify(record), "EX", ttlSeconds, "NX");
    return result === "OK";
  }

  async get(key: string) {
    const raw = await this.redis.get(key);
    return raw ? (JSON.parse(raw) as IdempotencyRecord) : null;
  }

  async set(key: string, record: IdempotencyRecord, ttlSeconds: number) {
    await this.redis.set(key, JSON.stringify(record), "EX", ttlSeconds);
  }

  async del(key: string) {
    await this.redis.del(key);
  }
}

const fallbackStore = new MemoryIdempotencyStore();

/** Redis when configured, otherwise the in-process fallback. */
export const resolveIdempotencyStore = (): IdempotencyStore => {
  const redis = getRedis();
  return redis ? new RedisIdempotencyStore(redis) : fallbackStore;
};

const fingerprintOf = (req: Request, orgId: string) =>
  crypto
    .createHash("sha256")
    .update(`${orgId}\n${req.method}\n${req.originalUrl.split("?")[0]}\n${JSON.stringify(req.body ?? null)}`)
    .digest("hex");

export const idempotency = (
  options: { streaming?: boolean; store?: () => IdempotencyStore } = {}
) => {
  const getStore = options.store ?? resolveIdempotencyStore;

  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("idempotency-key");
    if (!header) return next();

    const userId = (req.user as { _id?: { toString(): string } } | undefined)?._id?.toString();
    if (!userId) return next(); // unauthenticated requests are not billable; nothing to protect

    if (!KEY_PATTERN.test(header)) {
      return next(
        new HttpError(400, "IDEMPOTENCY_KEY_INVALID", "Idempotency-Key must be 8-128 chars of [A-Za-z0-9_-:.]")
      );
    }

    // Use the server-resolved tenant, never a client-supplied organization header.
    // A user can belong to multiple organizations; replaying under another org
    // must not disclose the first organization's cached AI response.
    const orgId = req.org?.orgId;
    if (!orgId) {
      return next(new HttpError(403, "ORG_CONTEXT_REQUIRED", "Organization context is required"));
    }

    const store = getStore();
    const storeKey = `idem:${orgId}:${userId}:${req.method}:${req.baseUrl}${req.path}:${header}`;
    const fingerprint = fingerprintOf(req, orgId);

    let claimed: boolean;
    try {
      claimed = await store.claim(storeKey, { state: "in_progress", fingerprint }, IN_PROGRESS_TTL_SECONDS);
    } catch (error) {
      logger.warn({ err: error, requestId: req.requestId }, "idempotency store unavailable; proceeding unprotected");
      return next();
    }

    if (!claimed) {
      let existing: IdempotencyRecord | null = null;
      try {
        existing = await store.get(storeKey);
      } catch (error) {
        logger.warn({ err: error, requestId: req.requestId }, "idempotency store read failed; proceeding unprotected");
        return next();
      }

      if (existing && existing.fingerprint !== fingerprint) {
        return next(
          new HttpError(422, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used with a different request")
        );
      }
      if (!existing || existing.state === "in_progress") {
        res.setHeader("Retry-After", "2");
        return next(new HttpError(409, "IDEMPOTENCY_IN_PROGRESS", "A request with this Idempotency-Key is still running"));
      }
      if (options.streaming) {
        return next(new HttpError(409, "IDEMPOTENCY_KEY_USED", "This Idempotency-Key was already used for a stream"));
      }

      res.setHeader("Idempotent-Replay", "true");
      return res.status(existing.status).json(existing.body);
    }

    // We own the key. Capture the JSON response so a retry can replay it.
    let captured: { status: number; body: unknown } | undefined;
    if (!options.streaming) {
      const originalJson = res.json.bind(res);
      res.json = ((body: unknown) => {
        captured = { status: res.statusCode, body };
        return originalJson(body);
      }) as Response["json"];
    }

    let settled = false;
    const release = () => {
      if (settled) return;
      settled = true;
      store.del(storeKey).catch(() => undefined);
    };

    res.on("finish", () => {
      if (settled) return;
      settled = true;

      const status = res.statusCode;
      // Server errors are retryable: free the key so the client's retry re-runs.
      if (status >= 500) {
        store.del(storeKey).catch(() => undefined);
        return;
      }

      const body = captured?.body;
      const tooLarge = body !== undefined && Buffer.byteLength(JSON.stringify(body)) > MAX_STORED_BODY_BYTES;
      if (options.streaming) {
        // Nothing replayable; keep the key claimed so a duplicate is refused.
        store
          .set(storeKey, { state: "done", fingerprint, status, body: null }, DONE_TTL_SECONDS)
          .catch(() => undefined);
      } else if (!captured || tooLarge) {
        store.del(storeKey).catch(() => undefined);
      } else {
        store
          .set(storeKey, { state: "done", fingerprint, status, body }, DONE_TTL_SECONDS)
          .catch(() => undefined);
      }
    });

    // Connection dropped before a response was written: allow a retry.
    res.on("close", () => {
      if (!res.writableFinished) release();
    });

    return next();
  };
};
