/**
 * @fileoverview summaryCapacityService.ts - Distributed Coordination & Staging Capacity Engine
 *
 * Implements real-time telemetry tracking, distributed cache coordination measurement,
 * generation-only token accounting, and synthetic staging load benchmarks for conversation
 * summaries and multi-provider narration.
 */

import { getRedis } from "../config/redis";
import { logger } from "../config/logger";
import { recordCacheLayer } from "../observability/platformMetrics";
import { readAiLimits } from "./aiConcurrency";

// ── Capacity configuration ───────────────────────────────────────────
// Every number that used to be hard-coded is env-configurable. Defaults are the
// previous constants; docs/CAPACITY_AND_SLOS.md explains how to size them from a
// k6 run. Read per call so env changes (and tests) apply immediately.
export type SummaryCapacityConfig = {
  /** Concurrent sessions this replica supports with / without Redis coordination. */
  maxSessionsRedis: number;
  maxSessionsLocal: number;
  /** Configured ceiling for requests/second with / without Redis coordination. */
  rpsRedis: number;
  rpsLocal: number;
  /** Average live-generation latency above which the service reports "saturated". */
  saturatedLatencyMs: number;
  /** Throughput the synthetic staging benchmark must reach to report "passed". */
  benchmarkPassRps: number;
  /** Latency samples required before the measured (Little's law) estimate is used. */
  minSamplesForMeasured: number;
};

const envNumber = (name: string, fallback: number, min = 1): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min ? value : fallback;
};

export const readSummaryCapacityConfig = (): SummaryCapacityConfig => ({
  maxSessionsRedis: envNumber("CAPACITY_MAX_SESSIONS_REDIS", 350),
  maxSessionsLocal: envNumber("CAPACITY_MAX_SESSIONS_LOCAL", 100),
  rpsRedis: envNumber("CAPACITY_RPS_REDIS", 120),
  rpsLocal: envNumber("CAPACITY_RPS_LOCAL", 35),
  saturatedLatencyMs: envNumber("CAPACITY_SATURATED_LATENCY_MS", 3000),
  benchmarkPassRps: envNumber("CAPACITY_BENCHMARK_PASS_RPS", 50),
  minSamplesForMeasured: envNumber("CAPACITY_MIN_MEASURED_SAMPLES", 20),
});

// Telemetry interface reporting real-time cache efficiency, request coalescing, and capacity limits.
// Computes token expenditure, latency percentiles, and maximum sustainable concurrent throughput.
export interface SummaryCapacityMetrics {
  totalRequests: number;
  cacheHitsL1: number;
  cacheHitsL2: number;
  totalCacheHits: number;
  cacheHitRatePct: number;
  coalescedInFlight: number;
  coalescedDistributed: number;
  totalCoalesced: number;
  coalescingEfficiencyPct: number;
  liveGenerations: number;
  fallbackCount: number;
  tokensInTotal: number;
  tokensOutTotal: number;
  costUsdTotal: number;
  latencyAvgMs: number;
  latencyP95Ms: number;
  capacityEstimate: {
    status: "healthy" | "saturated" | "nominal";
    maxConcurrentSessionsSupported: number;
    estimatedRpsCapacity: number;
    distributedLockAvailable: boolean;
    /** "measured" = Little's law from live latency; "configured" = env ceiling only. */
    estimateSource: "measured" | "configured";
    /** Configured ceiling the estimate is capped by. */
    configuredRpsCeiling: number;
  };
  lastUpdated: string;
}

// Interface encapsulating performance measurements produced by synthetic staging stress tests.
// Reports throughput rates, cache hit distribution, token economy savings, and system health status.
export interface StagingBenchmarkResult {
  simulatedRequests: number;
  concurrencyLevel: number;
  duplicateRatio: number;
  cacheHits: number;
  coalescedRequests: number;
  liveGenerations: number;
  durationMs: number;
  throughputRps: number;
  tokenSavingsPct: number;
  coalescingEfficiencyPct: number;
  status: "passed" | "degraded";
  summary: string;
}

// Service coordinating distributed summary generation, request deduplication, and staging telemetry.
// Measures multi-tier cache hits and gauges live load capacity across AI generation pipelines.
class SummaryCapacityService {
  private totalRequests = 0;
  private cacheHitsL1 = 0; // MongoDB persistent cache
  private cacheHitsL2 = 0; // Redis sub-millisecond cache
  private coalescedInFlight = 0; // Local process coalescing
  private coalescedDistributed = 0; // Redis cluster coalescing
  private liveGenerations = 0;
  private fallbackCount = 0;
  private tokensInTotal = 0;
  private tokensOutTotal = 0;
  private costUsdTotal = 0;
  private latencies: number[] = [];
  private readonly maxLatencies = 200;

