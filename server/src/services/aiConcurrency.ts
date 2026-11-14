/**
 * AI admission control for the gateway: bounded concurrency, a bounded priority
 * queue, and explicit load shedding.
 *
 * Limits (env):
 *  - AI_MAX_CONCURRENCY (alias: AI_CORE_MAX_CONCURRENCY) global in-flight AI work
 *  - AI_CORE_MAX_CONCURRENCY_PER_USER                   in-flight per user
 *  - AI_QUEUE_MAX                                        total waiting requests
 *  - AI_QUEUE_MAX_PER_USER                               waiting requests per user
 *  - AI_QUEUE_MAX_WAIT_MS                                longest a request may wait
 *
 * Behaviour when saturated:
 *  - Work waits in one of three priority lanes: chat > autopilot > batch
 *    (newsletter and other background work belong in `batch`).
 *  - A full queue sheds with 503 + Retry-After. A higher-priority arrival evicts
 *    the newest waiter of a lower lane instead of being shed itself.
 *  - One user flooding the queue is shed with 429 + Retry-After (user_queue_full)
 *    before they can crowd out everyone else.
 *  - A request that waits longer than AI_QUEUE_MAX_WAIT_MS is shed with 503.
 *  - `AiCapacityError` extends HttpError and carries `retryAfterSeconds`; the
 *    global error handler turns it into a `Retry-After` header.
 *
 * Gauges (prom-client, via observability/metrics): queue depth per lane,
 * in-flight work and a shed counter by reason.
 *
 * @module services/aiConcurrency
 */
import { getEnv } from "../config/env";
import { HttpError } from "../middleware/httpError";
import { recordAiShed, setAiQueueGauges } from "../observability/metrics";

// Identifies scheduling priority lanes for incoming artificial intelligence requests.
// Distinguishes between interactive chat sessions, autonomous copilots, and batch tasks.
// Used by the admission controller to prioritize interactive user traffic.
export type AiPriority = "chat" | "autopilot" | "batch";
// Ordered priority levels ranging from highest priority to background batch jobs.
// Governs request queue positioning and determines eviction order during saturation.
// Read by scheduler routines when scanning queued items for execution slots.
/** Highest priority first. */
export const AI_PRIORITIES: readonly AiPriority[] = ["chat", "autopilot", "batch"];

// Enumerates specific triggers that cause an AI request to be dropped or shed.
// Tracks load shedding due to full queues, wait timeouts, user flood, or aborts.
// Passed to telemetry metrics and capacity error objects for diagnostic monitoring.
export type AiShedReason = "queue_full" | "queue_timeout" | "user_queue_full" | "evicted" | "aborted";

// Configuration threshold parameters governing global and per-user AI concurrency.
// Defines maximum parallel executions, waiting queue limits, and timeout thresholds.
// Sourced from environment configuration to dynamically regulate gateway capacity.
export type AiLimits = {
  maxConcurrency: number;
  maxPerUser: number;
  queueMax: number;
  queueMaxPerUser: number;
  maxWaitMs: number;
};

// Custom HTTP exception thrown when an AI request cannot be queued or executed.
// Carries a Retry-After second recommendation and diagnostic shedding reasons.
// Handled by downstream API middleware to return standard HTTP 429 or 503 responses.
/** Raised when AI work is shed instead of queued. Always carries a Retry-After hint. */
export class AiCapacityError extends HttpError {
  readonly retryAfterSeconds: number;
  readonly reason: AiShedReason;
  readonly lane: AiPriority;

  constructor(params: { reason: AiShedReason; lane: AiPriority; retryAfterSeconds: number }) {
    const perUser = params.reason === "user_queue_full";
    super(
      perUser ? 429 : 503,
      perUser ? "AI_USER_BUSY" : "AI_CAPACITY",
      perUser
        ? "You have too many AI requests waiting. Please retry shortly."
        : "AI capacity is temporarily full. Please retry shortly.",
      { reason: params.reason, retryAfterSeconds: params.retryAfterSeconds },
    );
    this.retryAfterSeconds = params.retryAfterSeconds;
    this.reason = params.reason;
    this.lane = params.lane;
  }
}

// Type guard helper that verifies whether an unknown error is an AiCapacityError.
// Inspects instance prototype inheritance against the AiCapacityError class.
// Facilitates strongly typed error handling in route wrappers and middleware.
export const isAiCapacityError = (error: unknown): error is AiCapacityError => error instanceof AiCapacityError;

// Represents a queued request waiting for an available AI execution concurrency slot.
// Tracks user identity, priority lane, wait timer handle, and promise resolvers.
// Supports cancellation via AbortSignal listeners to avoid executing dropped calls.
type Waiter = {
  userId?: string;
  lane: AiPriority;
  settled: boolean;
  timer: NodeJS.Timeout;
  resolve: (release: () => void) => void;
  reject: (error: unknown) => void;
  detachAbort?: () => void;
};

const SERVICE_TIME_EWMA = 0.2;
const RETRY_AFTER_MIN_S = 1;
const RETRY_AFTER_MAX_S = 30;

