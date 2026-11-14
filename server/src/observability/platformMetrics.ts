/**
 * @fileoverview Platform (infrastructure) Prometheus metrics.
 *
 * Complements `metrics.ts` (HTTP + AI request metrics, AI admission queue and
 * breaker gauges) with the signals the SLO dashboards and runbooks need:
 *
 *   - SSE connections (per kind)                 -> trackSseConnection()
 *   - Event-bus delivery lag                     -> observeEventBusLag()
 *   - Cache hits per layer                       -> recordCacheLayer()
 *   - Tokens / cost per org + model              -> recordLlmUsage()
 *   - Canary / rollback counters                 -> recordCanaryEvent()
 *   - Dead-letter queue size                     -> registerDlqSizeProvider()
 *   - Mongo pool: checked-out, wait queue, fails -> auto-attached on connect
 *   - Redis availability                         -> sampled on each scrape
 *
 * Owning modules call the small recorder functions below (no-ops when
 * METRICS_ENABLED=false). Gauges that are pulled (DLQ, Redis) are sampled
 * lazily at scrape time through prom-client `collect()` callbacks, so they
 * cost nothing between scrapes.
 *
 * Cardinality: the org label on token/cost counters is OFF by default (value
 * "all"); set METRICS_ORG_LABELS=true to emit one series per org (about
 * orgs x models series; fine up to a few thousand orgs).
 *
 * @module observability/platformMetrics
 */

import mongoose from "mongoose";
import { Counter, Gauge, Histogram } from "prom-client";
import { getRedis } from "../config/redis";
import { logger } from "../config/logger";
import { isMetricsEnabled, registry } from "./registry";

// ── SSE connections ──────────────────────────────────────────────────

// Prometheus gauge tracking currently active Server-Sent Events (SSE) connections.
// Labeled by stream category including events, AI streaming, or other event feeds.
// Allows monitoring open connection load on server worker replicas.
const sseConnections = new Gauge({
  name: "finwise_sse_connections",
  help: "Open Server-Sent-Event streams on this replica",
  labelNames: ["kind"] as const,
  registers: [registry],
});

/**
 * Marks an SSE stream as open and returns an idempotent closer. Call the
 * closer from the stream's cleanup handler (safe to call more than once).
 */
// Registers an active Server-Sent Events stream and yields an idempotent cleanup closure.
// Increments connection gauge on invocation and decrements gauge when stream finishes.
// Prevents double-decrement issues through an internal closed latch variable.
export const trackSseConnection = (kind: "events" | "ai_stream" | "other" = "events"): (() => void) => {
  if (!isMetricsEnabled()) return () => undefined;
  sseConnections.inc({ kind });
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    sseConnections.dec({ kind });
  };
};

// ── Event bus lag ────────────────────────────────────────────────────

// Histogram measuring delivery latency from event publish to local subscriber delivery.
// Labeled by the underlying event bus transport such as memory or Redis channels.
// Defines latency buckets ranging from 1 millisecond up to 5 seconds.
const eventBusLagMs = new Histogram({
  name: "finwise_event_bus_lag_ms",
  help: "Delay between an event being published and delivered to a local subscriber",
  labelNames: ["bus"] as const,
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000],
  registers: [registry],
});

/** Records publish-to-delivery lag for an event-bus implementation ("memory" | "redis"). */
// Observes event publication-to-delivery elapsed time for event-bus architectures.
// Validates finite positive latency numbers before updating the latency histogram.
// Skips recording when metrics collection is globally disabled in configuration.
export const observeEventBusLag = (params: { bus: string; lagMs: number }) => {
  if (!isMetricsEnabled() || !Number.isFinite(params.lagMs) || params.lagMs < 0) return;
  eventBusLagMs.observe({ bus: params.bus }, params.lagMs);
};

// ── Cache layers ─────────────────────────────────────────────────────

// Counter tracking multi-tier cache resolution events across all application caches.
// Labeled by cache name, storage layer tier, and result (hit, miss, or coalesced).
// Enables granular visibility into cache hierarchy performance and efficiency.
const cacheLayerTotal = new Counter({
  name: "finwise_cache_layer_total",
  help: "Cache lookups by cache name, layer (l1_memory | l2_redis | mongo | llm) and result",
  labelNames: ["cache", "layer", "result"] as const,
  registers: [registry],
});

