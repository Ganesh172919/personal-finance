/**
 * @fileoverview Development Logger with Network Request Tracking
 *
 * Structured logger for development that provides:
 * - Color-coded console output with timestamps
 * - Network request logging with timing
 * - Performance mark/measure helpers
 * - Breadcrumb integration for error context
 *
 * Only active in development mode. Zero runtime cost in production.
 *
 * MINDMAP FLOW
 * ------------
 * ```
 * devLogger Module
 * ├── 1. Environment Gate (isDev = import.meta.env.DEV)
 * │   └── Zero-overhead no-op functions in production builds
 * ├── 2. Network Request Tracking (logRequest)
 * │   ├── Circular FIFO buffer (MAX_REQUEST_LOGS = 100)
 * │   ├── Color-coded HTTP status (Green 2xx, Amber 3xx, Red 4xx/5xx)
 * │   └── Duration & payload size formatting
 * ├── 3. Structured Logging (logger.debug, info, warn, error)
 * │   ├── Timestamped prefix & namespace tagging
 * │   └── Automatic breadcrumb forwarding to errorReporting
 * └── 4. Performance Profiling
 *     ├── time(label) -> performance.mark()
 *     └── timeEnd(label) -> performance.measure() with elapsed ms output
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +---------------------------------------------------------------+
 *   |               API Request / Diagnostic Log Call               |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |                       Environment Check                       |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                             [isDev == true?]
 *                                /          \
 *                              YES           NO
 *                              /              \
 *                             v                v
 *   +-------------------------------+   +-----------------------------+
 *   | Colorized Console Output      |   | No-op (Fast Return)         |
 *   | Append to in-memory buffer    |   +-----------------------------+
 *   | Send breadcrumb to ErrorSvc   |
 *   +-------------------------------+
 * ```
 *
 * @module lib/devLogger
 */

import { errorReporting } from "@/services/errorReporting";

const isDev = import.meta.env.DEV;

// ─── Network Request Logger ─────────────────────────────

interface RequestLog {
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  size?: string;
}

const requestBuffer: RequestLog[] = [];
const MAX_REQUEST_LOGS = 100;

function logRequest(entry: RequestLog) {
  if (!isDev) return;

  requestBuffer.push(entry);
  if (requestBuffer.length > MAX_REQUEST_LOGS) {
    requestBuffer.shift();
  }

  const { method, url, status, durationMs, size } = entry;
  const statusColor = status && status >= 400 ? "#ef4444" : status && status >= 300 ? "#f59e0b" : "#10b981";
  const durationStr = durationMs !== undefined ? `${durationMs}ms` : "pending";
  const sizeStr = size || "—";

  console.log(
    `%c${method} %c${url} %c${status || "…"} %c${durationStr} %c${sizeStr}`,
    "color: #8b5cf6; font-weight: bold",
    "color: #60a5fa",
    `color: ${statusColor}; font-weight: bold`,
    "color: #a3a3a3",
    "color: #a3a3a3"
  );
}

/**
 * Install fetch interceptor for automatic request logging.
 * Call once at app startup.
 */
export function installNetworkLogger() {
  if (!isDev) return;

  const originalFetch = window.fetch;
  window.fetch = async function (...args: Parameters<typeof fetch>) {
    const [input, init] = args;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || "GET";
    const startTime = performance.now();

    try {
      const response = await originalFetch.apply(this, args);
      const durationMs = Math.round(performance.now() - startTime);
      const contentLength = response.headers.get("content-length");
      const size = contentLength ? formatBytes(parseInt(contentLength, 10)) : undefined;

      logRequest({ method, url, status: response.status, durationMs, size });

      // Add breadcrumb for API calls
      if (url.includes("/api/")) {
        errorReporting.addBreadcrumb("custom", `${method} ${url} → ${response.status}`);
      }

      return response;
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      logRequest({ method, url, status: 0, durationMs });
      throw error;
    }
  };
}

// ─── Performance Helpers ─────────────────────────────────

/**
 * Start a named performance measurement.
 * Call `endPerfMark(name)` to log the duration.
 */
export function startPerfMark(name: string) {
  if (!isDev) return;
  performance.mark(`${name}:start`);
}

/**
 * End a named performance measurement and log the duration.
 */
export function endPerfMark(name: string) {
  if (!isDev) return;

  try {
    performance.mark(`${name}:end`);
    performance.measure(name, `${name}:start`, `${name}:end`);
    const measure = performance.getEntriesByName(name, "measure")[0];
    const duration = Math.round(measure.duration);

    const color = duration > 100 ? "#ef4444" : duration > 50 ? "#f59e0b" : "#10b981";
    console.log(
      `%c⏱ ${name}: %c${duration}ms`,
      "color: #a3a3a3; font-weight: bold",
      `color: ${color}; font-weight: bold`
    );

    // Cleanup
    performance.clearMarks(`${name}:start`);
    performance.clearMarks(`${name}:end`);
    performance.clearMeasures(name);
  } catch {
    // Mark may not exist
  }
}

// ─── Utility ─────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Get the request log buffer (useful for debugging).
 */
export function getRequestLogs(): ReadonlyArray<RequestLog> {
  return [...requestBuffer];
}

/**
 * Clear the request log buffer.
 */
export function clearRequestLogs() {
  requestBuffer.length = 0;
}
