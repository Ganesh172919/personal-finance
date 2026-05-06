/**
 * @fileoverview Runtime Logger (Development-only)
 *
 * Lightweight logging utility that only emits logs in development mode.
 * In production, logs are suppressed to avoid console noise and potential
 * information leakage.
 *
 * WHY NOT USE console.log DIRECTLY?
 * - Development-only: Prevents sensitive data from appearing in production consoles
 * - Consistent format: All logs follow the same pattern
 * - reportClientError: Integrates with the browser's `reportError` API for
 *   error tracking services (e.g., Sentry, Datadog) that listen for reported errors
 *
 * @module lib/runtimeLogger
 */

type LogLevel = "warn" | "error";

const isDev = import.meta.env.DEV;

/** Emit to console only in development mode */
const emitConsole = (level: LogLevel, message: string, payload?: unknown) => {
  if (!isDev) {
    return;
  }

  if (level === "warn") {
    if (payload === undefined) {
      console.warn(message);
      return;
    }
    console.warn(message, payload);
    return;
  }

  if (payload === undefined) {
    console.error(message);
    return;
  }
  console.error(message, payload);
};

/**
 * Report a client error. Logs to console in dev and reports to browser
 * error tracking (if available). Used by stores and hooks for non-fatal errors.
 */
export const reportClientError = (message: string, error?: unknown) => {
  emitConsole("error", message, error);
  try {
    // Use the browser's reportError API if available (Sentry, etc. listen for this)
    const report = (globalThis as { reportError?: (error: Error) => void }).reportError;
    if (typeof report === "function" && error instanceof Error) {
      report(error);
    }
  } catch {
    // no-op — reportError may not exist in all environments
  }
};

/** Report a client warning (dev-only console output) */
export const reportClientWarning = (message: string, details?: unknown) => {
  emitConsole("warn", message, details);
};
