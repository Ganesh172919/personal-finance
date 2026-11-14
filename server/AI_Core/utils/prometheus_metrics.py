"""
prometheus_metrics.py - Prometheus Metrics Definitions
=======================================================

Defines the Prometheus metrics (Counters and Histograms) used for
observability in the AI Core service.  These metrics are scraped by
a Prometheus server and visualised in Grafana or similar tools.

Metrics defined
---------------
- ``REQUEST_DURATION_MS`` -- histogram of HTTP request durations,
  labelled by method, path, and status code.
- ``LLM_CALLS_TOTAL`` -- counter of total upstream LLM API calls.
- ``FALLBACK_TOTAL`` -- counter of fallback responses returned,
  labelled by endpoint (e.g. "process", "process_stream").
"""

from prometheus_client import Counter, Gauge, Histogram

# Buckets span from 5ms (fast deterministic responses) to 45s (LLM-heavy requests).
# Prometheus histogram tracking HTTP request processing duration in milliseconds.
# Labels metrics by HTTP method, request path, and resulting response status code.
# Configured with logarithmic bucket distribution spanning 5ms to 45 seconds.
REQUEST_DURATION_MS = Histogram(
    "finwise_ai_core_request_duration_ms",
    "AI Core HTTP request duration in milliseconds",
    labelnames=["method", "path", "status"],
    buckets=(5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 45000),
)

# Prometheus counter recording cumulative count of upstream LLM model invocations.
# Tracks total outbound requests dispatched to external AI providers.
# Provides baseline throughput telemetry across entire AI Core infrastructure.
LLM_CALLS_TOTAL = Counter(
    "finwise_ai_core_llm_calls_total",
    "Total upstream LLM calls made by AI Core",
)

# Prometheus counter recording total deterministic fallback responses served.
# Labels fallback events by target endpoint to identify degraded workflows.
# Measures provider failure frequency and offline fallback activation rates.
FALLBACK_TOTAL = Counter(
    "finwise_ai_core_fallback_total",
    "Total fallback responses returned by AI Core",
    labelnames=["endpoint"],
)


# Prometheus gauge tracking currently active concurrent AI Core requests.
# Monitors real-time concurrent execution load within current worker process.
# Informs concurrency throttles and dynamic load-shedding safeguards.
INFLIGHT_GAUGE = Gauge(
    "finwise_ai_core_inflight",
    "Heavy AI Core requests currently running in this process",
)

# Prometheus counter tracking total requests rejected due to concurrency limits.
# Records HTTP 503 load-shedding events when internal work gate reaches capacity.
# Provides critical alerting telemetry indicating backend capacity saturation.
SHED_TOTAL = Counter(
    "finwise_ai_core_shed_total",
    "Requests rejected with 503 because the work gate was full",
)

# Prometheus counter tracking LLM cache lookups categorized by outcome.
# Labels metric events by cache result including hit, miss, and coalesced.
# Measures caching efficiency and upstream request deduplication ratios.
LLM_CACHE_TOTAL = Counter(
    "finwise_ai_core_llm_cache_total",
    "LLM response cache lookups by outcome (hit, miss, coalesced, skip)",
    labelnames=["outcome"],
)

# Prometheus counter tracking requests rate-limited locally by token buckets.
# Increments when outbound model requests exceed configured bucket allowances.
# Highlights local throttling events resolved through fallback paths.
LLM_RATE_LIMITED_TOTAL = Counter(
    "finwise_ai_core_llm_rate_limited_total",
    "LLM calls refused locally by the token bucket (served by deterministic fallback)",
)


# --- Observability additions (P5) -------------------------------------------
# Prometheus histogram recording execution latencies of individual agent nodes.
# Labels latency measurements by agent name across workflow graph execution.
# Identifies latency bottlenecks across specialized sub-agent pipelines.
NODE_DURATION_MS = Histogram(
    "finwise_ai_core_node_duration_ms",
    "Per-agent (graph node) execution time in milliseconds",
    labelnames=["agent"],
    buckets=(5, 25, 100, 250, 500, 1000, 2500, 5000, 10000, 25000),
)

# Prometheus counter recording HTTP 429 quota exhaustion events from providers.
# Labels rate-limit errors by provider name to isolate upstream bottlenecks.
# Triggers key pool rotation and provider failover alerts upon saturation.
LLM_PROVIDER_429_TOTAL = Counter(
    "finwise_ai_core_llm_provider_429_total",
    "Upstream provider HTTP 429 (quota) responses by provider",
    labelnames=["provider"],
)

# Prometheus counter recording token consumption across models and directions.
# Labels token metrics by model identifier and direction as input or output.
# Provides granular usage telemetry for operational tracking and capacity planning.
LLM_TOKENS_TOTAL = Counter(
    "finwise_ai_core_llm_tokens_total",
    "LLM tokens consumed by model and direction (in/out)",
    labelnames=["model", "direction"],
)

# Prometheus counter estimating cumulative financial expenditure in US dollars.
# Labels calculated cost metrics by model identifier based on catalog pricing.
# Tracks real-time LLM inference spending across all active agents.
LLM_COST_USD_TOTAL = Counter(
    "finwise_ai_core_llm_cost_usd_total",
    "Estimated LLM spend in USD by model",
    labelnames=["model"],
)
