/**
 * @fileoverview Prometheus Metrics Collection
 *
 * This module configures Prometheus metrics for monitoring the FinWise application.
 * Prometheus is an open-source monitoring system that collects metrics as time-series data.
 *
 * HOW PROMETHEUS WORKS:
 * 1. Application exposes metrics at an HTTP endpoint (/api/metrics)
 * 2. Prometheus server periodically scrapes (polls) this endpoint
 * 3. Metrics are stored as time-series data
 * 4. Grafana dashboards visualize the metrics
 *
 * METRIC TYPES:
 * - Counter: Monotonically increasing value (e.g., total requests)
 * - Histogram: Distribution of values (e.g., request duration)
 * - Gauge: Value that can go up or down (e.g., circuit breaker state)
 *
 * METRICS COLLECTED:
 * - HTTP request duration and count (by method, path, status)
 * - AI Core request duration (by endpoint, fallback used)
 * - AI cache hit/miss rates
 * - Response cache hit/miss rates
 * - AI circuit breaker state
 * - Task lifecycle events
 * - OCR parse outcomes
 * - AI fallback responses
 * - Scenario processing duration
 * - Usage metering events
 *
 * PATH NORMALIZATION:
 * Dynamic path segments (MongoDB ObjectIds, numbers) are replaced with
 * placeholders (:id, :num) to prevent high cardinality in metric labels.
 * Without this, each unique URL would create a separate time series.
 *
 * @module observability/metrics
 */

import type { RequestHandler } from "express";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { getEnv } from "../config/env";

// Create a custom Prometheus registry (isolates our metrics from default ones)
const registry = new Registry();
// Collect default Node.js metrics (CPU, memory, event loop lag, etc.)
collectDefaultMetrics({ register: registry, prefix: "finwise_" });

/**
 * Normalizes URL paths to prevent high cardinality in metric labels.
 *
 * HIGH CARDINALITY PROBLEM:
 * If each unique URL creates a separate time series, Prometheus storage explodes.
 * E.g., /api/v1/users/507f1f77bcf86cd799439011 and /api/v1/users/507f1f77bcf86cd799439012
 * would be separate series. After normalization, both become /api/v1/users/:id.
 *
 * @param path - Raw URL path
 * @returns Normalized path with dynamic segments replaced by placeholders
 */
const normalizePath = (path: string) => {
  // Remove query string
  const withoutQuery = path.split("?")[0] || "/";
  return withoutQuery
    // Replace MongoDB ObjectIds (24 hex chars) with :id
    .replace(/\/[a-f\d]{24}(?=\/|$)/gi, "/:id")
    // Replace numeric segments with :num
    .replace(/\/\d+(?=\/|$)/g, "/:num");
};

// ── HTTP Metrics ──────────────────────────────────────────────────────

/**
 * Histogram: HTTP request duration in milliseconds
 * Labels: method (GET/POST/etc), path (normalized), status (200/404/etc)
 * Buckets: 5ms to 10s (covers most API response times)
 */
const httpRequestDurationMs = new Histogram({
  name: "finwise_http_request_duration_ms",
  help: "HTTP request duration in milliseconds",
  labelNames: ["method", "path", "status"] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000],
  registers: [registry],
});

/**
 * Counter: Total HTTP requests
 * Labels: method, path (normalized), status
 */
const httpRequestsTotal = new Counter({
  name: "finwise_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "path", "status"] as const,
  registers: [registry],
});

// ── AI Core Metrics ──────────────────────────────────────────────────

/**
 * Histogram: Duration of requests to the Python AI service
 * Labels: endpoint, fallback_used (true/false)
 * Buckets: 50ms to 45s (AI requests can be slow)
 */
const aiCoreRequestDurationMs = new Histogram({
  name: "finwise_ai_core_request_duration_ms",
  help: "AI Core request duration in milliseconds",
  labelNames: ["endpoint", "fallback_used"] as const,
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10_000, 20_000, 45_000],
  registers: [registry],
});

/**
 * Counter: AI cache lookups (hit vs miss)
 * Labels: endpoint, hit (true/false)
 */
const aiCacheTotal = new Counter({
  name: "finwise_ai_cache_total",
  help: "AI cache lookups by endpoint and hit/miss",
  labelNames: ["endpoint", "hit"] as const,
  registers: [registry],
});

/**
 * Counter: Response cache lookups (hit vs miss)
 * Labels: endpoint, hit (true/false)
 */
const responseCacheTotal = new Counter({
  name: "finwise_response_cache_total",
  help: "Response cache lookups by endpoint and hit/miss",
  labelNames: ["endpoint", "hit"] as const,
  registers: [registry],
});

