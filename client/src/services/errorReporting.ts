/**
 * @fileoverview Client-side Error Reporting Service
 *
 * Captures unhandled errors, React boundary crashes, and custom events.
 * Reports via POST /api/v1/client-errors when available, and logs to
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

interface Breadcrumb {
  type: "navigation" | "click" | "console" | "custom";
  message: string;
  timestamp: string;
}

// ─── Session ID ─────────────────────────────────────────

const SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ─── Breadcrumb Buffer ──────────────────────────────────

const MAX_BREADCRUMBS = 30;
const breadcrumbs: Breadcrumb[] = [];

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
    await fetch("/api/v1/client-errors", {
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

export const errorReporting = {
  install,
  report,
  addBreadcrumb: pushBreadcrumb,
};