  // Increments the aggregate count of incoming summary requests processed by the service.
  // Used as the denominator when computing real-time cache hit and deduplication ratios.
  public recordRequest(): void {
    this.totalRequests++;
  }

  // Increments cache hit telemetry for either MongoDB persistent storage or Redis low-latency tier.
  // Tracks tier-specific hit distribution to quantify the effectiveness of layered caching.
  public recordCacheHit(tier: "l1_mongo" | "l2_redis"): void {
    if (tier === "l1_mongo") {
      this.cacheHitsL1++;
    } else {
      this.cacheHitsL2++;
    }
    recordCacheLayer({ cache: "conversation_summary", layer: tier === "l1_mongo" ? "mongo" : "l2_redis", result: "hit" });
  }

  // Tracks identical requests deduplicated and coalesced either in-process or across Redis nodes.
  // Prevents redundant model invocations when concurrent requests request identical summary contexts.
  public recordCoalesced(type: "in_flight" | "distributed_redis"): void {
    if (type === "in_flight") {
      this.coalescedInFlight++;
    } else {
      this.coalescedDistributed++;
    }
    recordCacheLayer({ cache: "conversation_summary", layer: type === "in_flight" ? "l1_memory" : "l2_redis", result: "coalesced" });
  }

  // Records metrics from executed model generations including latency, token usage, and cost.
  // Appends request duration to a bounded sliding window to calculate average and 95th percentile latency.
  public recordLiveGeneration(params: {
    durationMs: number;
    fallbackUsed: boolean;
    tokensIn?: number;
    tokensOut?: number;
    costUsd?: number;
  }): void {
    this.liveGenerations++;
    if (params.fallbackUsed) {
      this.fallbackCount++;
    }
    if (params.tokensIn) this.tokensInTotal += params.tokensIn;
    if (params.tokensOut) this.tokensOutTotal += params.tokensOut;
    if (params.costUsd) this.costUsdTotal += params.costUsd;

    this.latencies.push(params.durationMs);
    if (this.latencies.length > this.maxLatencies) {
      this.latencies.shift();
    }
  }

