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
import { Counter, Gauge, Histogram } from "prom-client";
import { getEnv } from "../config/env";
import { registry } from "./registry"; // Shared registry (also used by platformMetrics)
import "./platformMetrics"; // Registers infrastructure metrics (SSE, pool, DLQ, cache layers, ...)
export * from "./platformMetrics";

// The registry (isolated from prom-client's default one, with Node.js default
// metrics) is created in ./registry so platformMetrics can share it.

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
// Sanitizes request URL paths by stripping parameters and masking dynamic entities.
// Replaces hexadecimal ObjectIds and numeric IDs with static token placeholders.
// Restricts metric label cardinality to prevent Prometheus time-series explosion.
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
// Prometheus histogram tracking HTTP request latency across application routes.
// Labels observations with HTTP method, normalized endpoint path, and response code.
// Groups response durations across buckets ranging from five milliseconds to ten seconds.
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
// Monotonically increasing Prometheus counter recording cumulative HTTP traffic.
// Disaggregates request volumes by request method, normalized path, and HTTP status.
// Facilitates throughput calculations and error rate monitoring in dashboard visualizers.
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
// Prometheus histogram capturing round-trip latency to the AI Core Python microservice.
// Distinguishes direct primary model executions from fallback strategy evaluations.
// Provides duration bucket intervals up to 45 seconds for complex generative queries.
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
// Counter measuring hit and miss ratios for AI model response caching layers.
// Categorizes lookups across individual AI service endpoint names and hit booleans.
// Informs cache sizing and eviction tuning for high-cost AI model invocations.
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
// Counter recording hit and miss outcomes for HTTP level response caching layers.
// Labels entries by target service route and boolean hit indicators.
// Enables evaluation of client-facing payload caching efficiency across operations.
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
// Binary gauge signaling whether the AI Core upstream circuit breaker is open.
// Returns one when upstream failures exceed threshold and fast-fail mode engages.
// Returns zero during normal operational states when outbound traffic flows freely.
const aiCircuitOpen = new Gauge({
  name: "finwise_ai_circuit_open",
  help: "AI Core circuit breaker state (1=open, 0=closed)",
  registers: [registry],
});

/**
 * Gauge: Number of consecutive AI Core failures
 * Used to trigger circuit breaker opening
 */
// Gauge tracking current tally of consecutive network or service failures from AI Core.
// Used as threshold counter driving circuit breaker transitions into trip state.
// Resets back to zero upon receiving successful heartbeat or service responses.
const aiConsecutiveFailures = new Gauge({
  name: "finwise_ai_consecutive_failures",
  help: "Consecutive AI Core failures tracked by server circuit breaker",
  registers: [registry],
});

/**
 * Gauge: AI circuit breaker state (0=closed, 1=half-open, 2=open)
 */
// Tri-state gauge encoding circuit breaker phase for AI Core integrations.
// Encodes zero for closed healthy state, one for half-open trial, and two for open tripped.
// Provides precise real-time visibility into circuit breaker transition dynamics.
const aiCircuitState = new Gauge({
  name: "finwise_ai_circuit_state",
  help: "AI Core circuit breaker state (0=closed, 1=half-open, 2=open)",
  registers: [registry],
});

/** Gauge: AI requests currently holding a gateway concurrency slot. */
// Gauge reflecting real-time count of active requests occupying AI gateway slots.
// Monitors system load against configured concurrent execution ceilings.
// Serves as backpressure trigger for admission control and priority queuing.
const aiInFlight = new Gauge({
  name: "finwise_ai_gateway_in_flight",
  help: "AI requests in flight through the gateway admission controller",
  registers: [registry],
});

/** Gauge: AI requests waiting in the gateway queue, per priority lane. */
// Gauge tracking the backlog depth of pending AI requests awaiting processing slots.
// Segmented across priority lanes including interactive, background, and batch queues.
// Alerts operators to excessive request queuing prior to timeout shedding.
const aiQueueDepth = new Gauge({
  name: "finwise_ai_gateway_queue_depth",
  help: "AI requests waiting in the gateway admission queue",
  labelNames: ["lane"] as const,
  registers: [registry],
});

/** Counter: AI requests rejected by gateway load shedding. */
// Counter tracking dropped or shed AI requests rejected by gateway admission policies.
// Captures priority lane classification and drop rationale such as queue full or timeout.
// Highlights capacity exhaustion events without impacting upstream callers ungracefully.
const aiShedTotal = new Counter({
  name: "finwise_ai_gateway_shed_total",
  help: "AI requests shed by the gateway admission controller",
  labelNames: ["lane", "reason"] as const,
  registers: [registry],
});

// ── Feature Metrics ──────────────────────────────────────────────────

/**
 * Counter: Task lifecycle events (created, status_update, apply_success, apply_failure)
 */
// Counter enumerating financial task lifecycle state changes and workflow transitions.
// Labels entries across creation, status updates, apply successes, and failure occurrences.
// Enables end-to-end auditability and task completion funnel analysis.
const taskEventsTotal = new Counter({
  name: "finwise_task_events_total",
  help: "Task lifecycle events",
  labelNames: ["event"] as const,
  registers: [registry],
});

/**
 * Counter: OCR parse outcomes (success/failure)
 */
// Counter logging receipt and document OCR parsing attempts and resolution statuses.
// Segregates outcome counts between successful extractions and parsing failures.
// Pinpoints document intake quality and OCR processing error trends.
const ocrParseTotal = new Counter({
  name: "finwise_ocr_parse_total",
  help: "OCR parse outcomes",
  labelNames: ["status"] as const,
  registers: [registry],
});

