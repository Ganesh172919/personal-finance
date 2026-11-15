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


const isDev = import.meta.env.DEV;

// ─── Network Request Logger ─────────────────────────────

// Models recorded HTTP request telemetry metadata captured during development.
// Captures HTTP methods, endpoint URLs, status codes, latency, and response sizes.
// Feeds the in-memory circular network logging ring buffer for inspection.
interface RequestLog {
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  size?: string;
}

const requestBuffer: RequestLog[] = [];
const MAX_REQUEST_LOGS = 100;

// Records and color-codes outgoing network request results within browser consoles.
// Appends telemetry entries to an in-memory buffer while evicting oldest records.
// Formats status codes with intuitive alert styling to ease runtime troubleshooting.
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

// Patches the global window.fetch function to record network timings and statuses.
// Intercepts outgoing requests, measures latency, and records audit breadcrumbs.
// Automatically operates as a no-op when running inside production build environments.
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

      return response;
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      logRequest({ method, url, status: 0, durationMs });
      throw error;
    }
  };
}

// ─── Performance Helpers ─────────────────────────────────

// Creates an initial high-resolution performance timestamp mark for profiling.
// Uses the browser Performance API to tag the start of a named operation.
// Skips execution cleanly in production environments to minimize runtime overhead.
/**
 * Start a named performance measurement.
 * Call `endPerfMark(name)` to log the duration.
 */
export function startPerfMark(name: string) {
  if (!isDev) return;
  performance.mark(`${name}:start`);
}

// Measures the elapsed time between start and end performance marks and outputs logs.
// Evaluates operation duration against color-coded performance threshold limits.
// Automatically cleans up registered performance marks and measures after reporting.
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

// Converts raw integer byte counts into formatted human-readable file size strings.
// Calculates logarithmically scaled units ranging across bytes, kilobytes, and megabytes.
// Provides standardized size representations for network and document logging.
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Retrieves an immutable snapshot copy of all buffered network request log entries.
// Provides developer tools and test assertions access to recent HTTP interactions.
// Shields the internal circular buffer array from external mutating modifications.
/**
 * Get the request log buffer (useful for debugging).
 */
export function getRequestLogs(): ReadonlyArray<RequestLog> {
  return [...requestBuffer];
}

// Resets the circular network request log buffer by truncating stored entries.
// Clears historical request records to isolate subsequent diagnostic test runs.
// Prevents memory accumulation during extended local development testing sessions.
/**
 * Clear the request log buffer.
 */
export function clearRequestLogs() {
  requestBuffer.length = 0;
}
