/**
 * Resilience primitives for the gateway -> AI Core hop: a closed/open/half-open
 * circuit breaker, jittered backoff, Retry-After parsing, retry classification
 * and TCP connect-timeout agents. Pure and clock-injectable so they are unit
 * testable; `aiCoreClient.ts` wires them to env config and the HTTP client.
 *
 * Breaker states:
 *  - closed     requests flow; consecutive failures are counted.
 *  - open       requests are refused until `openMs` elapses.
 *  - half_open  after the cool-down exactly one probe request is let through.
 *               Success closes the breaker, failure re-opens it. A probe that
 *               never reports back is considered lost after `openMs`.
 *
 * "Neutral" outcomes (the AI Core shedding load with 503 + Retry-After, or a
 * caller cancelling) neither count as failures nor close a half-open breaker:
 * an overloaded-but-alive service must not look like an outage.
 *
 * @module services/aiCoreResilience
 */
import http from "node:http";
import https from "node:https";
import { HttpError } from "../middleware/httpError";

// State machine modes representing circuit breaker operational status.
// Distinguishes normal traffic flow (closed), refusal (open), and trial probe (half_open).
// Controls whether outbound requests to the microservice are permitted or short-circuited.
export type BreakerState = "closed" | "open" | "half_open";

// Configuration threshold parameters governing circuit breaker tripping behavior.
// Sets consecutive failure thresholds before opening and cooldown durations before half-open probes.
// Read dynamically from runtime configuration to allow real-time parameter tuning.
export type BreakerConfig = { failureThreshold: number; openMs: number };

// Pure, clock-injectable state machine implementing the circuit breaker resilience pattern.
// Tracks consecutive network and infrastructure failures and manages probe request admission.
// Emits state transition notifications to update Prometheus metrics and diagnostic gauges.
export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;
  private probeInFlight = false;
  private probeStartedAt = 0;
  private stateValue: BreakerState = "closed";

  constructor(
    private readonly readConfig: () => BreakerConfig,
    private readonly now: () => number = Date.now,
    private readonly onChange?: (snapshot: ReturnType<CircuitBreaker["snapshot"]>) => void,
  ) {}

  /** Current state. An elapsed open window reads as half_open (without claiming the probe). */
  get state(): BreakerState {
    if (this.stateValue === "open" && this.now() >= this.openUntil) return "half_open";
    return this.stateValue;
  }

  snapshot() {
    return {
      state: this.state,
      consecutiveFailures: this.failures,
      openUntil: this.stateValue === "open" ? this.openUntil : 0,
    };
  }

  private notify() {
    this.onChange?.(this.snapshot());
  }

  /**
   * Asks permission to send a request. In half_open this claims the single probe
   * slot, so the caller MUST report `onSuccess`, `onFailure` or `onNeutral`.
   */
  allowRequest(): boolean {
    const current = this.state;
    if (current === "closed") return true;
    if (current === "open") return false;

    // half_open
    if (this.stateValue === "open") {
      this.stateValue = "half_open";
      this.probeInFlight = false;
    }
    const probeLost = this.probeInFlight && this.now() - this.probeStartedAt >= this.readConfig().openMs;
    if (this.probeInFlight && !probeLost) return false;
    this.probeInFlight = true;
    this.probeStartedAt = this.now();
    this.notify();
    return true;
  }

  onSuccess() {
    const changed = this.stateValue !== "closed" || this.failures !== 0;
    this.failures = 0;
    this.openUntil = 0;
    this.probeInFlight = false;
    this.stateValue = "closed";
    if (changed) this.notify();
  }

  onFailure() {
    const { failureThreshold, openMs } = this.readConfig();
    this.probeInFlight = false;
    if (this.state === "half_open") {
      // The probe failed: straight back to open.
      this.failures += 1;
      this.stateValue = "open";
      this.openUntil = this.now() + openMs;
    } else {
      this.failures += 1;
      if (this.failures >= failureThreshold) {
        this.stateValue = "open";
        this.openUntil = this.now() + openMs;
      }
    }
    this.notify();
  }

  /** Releases a claimed probe without judging the service (shed / cancelled). */
  onNeutral() {
    if (this.probeInFlight) {
      this.probeInFlight = false;
      this.notify();
    }
  }

  reset() {
    this.failures = 0;
    this.openUntil = 0;
    this.probeInFlight = false;
    this.stateValue = "closed";
    this.notify();
  }
}

/** The AI Core shed the request (503 + Retry-After) twice; surfaced to clients as 503 + Retry-After. */
// Exception indicating that AI Core has shed the incoming request due to capacity overload.
// Transmits a Retry-After second duration indicating when the caller may safely attempt retry.
// Surfaced to API clients as standard HTTP 503 Service Unavailable responses with Retry-After.
export class AiCoreOverloadedError extends HttpError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(503, "AI_CORE_OVERLOADED", "AI Core is at capacity. Please retry shortly.", { retryAfterSeconds });
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

/** The breaker is open and the caller cannot degrade to a fallback payload. */
// Exception thrown when an active circuit breaker blocks a request from proceeding.
// Indicates that the AI microservice is currently in open state and cooldown has not elapsed.
// Rejects callers with an HTTP 503 error accompanied by estimated cooldown seconds.
export class AiCoreUnavailableError extends HttpError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(503, "AI_CORE_UNAVAILABLE", "AI Core is temporarily unavailable. Please retry shortly.", { retryAfterSeconds });
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