// TypeScript union type representing supported caching architecture tiers.
// Covers in-memory L1 cache, Redis L2 cache, MongoDB store, and LLM cache.
// Used for type-safe cache layer metric recording across services.
export type CacheLayer = "l1_memory" | "l2_redis" | "mongo" | "llm";

/** Records one lookup against a cache layer (result = hit | miss | coalesced). */
// Records an individual cache lookup attempt against a specific cache tier.
// Increments cache layer counter labeled by cache identifier, layer tier, and result status.
// Automatically exits when metrics collection is deactivated.
export const recordCacheLayer = (params: {
  cache: string;
  layer: CacheLayer;
  result: "hit" | "miss" | "coalesced";
}) => {
  if (!isMetricsEnabled()) return;
  cacheLayerTotal.inc({ cache: params.cache, layer: params.layer, result: params.result });
};

// ── LLM tokens and cost ──────────────────────────────────────────────

// Counter tracking cumulative LLM prompt and completion token consumption.
// Labeled by organization identifier, AI model name, and token direction.
// Provides granular token accounting for capacity planning and budget tracking.
const llmTokensTotal = new Counter({
  name: "finwise_llm_tokens_total",
  help: "LLM tokens by org, model and direction (in | out)",
  labelNames: ["org", "model", "direction"] as const,
  registers: [registry],
});

// Counter estimating total financial expenditure in US dollars from LLM API invocations.
// Labeled by tenant organization and specific model identifier.
// Allows real-time alerting on runaway model spend and cost anomaly detection.
const llmCostUsdTotal = new Counter({
  name: "finwise_llm_cost_usd_total",
  help: "Estimated LLM spend in USD by org and model",
  labelNames: ["org", "model"] as const,
  registers: [registry],
});

// Resolves tenant organization label for metric series cardinality management.
// Returns trimmed orgId when org-level metrics are enabled via environment configuration.
// Defaults to "all" to prevent high cardinality label proliferation when disabled.
const orgLabel = (orgId?: string): string => {
  if (process.env.METRICS_ORG_LABELS === "true" && orgId) return String(orgId).slice(0, 40);
  return "all";
};

/** Records tokens and cost for one AI response (call where AgentOutput/usage is persisted). */
// Records token counts and financial cost for a completed AI agent or LLM interaction.
// Increments token counters for ingress and egress streams as well as total cost counters.
// Sanitizes input values and truncates model identifiers to safe string lengths.
export const recordLlmUsage = (params: {
  orgId?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}) => {
  if (!isMetricsEnabled()) return;
  const org = orgLabel(params.orgId);
  const model = (params.model || "unknown").slice(0, 96);
  const tokensIn = Number(params.tokensIn);
  const tokensOut = Number(params.tokensOut);
  const costUsd = Number(params.costUsd);
  if (Number.isFinite(tokensIn) && tokensIn > 0) llmTokensTotal.inc({ org, model, direction: "in" }, tokensIn);
  if (Number.isFinite(tokensOut) && tokensOut > 0) llmTokensTotal.inc({ org, model, direction: "out" }, tokensOut);
  if (Number.isFinite(costUsd) && costUsd > 0) llmCostUsdTotal.inc({ org, model }, costUsd);
};

// ── Canary / rollback ────────────────────────────────────────────────

// Counter recording self-improvement model rollout and canary release events.
// Labeled by specific lifecycle event type and artifact classification.
// Fuels alerting logic detecting automated rollback events during canary phases.
const canaryEventsTotal = new Counter({
  name: "finwise_ai_canary_events_total",
  help: "Self-improvement rollout events (step_advanced | promoted | rollback | gate_blocked | probe_failed)",
  labelNames: ["event", "artifact_kind"] as const,
  registers: [registry],
});

