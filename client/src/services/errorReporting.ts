/**
 * @fileoverview Client-side Error Reporting Service
 *
 * Captures unhandled errors, React boundary crashes, and custom events.
 * Reports via POST /api/client-errors when available, and logs to
 * console in development. Designed as a drop-in for future Sentry migration.
 *
 * BREADCRUMB SYSTEM:
 * Maintains a rolling buffer of recent user actions (navigation, clicks,
 * console logs). These breadcrumbs are attached to error reports to help
 * developers reproduce the steps leading to an error.
 *
 * ARCHITECTURE:
 * - install(): Registers global error listeners (called once on app mount)
 * - report(): Sends error to server (best-effort, non-blocking)
 * - addBreadcrumb(): Records user actions for context
 *
 * @module services/errorReporting
 */

// Defines the payload structure dispatched when reporting client exceptions.
// Aggregates stack traces, runtime metadata, session IDs, and active breadcrumbs.
// Transmitted to the server-side telemetry endpoint for diagnostic analysis.
interface ErrorReport {
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  timestamp: string;
  userAgent: string;
  sessionId: string;
  breadcrumbs: Breadcrumb[];
}

// Represents a discrete user interaction or telemetry event recorded in session.
// Captures category types such as navigation changes, clicks, and console events.
// Attached to subsequent error reports to supply chronological reproduction context.
interface Breadcrumb {
  type: "navigation" | "click" | "console" | "custom";
  message: string;
  timestamp: string;
}

// ─── Session ID ─────────────────────────────────────────

// Unique pseudo-random identifier generated per browser session lifetime.
// Distinguishes independent user visits across client error report logs.
// Constructed by combining timestamps with randomized base-36 substrings.
const SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ─── Breadcrumb Buffer ──────────────────────────────────

// Maximum quantity of breadcrumb interaction records retained in memory.
// Prevents unbounded memory growth by restricting the rolling event buffer.
// Oldest interaction breadcrumbs are evicted when buffer capacity is exceeded.
const MAX_BREADCRUMBS = 30;
const breadcrumbs: Breadcrumb[] = [];

// Appends a new user interaction event into the rolling breadcrumb history.
// Stamps each entry with the current ISO timestamp and event category type.
// Maintains a bounded queue by discarding the oldest item when over capacity.
function pushBreadcrumb(type: Breadcrumb["type"], message: string) {
  breadcrumbs.push({
    type,
    message,
    timestamp: new Date().toISOString(),
  });
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.shift();
  }
}

// ─── Report ─────────────────────────────────────────────

// Gathers browser error context and transmits telemetry to the backend.
// Outputs diagnostic traces to the local development console when active.
// Issues a non-blocking keepalive POST request that ignores transient network failures.
async function report(error: Error, componentStack?: string) {
  const payload: ErrorReport = {
    message: error.message,
    stack: error.stack,
    componentStack,
    url: window.location.href,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    sessionId: SESSION_ID,
    breadcrumbs: [...breadcrumbs],
  };

  // Log locally in dev
  if (import.meta.env.DEV) {
    console.group("🐛 Error Report");
    console.error(error);
    if (componentStack) console.log("Component Stack:", componentStack);
    console.log("Breadcrumbs:", payload.breadcrumbs);
    console.groupEnd();
  }

  // Best-effort server report (non-blocking, swallow errors)
  try {
    await fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
      keepalive: true,
    });
  } catch {
    // Failed to report — that's okay, don't cascade
  }
}

// ─── Global listeners ───────────────────────────────────

// Binds global browser error listeners and DOM event tracking handlers.
// Intercepts unhandled promise rejections, window errors, clicks, and routing.
// Populates chronological diagnostic trails leading up to unexpected exceptions.
function install() {
  // Unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    const error =
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason || "Unhandled rejection"));
    report(error);
  });

  // Uncaught errors
  window.addEventListener("error", (event) => {
    if (event.error instanceof Error) {
      report(event.error);
    }
  });

  // Navigation breadcrumbs
  const origPushState = history.pushState.bind(history);
  history.pushState = (...args) => {
    pushBreadcrumb("navigation", `→ ${String(args[2] || "")}`);
    return origPushState(...args);
  };

  // Click breadcrumbs
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement;
      const id = target.id || target.dataset?.testid || "";
      const tag = target.tagName?.toLowerCase() || "";
      const label = target.textContent?.slice(0, 30) || "";
      pushBreadcrumb("click", `${tag}${id ? `#${id}` : ""} "${label}"`);
    },
    { capture: true, passive: true }
  );
}

// ─── Public API ─────────────────────────────────────────

// Public client error monitoring API exposed for application consumption.
// Packages initialization routines, error dispatchers, and breadcrumb loggers.
// Enables modular integration with UI error boundaries and instrumentation.
export const errorReporting = {
  install,
  report,
  addBreadcrumb: pushBreadcrumb,
};