// Priority scheduler and admission controller managing bounded AI request capacity.
// Maintains multi-lane priority queues, per-user limits, and exponential moving averages.
// Automatically sheds excess load and evicts lower-priority tasks when overloaded.
export class AiScheduler {
  private inFlight = 0;
  private readonly activeByUser = new Map<string, number>();
  private readonly queues: Record<AiPriority, Waiter[]> = { chat: [], autopilot: [], batch: [] };
  private readonly queuedByUser = new Map<string, number>();
  private avgServiceMs = 5000;

  constructor(private readonly readLimits: () => AiLimits) {}

  get stats() {
    return {
      inFlight: this.inFlight,
      queued: this.queuedTotal(),
      queuedByLane: {
        chat: this.queues.chat.length,
        autopilot: this.queues.autopilot.length,
        batch: this.queues.batch.length,
      },
      avgServiceMs: Math.round(this.avgServiceMs),
    };
  }

  private queuedTotal() {
    return this.queues.chat.length + this.queues.autopilot.length + this.queues.batch.length;
  }

  private publishGauges() {
    try {
      setAiQueueGauges({
        inFlight: this.inFlight,
        queued: {
          chat: this.queues.chat.length,
          autopilot: this.queues.autopilot.length,
          batch: this.queues.batch.length,
        },
      });
    } catch {
      // metrics must never affect admission control
    }
  }

  private retryAfterSeconds(limits: AiLimits) {
    const waiting = this.queuedTotal() + 1;
    const estimate = Math.ceil((waiting * this.avgServiceMs) / Math.max(1, limits.maxConcurrency) / 1000);
    return Math.min(RETRY_AFTER_MAX_S, Math.max(RETRY_AFTER_MIN_S, estimate));
  }

  private shed(lane: AiPriority, reason: AiShedReason, limits: AiLimits) {
    try {
      recordAiShed({ lane, reason });
    } catch {
      // ignore
    }
    return new AiCapacityError({ reason, lane, retryAfterSeconds: this.retryAfterSeconds(limits) });
  }

  private canStart(userId: string | undefined, limits: AiLimits) {
    if (this.inFlight >= limits.maxConcurrency) return false;
    if (userId && (this.activeByUser.get(userId) ?? 0) >= limits.maxPerUser) return false;
    return true;
  }

  private start(userId: string | undefined): () => void {
    this.inFlight += 1;
    if (userId) this.activeByUser.set(userId, (this.activeByUser.get(userId) ?? 0) + 1);
    const startedAt = Date.now();
    let released = false;
    this.publishGauges();

    return () => {
      if (released) return;
      released = true;
      this.inFlight -= 1;
      if (userId) {
        const remaining = (this.activeByUser.get(userId) ?? 1) - 1;
        if (remaining <= 0) this.activeByUser.delete(userId);
        else this.activeByUser.set(userId, remaining);
      }
      const elapsed = Date.now() - startedAt;
      this.avgServiceMs = this.avgServiceMs * (1 - SERVICE_TIME_EWMA) + elapsed * SERVICE_TIME_EWMA;
      this.pump();
      this.publishGauges();
    };
  }

  private removeWaiter(waiter: Waiter) {
    const queue = this.queues[waiter.lane];
    const index = queue.indexOf(waiter);
    if (index >= 0) queue.splice(index, 1);
    if (waiter.userId) {
      const remaining = (this.queuedByUser.get(waiter.userId) ?? 1) - 1;
      if (remaining <= 0) this.queuedByUser.delete(waiter.userId);
      else this.queuedByUser.set(waiter.userId, remaining);
    }
    clearTimeout(waiter.timer);
    waiter.detachAbort?.();
  }

  /** Starts as many waiters as capacity allows, strictly by lane priority then FIFO. */
  private pump() {
    const limits = this.readLimits();
    let progressed = true;
    while (progressed && this.inFlight < limits.maxConcurrency) {
      progressed = false;
      for (const lane of AI_PRIORITIES) {
        const waiter = this.queues[lane].find((candidate) => this.canStart(candidate.userId, limits));
        if (!waiter) continue;
        this.removeWaiter(waiter);
        waiter.settled = true;
        waiter.resolve(this.start(waiter.userId));
        progressed = true;
        break;
      }
    }
    this.publishGauges();
  }

  /** Evicts the newest waiter in the lowest lane that ranks below `lane`. Returns true if one was evicted. */
  private evictBelow(lane: AiPriority, limits: AiLimits) {
    const rank = AI_PRIORITIES.indexOf(lane);
    for (let i = AI_PRIORITIES.length - 1; i > rank; i -= 1) {
      const victimLane = AI_PRIORITIES[i]!;
      const victim = this.queues[victimLane][this.queues[victimLane].length - 1];
      if (!victim) continue;
      this.removeWaiter(victim);
      victim.settled = true;
      victim.reject(this.shed(victimLane, "evicted", limits));
      return true;
    }
    return false;
  }