// TypeScript union type specifying observable canary deployment event stages.
// Covers progressive step advances, promotions, rollbacks, gate blocks, and probe failures.
// Enforces type consistency across canary deployment instrumentation hooks.
export type CanaryEvent = "step_advanced" | "promoted" | "rollback" | "gate_blocked" | "probe_failed";

/** Counts a canary/rollout event; `rollback` is what the rollback alert fires on. */
// Records a canary deployment or automated self-improvement rollout milestone.
// Increments canary event counter labeled by event type and target artifact.
// Enables automated SLO dashboards to track model evolution and stability.
export const recordCanaryEvent = (params: { event: CanaryEvent; artifactKind?: string }) => {
  if (!isMetricsEnabled()) return;
  canaryEventsTotal.inc({ event: params.event, artifact_kind: params.artifactKind || "unknown" });
};

// ── Dead-letter queue size (pulled at scrape) ────────────────────────

// Type signature for asynchronous or synchronous dead-letter queue count providers.
// Returns numerical item count representing queued failed jobs or unhandled messages.
// Allows pluggable queue inspection functions without tight component coupling.
type DlqProvider = () => number | Promise<number>;
// In-memory registry mapping dead-letter queue names to provider supplier functions.
// Stores dynamic callback hooks queried during Prometheus scrape iterations.
// Enables modular registration of heterogeneous DLQ data sources.
const dlqProviders = new Map<string, DlqProvider>();

/** Registers a size source (e.g. in-memory DLQ, persistent dead_letter_jobs count). */
// Registers a dead-letter queue size inspection provider under a given queue name.
// Populates the internal dlqProviders map queried during metric collection.
// Permits background workers and service queues to contribute DLQ metrics dynamically.
export const registerDlqSizeProvider = (name: string, provider: DlqProvider) => {
  dlqProviders.set(name, provider);
};

// Default source: the in-memory fire-and-forget DLQ. Loaded lazily to avoid an import cycle.
// Registers default in-memory dead-letter queue count provider.
// Dynamically imports deadLetterQueue service to prevent circular dependencies.
// Sums failed job metrics across all queue buckets to report global DLQ depth.
registerDlqSizeProvider("in_memory", async () => {
  const { getDeadLetterStats } = await import("../services/deadLetterQueue");
  return Object.values(getDeadLetterStats()).reduce((sum, n) => sum + n, 0);
});

// Gauge tracking outstanding message counts retained across dead-letter queues.
// Scrapes registered DLQ providers dynamically on each Prometheus collect invocation.
// Categorizes unacknowledged failed items by queue name label.
new Gauge({
  name: "finwise_dlq_size",
  help: "Dead-lettered items by queue",
  labelNames: ["queue"] as const,
  registers: [registry],
  async collect() {
    this.reset();
    for (const [name, provider] of dlqProviders) {
      try {
        this.set({ queue: name }, Number(await provider()) || 0);
      } catch (err) {
        logger.debug({ err, queue: name, event: "dlq_metric_failed" }, "DLQ size provider failed");
      }
    }
  },
});

// ── Redis availability (pulled at scrape) ────────────────────────────

// Gauge reporting operational connectivity status of the primary Redis cache client.
// Evaluates connection readiness dynamically during scrape collection phases.
// Emits 1 when ready and 0 when configured but unready to indicate outage.
new Gauge({
  name: "finwise_redis_up",
  help: "1 when the gateway Redis client is ready, 0 when configured but not ready (absent when REDIS_URL is unset)",
  registers: [registry],
  collect() {
    const redis = getRedis();
    if (redis) this.set(redis.status === "ready" ? 1 : 0);
  },
});

// ── Mongo connection pool ────────────────────────────────────────────
// Driver CMAP events are attached once per MongoClient. Wait queue = checkouts
// started but not yet satisfied or failed.

