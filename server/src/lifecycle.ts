import type { Server } from "node:http";

/**
 * Process lifecycle state shared between the HTTP app and the process entry
 * point. Deliberately dependency-free so `app.ts` can read it without importing
 * `server.ts` (which starts the whole process on import).
 */

let draining = false;

/** Called at the start of graceful shutdown. `/readyz` then reports 503 so load balancers stop routing here. */
// Transitions the process lifecycle state into draining shutdown mode.
// Causes readiness probe endpoint /readyz to return 503 Service Unavailable.
// Signals upstream reverse proxies and load balancers to cease traffic routing.
export const markShuttingDown = () => {
  draining = true;
};

// Returns current process lifecycle status indicating whether shutdown is in progress.
// Read by health check controllers and connection handlers to gate new work.
// Yields boolean true once shutdown has been initiated.
export const isShuttingDown = () => draining;

/** Test helper. */
// Resets internal lifecycle draining state back to normal running mode.
// Used exclusively in automated unit and integration tests between test suites.
// Ensures state isolation across successive simulated test runs.
export const resetLifecycleForTests = () => {
  draining = false;
};

// ── HTTP server timeouts ────────────────────────────────────────────────
//
// Load balancers (ALB 60 s, nginx keepalive_timeout, etc.) reuse idle
// connections. If Node closes an idle keep-alive socket first (its default is
// 5 s) the balancer sends a request on a dead socket and returns 502. So:
//   keepAliveTimeout  must exceed the balancer's idle timeout,
//   headersTimeout    must exceed keepAliveTimeout (Node's idle-socket check
//                     uses it, so a smaller value still closes idle sockets),
//   requestTimeout    must be >= headersTimeout (Node rejects the reverse).
// Recommended socket timeout constants tuned for modern reverse proxies and load balancers.
// Sets keepAliveTimeout to 65 seconds exceeding standard ALB 60-second idle ceilings.
// Enforces headersTimeout at 66 seconds and requestTimeout at 120 seconds.
export const SERVER_TIMEOUTS = {
  keepAliveTimeoutMs: 65_000,
  headersTimeoutMs: 66_000,
  requestTimeoutMs: 120_000,
} as const;

// Applies hardened HTTP socket timeouts to an active Node.js HTTP server instance.
// Overwrites default 5-second socket idle thresholds with enterprise-grade timeouts.
// Prevents 502 Bad Gateway errors caused by premature keep-alive connection closures.
export const applyServerTimeouts = (server: Pick<Server, "keepAliveTimeout" | "headersTimeout" | "requestTimeout">) => {
  server.keepAliveTimeout = SERVER_TIMEOUTS.keepAliveTimeoutMs;
  server.headersTimeout = SERVER_TIMEOUTS.headersTimeoutMs;
  server.requestTimeout = SERVER_TIMEOUTS.requestTimeoutMs;
};

// ── Graceful shutdown tuning ────────────────────────────────────────────

// Configuration object governing graceful shutdown pacing and safety timeout ceilings.
// Specifies balancer drain delay window and maximum hard ceiling for process exit.
// Used to align application shutdown behavior with orchestrator container lifecycles.
export type ShutdownConfig = {
  /** How long to keep serving (with /readyz failing) before closing the listener, so the balancer notices. */
  drainMs: number;
  /** Hard ceiling for the whole shutdown; long enough for in-flight AI calls (45 s upstream timeout). */
  forceExitMs: number;
};

// Safely parses a millisecond string representation into a non-negative integer.
// Falls back to supplied default number if raw string is undefined, empty, or invalid.
// Guarantees reliable numerical timeout parameters regardless of input formatting.
const parseMs = (raw: string | undefined, fallback: number) => {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
};

/**
 * Production defaults: 5 s drain, 60 s ceiling. Elsewhere (dev/test) shutdown
 * stays fast: no drain, 15 s ceiling. Both can be overridden via
 * SHUTDOWN_DRAIN_MS / SHUTDOWN_TIMEOUT_MS. The container runtime's stop grace
 * period (compose `stop_grace_period`, k8s `terminationGracePeriodSeconds`)
 * must be longer than `drainMs + forceExitMs`'s practical use or it will
 * SIGKILL first.
 */
// Computes graceful shutdown timing configurations based on environment settings.
// Applies 5-second drain and 60-second force-exit in production to allow in-flight completion.
// Defaults to instant drain and 15-second ceiling in development and testing environments.
export const resolveShutdownConfig = (env: Record<string, string | undefined>): ShutdownConfig => {
  const production = (env.NODE_ENV || "").toLowerCase() === "production";
  return {
    drainMs: parseMs(env.SHUTDOWN_DRAIN_MS, production ? 5_000 : 0),
    forceExitMs: parseMs(env.SHUTDOWN_TIMEOUT_MS, production ? 60_000 : 15_000),
  };
};
