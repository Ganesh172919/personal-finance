/**
 * @fileoverview Runtime Logger (Development-only)
 *
 * Lightweight logging utility that only emits logs in development mode.
 * In production, logs are suppressed to avoid console noise and potential
 * information leakage.
 *
 * WHY NOT USE console.log DIRECTLY?
 * - Development-only: Prevents sensitive data from appearing in production consoles
 * - Consistent format: All logs follow the same pattern with color coding
 * - Log levels: debug, info, warn, error with configurable threshold
 * - Breadcrumb integration: Logs are automatically added to error breadcrumbs
 * - reportClientError: Integrates with the browser's `reportError` API
 *
 * @module lib/runtimeLogger
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const isDev = import.meta.env.DEV;

/** Color codes for each log level (ANSI-compatible for dev tools) */
const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "#6b7280", // gray
  info: "#3b82f6",  // blue
  warn: "#f59e0b",  // amber
  error: "#ef4444", // red
};

const LEVEL_ICONS: Record<LogLevel, string> = {
  debug: "🔍",
  info: "ℹ️",
  warn: "⚠️",
  error: "❌",
};

/** Minimum log level (can be overridden via VITE_LOG_LEVEL) */
const MIN_LEVEL: LogLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel) || "debug";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Check if a log level meets the minimum threshold */
const shouldLog = (level: LogLevel): boolean => {
  if (!isDev) return false;
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
};

/** Emit formatted log to console */
const emitConsole = (level: LogLevel, message: string, payload?: unknown) => {
  if (!shouldLog(level)) return;

  const icon = LEVEL_ICONS[level];
  const color = LEVEL_COLORS[level];
  const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
  const prefix = `${icon} [${timestamp}]`;

  if (payload === undefined) {
    console.log(`%c${prefix} ${message}`, `color: ${color}; font-weight: bold`);
    return;
  }

  console.log(`%c${prefix} ${message}`, `color: ${color}; font-weight: bold`, payload);
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

/** Log an informational message (dev-only) */
export const reportClientInfo = (message: string, data?: unknown) => {
  emitConsole("info", message, data);
};

/** Log a debug message (dev-only, suppressed by default in production) */
export const reportClientDebug = (message: string, data?: unknown) => {
  emitConsole("debug", message, data);
};
