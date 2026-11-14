import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  attachMongoPoolMetrics,
  metricsHandler,
  observeEventBusLag,
  recordCacheLayer,
  recordCanaryEvent,
  recordLlmUsage,
  registerDlqSizeProvider,
  trackSseConnection,
} from "../observability/metrics";
import { buildTraceparent, isValidRequestId, sanitizeRequestId } from "../observability/tracing";
import { aiCoreHeaders } from "../services/aiCoreTransport";
import { readSummaryCapacityConfig, summaryCapacityService } from "../services/summaryCapacityService";

const scrape = async (): Promise<string> => {
  let body = "";
  const res: any = {
    status: () => res,
    json: () => res,
    setHeader: () => res,
    end: (chunk: string) => {
      body = chunk;
    },
  };
  await metricsHandler({ header: (name: string) => (name === "authorization" ? "Bearer scrape-token" : "") } as any, res, () => undefined);
  return body;
};

const value = (text: string, series: string): number | undefined => {
  const line = text.split("\n").find((l) => l.startsWith(`${series} `));
  return line ? Number(line.split(" ")[1]) : undefined;
};

describe("platform metrics", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.METRICS_ENABLED = "true";
    process.env.METRICS_TOKEN = "scrape-token";
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("exposes SSE, cache-layer, token/cost, canary, event-bus and DLQ series", async () => {
    const close = trackSseConnection("events");
    recordCacheLayer({ cache: "unit", layer: "l2_redis", result: "hit" });
    recordLlmUsage({ orgId: "org-a", model: "gemini/flash", tokensIn: 100, tokensOut: 40, costUsd: 0.002 });
    recordCanaryEvent({ event: "rollback", artifactKind: "prompt" });
    observeEventBusLag({ bus: "redis", lagMs: 12 });
    registerDlqSizeProvider("unit_test_queue", () => 7);

    const text = await scrape();
    expect(value(text, 'finwise_sse_connections{kind="events"}')).toBe(1);
    expect(value(text, 'finwise_cache_layer_total{cache="unit",layer="l2_redis",result="hit"}')).toBe(1);
    // org label is collapsed unless METRICS_ORG_LABELS=true
    expect(value(text, 'finwise_llm_tokens_total{org="all",model="gemini/flash",direction="in"}')).toBe(100);
    expect(value(text, 'finwise_llm_tokens_total{org="all",model="gemini/flash",direction="out"}')).toBe(40);
    expect(value(text, 'finwise_llm_cost_usd_total{org="all",model="gemini/flash"}')).toBeCloseTo(0.002);
    expect(value(text, 'finwise_ai_canary_events_total{event="rollback",artifact_kind="prompt"}')).toBe(1);
    expect(text).toContain('finwise_event_bus_lag_ms_count{bus="redis"}');
    expect(value(text, 'finwise_dlq_size{queue="unit_test_queue"}')).toBe(7);

    close();
    close(); // idempotent
    expect(value(await scrape(), 'finwise_sse_connections{kind="events"}')).toBe(0);
  });

  it("emits per-org series only when METRICS_ORG_LABELS=true", async () => {
    process.env.METRICS_ORG_LABELS = "true";
    recordLlmUsage({ orgId: "org-labelled", model: "m1", tokensIn: 5 });
    expect(value(await scrape(), 'finwise_llm_tokens_total{org="org-labelled",model="m1",direction="in"}')).toBe(5);
  });

  it("is a no-op when metrics are disabled", () => {
    process.env.METRICS_ENABLED = "false";
    const close = trackSseConnection("other");
    close();
    expect(() => recordLlmUsage({ model: "x", tokensIn: 1 })).not.toThrow();
  });

  it("tracks Mongo pool checkout pressure from driver CMAP events", async () => {
    const client = new EventEmitter();
    attachMongoPoolMetrics(client as any);
    attachMongoPoolMetrics(client as any); // second attach must not double count
    client.emit("connectionCheckOutStarted", {});
    client.emit("connectionCheckOutStarted", {});
    let text = await scrape();
    expect(value(text, "finwise_mongo_pool_wait_queue")).toBe(2);
    client.emit("connectionCheckedOut", {});
    client.emit("connectionCheckOutFailed", { reason: "timeout" });
    text = await scrape();
    expect(value(text, "finwise_mongo_pool_wait_queue")).toBe(0);
    expect(value(text, "finwise_mongo_pool_checked_out")).toBe(1);
    expect(value(text, 'finwise_mongo_pool_checkout_failed_total{reason="timeout"}')).toBe(1);
    client.emit("connectionCheckedIn", {});
    expect(value(await scrape(), "finwise_mongo_pool_checked_out")).toBe(0);
  });
});

