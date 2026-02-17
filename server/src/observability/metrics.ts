import type { RequestHandler } from "express";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { getEnv } from "../config/env";

const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "finwise_" });

const normalizePath = (path: string) => {
  const withoutQuery = path.split("?")[0] || "/";
  return withoutQuery
    .replace(/\/[a-f\d]{24}(?=\/|$)/gi, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:num");
};

const httpRequestDurationMs = new Histogram({
  name: "finwise_http_request_duration_ms",
  help: "HTTP request duration in milliseconds",
  labelNames: ["method", "path", "status"] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000],
  registers: [registry],
});

const httpRequestsTotal = new Counter({
  name: "finwise_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "path", "status"] as const,
  registers: [registry],
});

const aiCoreRequestDurationMs = new Histogram({
  name: "finwise_ai_core_request_duration_ms",
  help: "AI Core request duration in milliseconds",
  labelNames: ["endpoint", "fallback_used"] as const,
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10_000, 20_000, 45_000],
  registers: [registry],
});

const aiCacheTotal = new Counter({
  name: "finwise_ai_cache_total",
  help: "AI cache lookups by endpoint and hit/miss",
  labelNames: ["endpoint", "hit"] as const,
  registers: [registry],
});

const aiCircuitOpen = new Gauge({
  name: "finwise_ai_circuit_open",
  help: "AI Core circuit breaker state (1=open, 0=closed)",
  registers: [registry],
});

const aiConsecutiveFailures = new Gauge({
  name: "finwise_ai_consecutive_failures",
  help: "Consecutive AI Core failures tracked by server circuit breaker",
  registers: [registry],
});

const taskEventsTotal = new Counter({
  name: "finwise_task_events_total",
  help: "Task lifecycle events",
  labelNames: ["event"] as const,
  registers: [registry],
});

const ocrParseTotal = new Counter({
  name: "finwise_ocr_parse_total",
  help: "OCR parse outcomes",
  labelNames: ["status"] as const,
  registers: [registry],
});

const aiFallbackTotal = new Counter({
  name: "finwise_ai_fallback_total",
  help: "AI fallback responses observed at API layer",
  labelNames: ["endpoint"] as const,
  registers: [registry],
});

const scenarioDurationMs = new Histogram({
  name: "finwise_scenario_duration_ms",
  help: "Scenario processing duration in milliseconds",
  labelNames: ["fallback_used"] as const,
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 20_000],
  registers: [registry],
});

const usageEventsTotal = new Counter({
  name: "finwise_usage_events_total",
  help: "Usage metering events by feature",
  labelNames: ["feature"] as const,
  registers: [registry],
});

const isEnabled = () => getEnv().METRICS_ENABLED;

export const metricsMiddleware: RequestHandler = (req, res, next) => {
  if (!isEnabled()) {
    return next();
  }

  const start = process.hrtime.bigint();
  const method = req.method;
  const path = normalizePath(req.originalUrl || req.url || "/");

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const status = String(res.statusCode);
    httpRequestDurationMs.labels(method, path, status).observe(durationMs);
    httpRequestsTotal.labels(method, path, status).inc();
  });

  next();
};

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

export const recordAiCache = (params: { endpoint: string; hit: boolean }) => {
  if (!isEnabled()) return;
  aiCacheTotal.labels(params.endpoint, params.hit ? "true" : "false").inc();
};

export const setAiCircuitBreakerState = (params: { circuitOpen: boolean; consecutiveFailures: number }) => {
  if (!isEnabled()) return;
  aiCircuitOpen.set(params.circuitOpen ? 1 : 0);
  aiConsecutiveFailures.set(params.consecutiveFailures);
};

export const recordTaskEvent = (params: { event: "created" | "status_update" | "apply_success" | "apply_failure"; count?: number }) => {
  if (!isEnabled()) return;
  taskEventsTotal.labels(params.event).inc(params.count || 1);
};

export const recordOcrParse = (params: { success: boolean }) => {
  if (!isEnabled()) return;
  ocrParseTotal.labels(params.success ? "success" : "failure").inc();
};

export const recordAiFallback = (params: { endpoint: string }) => {
  if (!isEnabled()) return;
  aiFallbackTotal.labels(params.endpoint).inc();
};

export const recordScenarioDuration = (params: { durationMs: number; fallbackUsed: boolean }) => {
  if (!isEnabled()) return;
  scenarioDurationMs.labels(params.fallbackUsed ? "true" : "false").observe(params.durationMs);
};

export const recordUsageEvent = (params: { feature: string; units?: number }) => {
  if (!isEnabled()) return;
  usageEventsTotal.labels(params.feature).inc(params.units || 1);
};

export const metricsHandler: RequestHandler = async (req, res) => {
  const env = getEnv();
  if (!env.METRICS_ENABLED) {
    return res.status(404).json({ message: "Metrics disabled" });
  }

  const auth = String(req.header("authorization") || "");
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!token || token !== env.METRICS_TOKEN) {
    return res.status(403).json({ message: "Forbidden" });
  }

  res.setHeader("Content-Type", registry.contentType);
  res.end(await registry.metrics());
};
