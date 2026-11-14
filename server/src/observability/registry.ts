/**
 * @fileoverview Shared Prometheus registry.
 *
 * Lives in its own module so `metrics.ts` (HTTP/AI request metrics) and
 * `platformMetrics.ts` (infrastructure metrics) register against the same
 * registry without a circular import.
 *
 * @module observability/registry
 */

import { Registry, collectDefaultMetrics } from "prom-client";
import { getEnv } from "../config/env";

// Custom registry isolates FinWise metrics from prom-client's global default one.
// Shared Prometheus registry instance isolating application metrics from default globals.
// Collects HTTP, AI, database, cache, and platform metrics across modules.
// Exposes scrape serialization without creating circular dependencies.
export const registry = new Registry();
// Initializes standard Node.js runtime metrics collection into custom registry.
// Prefixes process, heap, memory, and event loop metrics with finwise_ namespace.
// Samples runtime vitals automatically for operational performance tracking.
collectDefaultMetrics({ register: registry, prefix: "finwise_" });

/** True when METRICS_ENABLED=true; every recorder is a no-op otherwise. */
// Determines whether Prometheus metric instrumentation is active in configuration.
// Safely queries METRICS_ENABLED while swallowing environment access exceptions.
// Enables all metric recorder functions to short-circuit when disabled.
export const isMetricsEnabled = (): boolean => {
  try {
    return getEnv().METRICS_ENABLED;
  } catch {
    return false;
  }
};