/**
 * Gauge: AI circuit breaker state (1=open, 0=closed)
 * When open, requests to AI Core are rejected immediately (fail-fast)
 */
const aiCircuitOpen = new Gauge({
  name: "finwise_ai_circuit_open",
  help: "AI Core circuit breaker state (1=open, 0=closed)",
  registers: [registry],
});

/**
 * Gauge: Number of consecutive AI Core failures
 * Used to trigger circuit breaker opening
 */
const aiConsecutiveFailures = new Gauge({
  name: "finwise_ai_consecutive_failures",
  help: "Consecutive AI Core failures tracked by server circuit breaker",
  registers: [registry],
});

// ── Feature Metrics ──────────────────────────────────────────────────

/**
 * Counter: Task lifecycle events (created, status_update, apply_success, apply_failure)
 */
const taskEventsTotal = new Counter({
  name: "finwise_task_events_total",
  help: "Task lifecycle events",
  labelNames: ["event"] as const,
  registers: [registry],
});

/**
 * Counter: OCR parse outcomes (success/failure)
 */
const ocrParseTotal = new Counter({
  name: "finwise_ocr_parse_total",
  help: "OCR parse outcomes",
  labelNames: ["status"] as const,
  registers: [registry],
});

/**
 * Counter: AI fallback responses (when primary AI service is unavailable)
 */
const aiFallbackTotal = new Counter({
  name: "finwise_ai_fallback_total",
  help: "AI fallback responses observed at API layer",
  labelNames: ["endpoint"] as const,
  registers: [registry],
});

/**
 * Histogram: Scenario processing duration
 * Labels: fallback_used (true/false)
 */
const scenarioDurationMs = new Histogram({
  name: "finwise_scenario_duration_ms",
  help: "Scenario processing duration in milliseconds",
  labelNames: ["fallback_used"] as const,
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 20_000],
  registers: [registry],
});

/**
 * Counter: Usage metering events by feature
 * Used for billing and usage tracking
 */
const usageEventsTotal = new Counter({
  name: "finwise_usage_events_total",
  help: "Usage metering events by feature",
  labelNames: ["feature"] as const,
  registers: [registry],
});

/**
 * Helper to check if metrics collection is enabled.
 * When disabled, all recording functions are no-ops (zero overhead).
 */
const isEnabled = () => getEnv().METRICS_ENABLED;

// ── Middleware ────────────────────────────────────────────────────────

/**
 * Express middleware that records HTTP request metrics.
 *
 * HOW IT WORKS:
 * 1. Records the start time using high-resolution timer (process.hrtime.bigint())
 * 2. Registers a 'finish' event listener on the response
 * 3. When the response finishes, calculates duration and records metrics
 *
 * WHY res.on("finish")?
 * We need the response status code, which isn't available until the response
 * is sent. The 'finish' event fires after all data has been flushed to the
 * network buffer (not after the client receives it).
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export const metricsMiddleware: RequestHandler = (req, res, next) => {
  if (!isEnabled()) {
    return next(); // Skip metrics collection if disabled
  }

  // Record start time with nanosecond precision
  const start = process.hrtime.bigint();
  const method = req.method;
  const path = normalizePath(req.originalUrl || req.url || "/");

  // Record metrics when response finishes
  res.on("finish", () => {
    // Convert nanoseconds to milliseconds
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const status = String(res.statusCode);
    httpRequestDurationMs.labels(method, path, status).observe(durationMs);
    httpRequestsTotal.labels(method, path, status).inc();
  });

  next();
};

// ── Recording Functions ──────────────────────────────────────────────
// These functions are called by services/controllers to record specific metrics.
// All functions are no-ops when metrics are disabled.

/**
 * Records the duration of an AI Core request.
 *
 * @param endpoint - The AI endpoint called (e.g., "/process", "/health")
 * @param durationMs - Request duration in milliseconds
 * @param fallbackUsed - Whether a fallback response was used
 */
export const recordAiCoreRequest = (params: {
  endpoint: string;
  durationMs: number;
  fallbackUsed: boolean;
}) => {
  if (!isEnabled()) return;
  aiCoreRequestDurationMs
    .labels(params.endpoint, params.fallbackUsed ? "true" : "false")
    .observe(params.durationMs);
};

/**
 * Records an AI cache lookup result.
 *
 * @param endpoint - The AI endpoint
 * @param hit - Whether the cache hit (true) or missed (false)
 */
export const recordAiCache = (params: { endpoint: string; hit: boolean }) => {
  if (!isEnabled()) return;
  aiCacheTotal.labels(params.endpoint, params.hit ? "true" : "false").inc();
};

/**
 * Records a response cache lookup result.
 *
 * @param endpoint - The API endpoint
 * @param hit - Whether the cache hit (true) or missed (false)
 */