  /**
   * Acquires a slot. Resolves with an idempotent `release`. Rejects with
   * {@link AiCapacityError} when the request is shed.
   */
  acquire(params: { userId?: string; priority?: AiPriority; signal?: AbortSignal } = {}): Promise<() => void> {
    const limits = this.readLimits();
    const lane: AiPriority = params.priority ?? "chat";
    const { userId } = params;

    if (params.signal?.aborted) {
      return Promise.reject(new AiCapacityError({ reason: "aborted", lane, retryAfterSeconds: RETRY_AFTER_MIN_S }));
    }

    // Invariant: every queued waiter is blocked (global full or its user at cap), so a request that
    // can start now never has to jump anyone.
    if (this.canStart(userId, limits)) {
      return Promise.resolve(this.start(userId));
    }

    if (userId && (this.queuedByUser.get(userId) ?? 0) >= limits.queueMaxPerUser) {
      return Promise.reject(this.shed(lane, "user_queue_full", limits));
    }
    if (this.queuedTotal() >= limits.queueMax && !this.evictBelow(lane, limits)) {
      return Promise.reject(this.shed(lane, "queue_full", limits));
    }

    return new Promise<() => void>((resolve, reject) => {
      const waiter: Waiter = {
        userId,
        lane,
        settled: false,
        resolve,
        reject,
        timer: setTimeout(() => {
          if (waiter.settled) return;
          this.removeWaiter(waiter);
          waiter.settled = true;
          reject(this.shed(lane, "queue_timeout", this.readLimits()));
          this.publishGauges();
        }, limits.maxWaitMs),
      };
      waiter.timer.unref?.();

      if (params.signal) {
        const onAbort = () => {
          if (waiter.settled) return;
          this.removeWaiter(waiter);
          waiter.settled = true;
          reject(new AiCapacityError({ reason: "aborted", lane, retryAfterSeconds: RETRY_AFTER_MIN_S }));
          this.publishGauges();
        };
        params.signal.addEventListener("abort", onAbort, { once: true });
        waiter.detachAbort = () => params.signal?.removeEventListener("abort", onAbort);
      }

      this.queues[lane].push(waiter);
      if (userId) this.queuedByUser.set(userId, (this.queuedByUser.get(userId) ?? 0) + 1);
      this.publishGauges();
    });
  }
}

// Reads concurrency thresholds, per-user limits, and queue timeouts from the environment.
// Evaluated dynamically on each check so operational limit changes take effect immediately.
// Returns an AiLimits object populated with configured numbers or safe system defaults.
/** Reads limits from env on every call so env changes (and tests) take effect immediately. */
export const readAiLimits = (): AiLimits => {
  const env = getEnv() as Partial<ReturnType<typeof getEnv>>;
  return {
    maxConcurrency: env.AI_MAX_CONCURRENCY ?? env.AI_CORE_MAX_CONCURRENCY ?? 8,
    maxPerUser: env.AI_CORE_MAX_CONCURRENCY_PER_USER ?? 2,
    queueMax: env.AI_QUEUE_MAX ?? 50,
    queueMaxPerUser: env.AI_QUEUE_MAX_PER_USER ?? 6,
    maxWaitMs: env.AI_QUEUE_MAX_WAIT_MS ?? 15_000,
  };
};

// Shared singleton AI scheduler instance managing global admission control.
// Enforces concurrent slot allocations using real-time dynamic environment limits.
// Utilized by controllers and background workers to throttle AI operations.
const scheduler = new AiScheduler(readAiLimits);

// Returns current operational telemetry for the process-wide AI admission controller.
// Exposes in-flight request counts, per-lane queue lengths, and rolling service times.
// Used by system health endpoints, admin dashboards, and integration tests.
/** Snapshot of the process-wide AI admission controller (for status endpoints and tests). */
export const getAiConcurrencyStats = () => scheduler.stats;

// Executes an asynchronous AI task within the bounds of global and user concurrency limits.
// Automatically acquires an execution slot, awaits completion, and releases the slot.
// Rejects with an AiCapacityError if the request cannot be admitted or timed out in queue.
/**
 * Runs `task` once a slot is available. Rejects with {@link AiCapacityError} if the request is shed.
 * `priority` selects the lane (default "chat").
 */
export const runWithAiCoreConcurrency = async <T>(params: {
  userId?: string;
  priority?: AiPriority;
  signal?: AbortSignal;
  task: () => Promise<T>;
}): Promise<T> => {
  const release = await scheduler.acquire({ userId: params.userId, priority: params.priority, signal: params.signal });
  try {
    return await params.task();
  } finally {
    release();
  }
};

// Directly acquires an execution slot for streaming or long-lived AI operations.
// Returns a release callback that must be invoked upon completion or client disconnect.
// Guarantees proper slot accounting across chunked Server-Sent Events transfers.
/**
 * Acquires a per-user + global AI slot and holds it until the returned
 * `release` function is called. Use this for long-lived work such as an SSE
 * stream, where the slot must cover the whole stream rather than a single
 * promise-returning task. `release` is idempotent, so it is safe to call from
 * both a normal-completion path and a disconnect handler.
 */
export const acquireAiCoreSlot = (params: {
  userId?: string;
  priority?: AiPriority;
  signal?: AbortSignal;
}): Promise<() => void> => scheduler.acquire(params);