describe("request id and traceparent", () => {
  it("accepts conservative ids and replaces anything else", () => {
    expect(isValidRequestId("req-1234567890")).toBe(true);
    expect(isValidRequestId("3f2b8c1e-8c5d-4c3a-9f0a-0123456789ab")).toBe(true);
    for (const bad of ["short", "has space here", "x\r\nInjected: 1", "a".repeat(129), "", undefined, 42]) {
      expect(isValidRequestId(bad)).toBe(false);
    }
    expect(sanitizeRequestId("req-1234567890")).toBe("req-1234567890");
    expect(sanitizeRequestId("bad id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("derives a stable trace id from the request id", () => {
    const a = buildTraceparent("req-1234567890") as string;
    const b = buildTraceparent("req-1234567890") as string;
    expect(a).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(a.split("-")[1]).toBe(b.split("-")[1]);
    expect(buildTraceparent(undefined)).toBeUndefined();
  });

  it("aiCoreHeaders forwards X-Request-Id and traceparent together", () => {
    const headers = aiCoreHeaders({ requestId: "req-1234567890" });
    expect(headers["X-Request-Id"]).toBe("req-1234567890");
    expect(headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(aiCoreHeaders({}).traceparent).toBeUndefined();
  });
});

describe("summary capacity configuration", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    summaryCapacityService.resetMetrics();
  });

  it("keeps the previous defaults when no env is set", () => {
    for (const key of Object.keys(process.env)) if (key.startsWith("CAPACITY_")) delete process.env[key];
    expect(readSummaryCapacityConfig()).toMatchObject({
      maxSessionsRedis: 350,
      maxSessionsLocal: 100,
      rpsRedis: 120,
      rpsLocal: 35,
      saturatedLatencyMs: 3000,
      benchmarkPassRps: 50,
    });
  });

  it("reads overrides and ignores invalid values", () => {
    process.env.CAPACITY_RPS_LOCAL = "12";
    process.env.CAPACITY_MAX_SESSIONS_LOCAL = "not-a-number";
    const config = readSummaryCapacityConfig();
    expect(config.rpsLocal).toBe(12);
    expect(config.maxSessionsLocal).toBe(100);
  });

  it("derives a measured estimate (Little's law) once enough samples exist, capped by the ceiling", () => {
    process.env.CAPACITY_RPS_LOCAL = "100";
    process.env.CAPACITY_RPS_REDIS = "100";
    process.env.CAPACITY_MIN_MEASURED_SAMPLES = "3";
    process.env.AI_MAX_CONCURRENCY = "8";
    summaryCapacityService.resetMetrics();
    expect(summaryCapacityService.getMetrics().capacityEstimate.estimateSource).toBe("configured");
    for (let i = 0; i < 3; i++) summaryCapacityService.recordLiveGeneration({ durationMs: 2000, fallbackUsed: false });
    const estimate = summaryCapacityService.getMetrics().capacityEstimate;
    expect(estimate.estimateSource).toBe("measured");
    expect(estimate.estimatedRpsCapacity).toBe(4); // 8 slots / 2 s
    expect(estimate.configuredRpsCeiling).toBe(100);
  });

  it("flags saturation using the configured latency threshold", () => {
    process.env.CAPACITY_SATURATED_LATENCY_MS = "500";
    summaryCapacityService.resetMetrics();
    summaryCapacityService.recordLiveGeneration({ durationMs: 900, fallbackUsed: false });
    expect(summaryCapacityService.getMetrics().capacityEstimate.status).toBe("saturated");
  });
});