export const recordResponseCache = (params: { endpoint: string; hit: boolean }) => {
  if (!isEnabled()) return;
  responseCacheTotal.labels(params.endpoint, params.hit ? "true" : "false").inc();
};

/**
 * Updates the AI circuit breaker state gauge.
 *
 * @param circuitOpen - Whether the circuit breaker is open (true) or closed (false)
 * @param consecutiveFailures - Number of consecutive failures
 */
export const setAiCircuitBreakerState = (params: { circuitOpen: boolean; consecutiveFailures: number }) => {
  if (!isEnabled()) return;
  aiCircuitOpen.set(params.circuitOpen ? 1 : 0);
  aiConsecutiveFailures.set(params.consecutiveFailures);
};

/**
 * Records a task lifecycle event.
 *
 * @param event - The task event type
 * @param count - Number of events (default: 1)
 */
export const recordTaskEvent = (params: { event: "created" | "status_update" | "apply_success" | "apply_failure"; count?: number }) => {
  if (!isEnabled()) return;
  taskEventsTotal.labels(params.event).inc(params.count || 1);
};

/**
 * Records an OCR parse outcome.
 *
 * @param success - Whether the OCR parse succeeded
 */
export const recordOcrParse = (params: { success: boolean }) => {
  if (!isEnabled()) return;
  ocrParseTotal.labels(params.success ? "success" : "failure").inc();
};

/**
 * Records an AI fallback response (when primary AI service is unavailable).
 *
 * @param endpoint - The AI endpoint that used a fallback
 */
export const recordAiFallback = (params: { endpoint: string }) => {
  if (!isEnabled()) return;
  aiFallbackTotal.labels(params.endpoint).inc();
};

/**
 * Records scenario processing duration.
 *
 * @param durationMs - Processing duration in milliseconds
 * @param fallbackUsed - Whether a fallback was used
 */
export const recordScenarioDuration = (params: { durationMs: number; fallbackUsed: boolean }) => {
  if (!isEnabled()) return;
  scenarioDurationMs.labels(params.fallbackUsed ? "true" : "false").observe(params.durationMs);
};

/**
 * Records a usage metering event (for billing).
 *
 * @param feature - The feature being metered
 * @param units - Number of units consumed (default: 1)
 */
export const recordUsageEvent = (params: { feature: string; units?: number }) => {
  if (!isEnabled()) return;
  usageEventsTotal.labels(params.feature).inc(params.units || 1);
};

// ── Metrics Endpoint Handler ─────────────────────────────────────────

/**
 * HTTP handler that exposes Prometheus metrics.
 *
 * SECURITY:
 * - Returns 404 if metrics are disabled
 * - Requires Bearer token authentication (METRICS_TOKEN)
 * - This prevents unauthorized access to internal metrics
 *
 * PROMETHEUS SCRAPING:
 * Prometheus is configured to poll this endpoint periodically (e.g., every 15s).
 * It sends the METRICS_TOKEN as a Bearer token for authentication.
 *
 * @param req - Express request object
 * @param res - Express response object
 */
export const metricsHandler: RequestHandler = async (req, res) => {
  const env = getEnv();

  // Return 404 if metrics are disabled
  if (!env.METRICS_ENABLED) {
    return res.status(404).json({ message: "Metrics disabled" });
  }

  // Authenticate using Bearer token
  const auth = String(req.header("authorization") || "");
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!token || token !== env.METRICS_TOKEN) {
    return res.status(403).json({ message: "Forbidden" });
  }

  // Return metrics in Prometheus text format
  res.setHeader("Content-Type", registry.contentType);
  res.end(await registry.metrics());
};

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **Metric Types**: Counters (monotonic), Histograms (distributions),
 *    Gauges (point-in-time values) serve different monitoring needs.
 *
 * 2. **Label Cardinality**: Keep label values bounded. Dynamic values like
 *    user IDs or request IDs would create unbounded time series.
 *
 * 3. **Path Normalization**: Replacing dynamic segments with :id/:num prevents
 *    high cardinality while preserving meaningful path grouping.
 *
 * 4. **Zero-Overhead When Disabled**: All recording functions check isEnabled()
 *    first. When metrics are disabled, there's no performance cost.
 *
 * 5. **Secured Endpoint**: The metrics endpoint requires token authentication
 *    to prevent unauthorized access to internal system information.
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * metrics.ts → middleware in app.ts records HTTP metrics
 * metrics.ts → services call recordXxx() functions to record business metrics
 * metrics.ts → /api/metrics endpoint scraped by Prometheus
 * metrics.ts → Grafana dashboards visualize the collected metrics
 * ══════════════════════════════════════════════════════════════════════
 */
