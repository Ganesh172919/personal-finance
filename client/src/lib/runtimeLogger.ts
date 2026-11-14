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

// Enumerates supported log severity levels for client-side diagnostic outputs.
// Establishes filtering hierarchy across debug, info, warning, and error messages.
// Enforces type safety when passing severity arguments to internal logging emitters.
type LogLevel = "debug" | "info" | "warn" | "error";

const isDev = import.meta.env.DEV;

// Maps log severity levels to hex color strings for stylized console rendering.
// Provides visual distinction between neutral messages, warnings, and error traces.
// Formats browser devtool console statements with clear aesthetic hierarchy.
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

// Evaluates whether a given log level meets configured environment thresholds.
// Completely disables logging execution when operating inside production builds.
// Compares message severity against the configured minimum threshold ranking.
/** Check if a log level meets the minimum threshold */
const shouldLog = (level: LogLevel): boolean => {
  if (!isDev) return false;
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
};

// Emits timestamped, color-coded diagnostic message logs to the browser console.
// Prepends intuitive status emojis and formatted ISO time headers to log outputs.
// Appends optional payload objects for deep object inspection in developer tools.
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

// Records unexpected client exceptions and dispatches them to error tracking hooks.
// Logs formatted error details to the local console during development workflows.
// Delegates to the browser global reportError API for telemetry ingestion when present.
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

// Emits non-fatal warning messages and diagnostic metadata to the console.
// Alerts developers to non-critical anomalies, depreciations, and unexpected states.
// Silently suppresses output when running in production to avoid console clutter.
/** Report a client warning (dev-only console output) */
export const reportClientWarning = (message: string, details?: unknown) => {
  emitConsole("warn", message, details);
};

// Logs informational operational milestones and system events during development.
// Useful for tracking high-level lifecycle transitions and successful API flows.
// Automatically gated by environment checks to eliminate production console noise.
/** Log an informational message (dev-only) */
export const reportClientInfo = (message: string, data?: unknown) => {
  emitConsole("info", message, data);
};

// Emits detailed trace statements and debug state dumps for fine-grained analysis.
// Suppressed unless the minimum logging threshold is configured to debug level.
// Assists in diagnosing intricate timing bugs, cache operations, and state shifts.
/** Log a debug message (dev-only, suppressed by default in production) */
export const reportClientDebug = (message: string, data?: unknown) => {
  emitConsole("debug", message, data);
};