/** Exponential backoff with equal jitter: attempt 1 -> [base/2, base], attempt 2 -> [base, 2*base], ... */
// Computes an exponential backoff retry delay enriched with equal random jitter.
// Prevents thundering herd problems when multiple failed requests retry concurrently.
// Returns an integer millisecond delay scaled exponentially by retry attempt index.
export const computeBackoffMs = (attempt: number, baseMs: number, random: () => number = Math.random): number => {
  const ceiling = baseMs * 2 ** Math.max(0, attempt - 1);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
};

/** Parses a Retry-After header (delta-seconds or HTTP date) into milliseconds, or undefined if absent/invalid. */
// Parses HTTP Retry-After headers representing either delta seconds or RFC-1123 dates.
// Converts header values into relative millisecond durations from current wall-clock time.
// Returns undefined if the header is missing, empty, or unparseable.
export const parseRetryAfterMs = (value: unknown, now: number = Date.now()): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const raw = String(Array.isArray(value) ? value[0] : value).trim();
  if (!raw) return undefined;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw) * 1000);
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
};

// Structural type defining standard Axios error fields relevant for error classification.
// Captures low-level socket error codes, response status numbers, and header dictionaries.
// Used for safe type narrowing of caught network exceptions without explicit Axios imports.
type AxiosLikeError = {
  code?: string;
  response?: { status?: number; headers?: Record<string, unknown> };
};

// Safely extracts the HTTP status code from an unknown or Axios-like error object.
// Inspects nested response properties without throwing property access exceptions.
// Returns numeric HTTP status code if present, or undefined for socket or network faults.
export const errorStatus = (error: unknown): number | undefined => (error as AxiosLikeError | undefined)?.response?.status;

/** Retry-After (ms) when the AI Core answered 503 + Retry-After, i.e. it shed the request before doing any work. */
// Extracts the Retry-After millisecond delay from an HTTP 503 Service Unavailable response.
// Confirms that the response status is exactly 503 and inspects case-insensitive headers.
// Used to identify explicit AI Core load shedding before initiating retry backoff.
export const shedRetryAfterMs = (error: unknown): number | undefined => {
  const response = (error as AxiosLikeError | undefined)?.response;
  if (response?.status !== 503) return undefined;
  const headers = response.headers ?? {};
  return parseRetryAfterMs(headers["retry-after"] ?? headers["Retry-After"]);
};

const CONNECT_ERROR_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ECONNTIMEDOUT", "EAI_AGAIN", "EPIPE", "ETIMEDOUT", "EHOSTUNREACH"]);

/**
 * Whether an idempotent call may be retried. Connection-level failures and
 * 408/502/503/504 are transient. A read timeout (axios ECONNABORTED) is NOT
 * retried: the work may still be running upstream and a retry would double load.
 */
// Determines whether an AI Core network failure can safely be retried for idempotent requests.
// Classifies transient socket errors, connect timeouts, and gateway error codes (408/502/503/504).
// Excludes read timeouts to prevent duplicating work that is still executing upstream.
export const isRetryableAiCoreError = (error: unknown): boolean => {
  const e = error as AxiosLikeError | undefined;
  const status = e?.response?.status;
  if (typeof status === "number") return status === 408 || status === 502 || status === 503 || status === 504;
  return typeof e?.code === "string" && CONNECT_ERROR_CODES.has(e.code);
};

// Wraps a Node.js HTTP/HTTPS agent to enforce strict TCP socket connection timeouts.
// Destroys connecting sockets if the handshake does not complete within specified milliseconds.
// Ensures connection hang issues abort quickly without waiting for full HTTP read timeouts.
const withConnectTimeout = <A extends http.Agent>(agent: A, ms: number, connectEvent: "connect" | "secureConnect"): A => {
  const target = agent as unknown as {
    createConnection: (options: unknown, cb?: unknown) => import("node:net").Socket;
  };
  const original = target.createConnection.bind(agent);
  target.createConnection = (options, cb) => {
    const socket = original(options, cb);
    const timer = setTimeout(() => {
      socket.destroy(Object.assign(new Error(`AI Core connect timeout after ${ms}ms`), { code: "ECONNTIMEDOUT" }));
    }, ms);
    timer.unref?.();
    const clear = () => clearTimeout(timer);
    socket.once(connectEvent, clear);
    socket.once("close", clear);
    socket.once("error", clear);
    return socket;
  };
  return agent;
};

/** Keep-alive agents that abort a TCP/TLS connect attempt after `connectTimeoutMs` (axios `timeout` is the read timeout). */
// Constructs persistent HTTP and HTTPS agents configured with aggressive connect timeouts.
// Enables connection keep-alive with LIFO scheduling and pool limits for socket reuse.
// Returns configured agents for injection into Axios client options.
export const createConnectTimeoutAgents = (connectTimeoutMs: number) => {
  const options = { keepAlive: true, timeout: 4000, scheduling: "lifo" as const, maxFreeSockets: 16 };
  return {
    httpAgent: withConnectTimeout(new http.Agent(options), connectTimeoutMs, "connect"),
    httpsAgent: withConnectTimeout(new https.Agent(options), connectTimeoutMs, "secureConnect"),
  };
};