/**
 * Counter: AI fallback responses (when primary AI service is unavailable)
 */
// Counter recording fallback activations when AI microservices are unreachable or degraded.
// Categorizes fallback events by specific functional API endpoint name.
// Signals user-facing feature resilience when cloud or internal AI pipelines falter.
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
// Histogram recording financial scenario computation durations in milliseconds.
// Tracks execution profiles while partitioning data by whether fallback rules ran.
// Evaluates simulation calculation times across buckets ranging up to 20 seconds.
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
// Counter tracking billable and rate-limited user action occurrences across system features.
// Disaggregates usage volume by distinct functional feature identifiers.
// Supplies raw operational data for quota auditing and consumption billing calculations.
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
// Checks whether Prometheus metrics collection is activated in application configuration.
// Allows short-circuiting metric recording logic with zero overhead when disabled.
// Reads METRICS_ENABLED environment setting dynamically from configuration helper.
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
// Express middleware timing incoming HTTP transactions using high-resolution monotonic clocks.
// Hooks response completion events to publish request duration and volume metrics.
// Normalizes dynamic URI paths to eliminate unbounded label cardinality in Prometheus.
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
// Records the observed execution latency of calls dispatched to the AI Core service.
// Records elapsed millisecond duration alongside endpoint name and fallback flags.
// Short-circuits immediately if application metrics collection is disabled.
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
// Records cache resolution outcomes for AI generative queries and prompt evaluations.
// Increments endpoint-specific hit or miss Prometheus counters accordingly.
// No-ops without overhead when metric monitoring is deactivated in configuration.
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
// Records cache hit or miss outcomes for HTTP endpoint response cache lookups.
// Increments global response cache Prometheus counters segmented by route.
// Enables evaluation of caching layers across API controller operations.
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
// Updates Prometheus gauges representing AI Core circuit breaker state and health metrics.
// Sets binary trip status, failure counts, and categorical state indicators.
// Enables dashboard alerts to detect degradation in downstream AI services.
export const setAiCircuitBreakerState = (params: {
  circuitOpen: boolean;
  consecutiveFailures: number;
  state?: "closed" | "open" | "half_open";
}) => {
  if (!isEnabled()) return;
  aiCircuitOpen.set(params.circuitOpen ? 1 : 0);
  aiConsecutiveFailures.set(params.consecutiveFailures);
  if (params.state) {
    aiCircuitState.set(params.state === "closed" ? 0 : params.state === "half_open" ? 1 : 2);
  }
};

/** Publishes AI gateway admission-control gauges: queued per lane and in-flight work. */
// Updates admission control gauges for AI gateway request queues and concurrent load.
// Updates current in-flight request gauge and backlog depth per priority lane.
// Exposes real-time AI concurrency status to Prometheus monitoring scrapers.
export const setAiQueueGauges = (params: { inFlight: number; queued: Record<string, number> }) => {
  if (!isEnabled()) return;
  aiInFlight.set(params.inFlight);
  for (const [lane, depth] of Object.entries(params.queued)) {
    aiQueueDepth.set({ lane }, depth);
  }
};

/** Counts AI requests shed by the gateway (queue_full | queue_timeout | user_queue_full | evicted). */
// Increments the counter tracking requests rejected by the AI gateway under load shedding.
// Labels the rejection with the affected priority queue lane and underlying shed reason.
// Provides operational visibility into capacity limits and throttling policies.
export const recordAiShed = (params: { lane: string; reason: string }) => {
  if (!isEnabled()) return;
  aiShedTotal.inc({ lane: params.lane, reason: params.reason });
};

/**
 * Records a task lifecycle event.
 *
 * @param event - The task event type
 * @param count - Number of events (default: 1)
 */
// Increments task lifecycle event counters when tasks transition between stages.
// Categorizes events across creation, status change, and successful or failed execution.
// Supports custom increment counts for bulk operations across task workflows.
export const recordTaskEvent = (params: { event: "created" | "status_update" | "apply_success" | "apply_failure"; count?: number }) => {
  if (!isEnabled()) return;
  taskEventsTotal.labels(params.event).inc(params.count || 1);
};

/**
 * Records an OCR parse outcome.
 *
 * @param success - Whether the OCR parse succeeded
 */
// Records the parsing outcome of an OCR receipt or financial document scan.
// Increments the success or failure label on the OCR parsing Prometheus counter.
// Allows monitoring OCR accuracy and third-party document processing health.
export const recordOcrParse = (params: { success: boolean }) => {
  if (!isEnabled()) return;
  ocrParseTotal.labels(params.success ? "success" : "failure").inc();
};

/**
 * Records an AI fallback response (when primary AI service is unavailable).
 *
 * @param endpoint - The AI endpoint that used a fallback
 */
// Increments the count of requests where an AI fallback mechanism had to be used.
// Tracks fallbacks segmented by the calling API endpoint name.
// Highlights service degradation points where heuristic fallbacks masked primary AI errors.
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
// Records the elapsed computation duration of a scenario simulation calculation.
// Observes execution latency in milliseconds tagged with fallback indicator status.
// Populates scenario duration histograms to monitor simulation performance regressions.
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
// Records consumable resource usage events associated with monetized or limited features.
// Increments usage counters labeled by feature name with optional unit multiples.
// Provides telemetry data for billing reconciliation and subscription tier enforcement.
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
// Express request handler serving Prometheus scrape endpoints with authentication.
// Verifies bearer token against configured METRICS_TOKEN before releasing metric dumps.
// Serializes Prometheus metric registers into standard Prometheus plain text format.
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