// Gauge tracking current number of active checked-out MongoDB connection sockets.
// Updated in real-time by driver Connection Pool Monitoring (CMAP) events.
// Reveals database connection saturation and pool utilization levels.
const mongoPoolCheckedOut = new Gauge({
  name: "finwise_mongo_pool_checked_out",
  help: "Mongo connections currently checked out of the pool",
  registers: [registry],
});
// Gauge tracking the queue depth of database queries waiting for a free MongoDB connection.
// Signals connection starvation and connection pool exhaustion when elevated.
// Incremented upon checkout start and decremented when connection checkout finishes.
const mongoPoolWaiting = new Gauge({
  name: "finwise_mongo_pool_wait_queue",
  help: "Operations waiting for a Mongo pool connection (pool wait pressure)",
  registers: [registry],
});
// Counter recording total instances where MongoDB connection pool checkout timed out or failed.
// Labeled by checkout failure cause such as waitQueueTimeoutMS or connection errors.
// Serves as critical alert metric for database connectivity interruptions.
const mongoPoolCheckoutFailed = new Counter({
  name: "finwise_mongo_pool_checkout_failed_total",
  help: "Mongo pool checkouts that failed (waitQueueTimeoutMS or connection error)",
  labelNames: ["reason"] as const,
  registers: [registry],
});
// Histogram measuring the latency in milliseconds to acquire a connection from the pool.
// Measures elapsed wait time from checkout initiation until socket acquisition.
// Bucketed from 1 millisecond up to 5 seconds to detect pool contention latency.
const mongoPoolCheckoutWaitMs = new Histogram({
  name: "finwise_mongo_pool_checkout_wait_ms",
  help: "Time from checkout request to a connection being handed out (pool wait)",
  buckets: [1, 5, 25, 100, 500, 1000, 5000],
  registers: [registry],
});

// WeakSet tracking MongoDB client instances already wired with pool event listeners.
// Prevents duplicate event listener attachment when clients reconnect or reload.
// Holds weak references to allow garbage collection of defunct client instances.
const attachedClients = new WeakSet<object>();

/** Attaches CMAP pool listeners to a MongoClient once. Exported for tests. */
// Binds MongoDB Connection Pool Monitoring (CMAP) event hooks to a MongoClient.
// Listens for checkout start, checkout success, checkin, and checkout failure events.
// Updates Prometheus gauges and histograms reflecting connection pool pressure.
export const attachMongoPoolMetrics = (client: {
  on: (event: string, listener: (event: any) => void) => unknown;
}) => {
  if (attachedClients.has(client)) return;
  attachedClients.add(client);
  let checkedOut = 0;
  let waiting = 0;
  const startTimes: number[] = [];
  const publish = () => {
    mongoPoolCheckedOut.set(checkedOut);
    mongoPoolWaiting.set(waiting);
  };
  client.on("connectionCheckOutStarted", () => {
    waiting += 1;
    startTimes.push(Date.now());
    publish();
  });
  client.on("connectionCheckedOut", () => {
    waiting = Math.max(0, waiting - 1);
    checkedOut += 1;
    const startedAt = startTimes.shift();
    if (startedAt !== undefined) mongoPoolCheckoutWaitMs.observe(Date.now() - startedAt);
    publish();
  });
  client.on("connectionCheckedIn", () => {
    checkedOut = Math.max(0, checkedOut - 1);
    publish();
  });
  client.on("connectionCheckOutFailed", (event: { reason?: string }) => {
    waiting = Math.max(0, waiting - 1);
    startTimes.shift();
    mongoPoolCheckoutFailed.inc({ reason: String(event?.reason || "unknown").slice(0, 32) });
    publish();
  });
};

// Retrieves the active MongoDB client from Mongoose and attaches pool monitoring listeners.
// Safely swallows errors when connection is not yet fully initialized.
// Deferred execution triggers on subsequent connection events when needed.
const attachToMongoose = () => {
  try {
    attachMongoPoolMetrics(mongoose.connection.getClient() as any);
  } catch {
    // not connected yet; retried on the next "connected" event
  }
};

// Conditionally attaches MongoDB pool metric listeners if metrics collection is active.
// Registers event hook for subsequent connected events and checks current connection readyState.
// Ensures immediate pool instrumentation if the connection was established ahead of this module.
if (isMetricsEnabled()) {
  mongoose.connection.on("connected", attachToMongoose);
  if (mongoose.connection.readyState === 1) attachToMongoose();
}