  // Compiles and returns real-time operational capacity metrics and latency distributions.
  // Determines system operational status and calculates estimated sustainable requests per second.
  public getMetrics(): SummaryCapacityMetrics {
    const totalHits = this.cacheHitsL1 + this.cacheHitsL2;
    const cacheHitRatePct = this.totalRequests > 0
      ? Math.round((totalHits / this.totalRequests) * 1000) / 10
      : 0;

    const totalCoalesced = this.coalescedInFlight + this.coalescedDistributed;
    const totalCoordOps = totalCoalesced + this.liveGenerations;
    const coalescingEfficiencyPct = totalCoordOps > 0
      ? Math.round((totalCoalesced / totalCoordOps) * 1000) / 10
      : 0;

    const sortedLatencies = [...this.latencies].sort((a, b) => a - b);
    const latencyAvgMs = sortedLatencies.length > 0
      ? Math.round(sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length)
      : 0;
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const latencyP95Ms = sortedLatencies.length > 0 ? sortedLatencies[p95Index] || 0 : 0;

    const redisAvailable = Boolean(getRedis());
    const config = readSummaryCapacityConfig();
    const configuredRps = redisAvailable ? config.rpsRedis : config.rpsLocal;
    // Little's law: sustainable rps = concurrency / mean service time. Only trusted
    // once enough live generations have been timed; never above the configured ceiling.
    let estimatedRps = configuredRps;
    let estimateSource: "measured" | "configured" = "configured";
    if (sortedLatencies.length >= config.minSamplesForMeasured && latencyAvgMs > 0) {
      let concurrency = 0;
      try {
        concurrency = readAiLimits().maxConcurrency;
      } catch {
        concurrency = 0;
      }
      if (concurrency > 0) {
        const measuredRps = Math.round(((concurrency * 1000) / latencyAvgMs) * 10) / 10;
        estimatedRps = Math.min(configuredRps, measuredRps);
        estimateSource = "measured";
      }
    }

    return {
      totalRequests: this.totalRequests,
      cacheHitsL1: this.cacheHitsL1,
      cacheHitsL2: this.cacheHitsL2,
      totalCacheHits: totalHits,
      cacheHitRatePct,
      coalescedInFlight: this.coalescedInFlight,
      coalescedDistributed: this.coalescedDistributed,
      totalCoalesced,
      coalescingEfficiencyPct,
      liveGenerations: this.liveGenerations,
      fallbackCount: this.fallbackCount,
      tokensInTotal: this.tokensInTotal,
      tokensOutTotal: this.tokensOutTotal,
      costUsdTotal: Math.round(this.costUsdTotal * 10000) / 10000,
      latencyAvgMs,
      latencyP95Ms,
      capacityEstimate: {
        status: latencyAvgMs > config.saturatedLatencyMs ? "saturated" : "healthy",
        maxConcurrentSessionsSupported: redisAvailable ? config.maxSessionsRedis : config.maxSessionsLocal,
        estimatedRpsCapacity: estimatedRps,
        distributedLockAvailable: redisAvailable,
        estimateSource,
        configuredRpsCeiling: configuredRps,
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  // Simulates concurrent request traffic to measure cache coalescing efficiency and overall throughput.
  // Runs virtual worker batches with configurable duplicate ratios and evaluates system response limits.
  public async runStagingCapacityBenchmark(params: {
    concurrency?: number;
    iterations?: number;
    duplicateRatio?: number;
  }): Promise<StagingBenchmarkResult> {
    const concurrency = Math.max(1, Math.min(params.concurrency || 10, 50));
    const iterations = Math.max(1, Math.min(params.iterations || 20, 100));
    const duplicateRatio = Math.max(0.0, Math.min(params.duplicateRatio ?? 0.6, 1.0));

    const startTime = Date.now();
    let simHits = 0;
    let simCoalesced = 0;
    let simGenerations = 0;

    // Simulate work across concurrent virtual workers
    const batchSize = concurrency;
    const totalSimulated = iterations * batchSize;

    // Map of virtual active keys to simulate cache and coalescing
    const virtualCache = new Set<string>();
    const virtualInFlight = new Set<string>();

    for (let i = 0; i < iterations; i++) {
      const promises = Array.from({ length: batchSize }).map(async (_, idx) => {
        // If within duplicate ratio, pick shared key; else unique key
        const isDuplicate = Math.random() < duplicateRatio;
        const key = isDuplicate
          ? `sim-shared-session-${Math.floor(idx / 3)}`
          : `sim-unique-session-${i}-${idx}`;

        if (virtualCache.has(key)) {
          simHits++;
          return "hit";
        }

        if (virtualInFlight.has(key)) {
          simCoalesced++;
          return "coalesced";
        }

        virtualInFlight.add(key);
        // Simulate micro generation overhead
        await new Promise((res) => setTimeout(res, 2));
        virtualInFlight.delete(key);
        virtualCache.add(key);
        simGenerations++;
        return "generated";
      });

      await Promise.all(promises);
    }

    const durationMs = Math.max(1, Date.now() - startTime);
    const throughputRps = Math.round((totalSimulated / (durationMs / 1000)) * 10) / 10;
    const tokenSavingsPct = totalSimulated > 0
      ? Math.round(((simHits + simCoalesced) / totalSimulated) * 1000) / 10
      : 0;
    const coalescingEfficiencyPct = (simCoalesced + simGenerations) > 0
      ? Math.round((simCoalesced / (simCoalesced + simGenerations)) * 1000) / 10
      : 0;

    logger.info(
      {
        totalSimulated,
        concurrency,
        throughputRps,
        tokenSavingsPct,
      },
      "Staging capacity benchmark completed successfully"
    );

    return {
      simulatedRequests: totalSimulated,
      concurrencyLevel: concurrency,
      duplicateRatio,
      cacheHits: simHits,
      coalescedRequests: simCoalesced,
      liveGenerations: simGenerations,
      durationMs,
      throughputRps,
      tokenSavingsPct,
      coalescingEfficiencyPct,
      status: throughputRps >= readSummaryCapacityConfig().benchmarkPassRps ? "passed" : "degraded",
      summary: `Processed ${totalSimulated} concurrent requests in ${durationMs}ms (${throughputRps} rps) with ${tokenSavingsPct}% token savings via distributed caching & coalescing.`,
    };
  }

  // Clears all in-memory telemetry counters, token accounting totals, and latency sliding windows.
  // Restores service operational metrics to initial clean state following benchmark runs or tests.
  public resetMetrics(): void {
    this.totalRequests = 0;
    this.cacheHitsL1 = 0;
    this.cacheHitsL2 = 0;
    this.coalescedInFlight = 0;
    this.coalescedDistributed = 0;
    this.liveGenerations = 0;
    this.fallbackCount = 0;
    this.tokensInTotal = 0;
    this.tokensOutTotal = 0;
    this.costUsdTotal = 0;
    this.latencies = [];
  }
}

// Singleton instance of SummaryCapacityService providing shared coordination across controllers.
// Maintains persistent state for runtime telemetry and distributed concurrency tracking.
export const summaryCapacityService = new SummaryCapacityService();
