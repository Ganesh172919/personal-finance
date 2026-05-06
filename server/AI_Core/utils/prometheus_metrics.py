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

from prometheus_client import Counter, Histogram

# Buckets span from 5ms (fast deterministic responses) to 45s (LLM-heavy requests).
REQUEST_DURATION_MS = Histogram(
    "finwise_ai_core_request_duration_ms",
    "AI Core HTTP request duration in milliseconds",
    labelnames=["method", "path", "status"],
    buckets=(5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 45000),
)

LLM_CALLS_TOTAL = Counter(
    "finwise_ai_core_llm_calls_total",
    "Total upstream LLM calls made by AI Core",
)

FALLBACK_TOTAL = Counter(
    "finwise_ai_core_fallback_total",
    "Total fallback responses returned by AI Core",
    labelnames=["endpoint"],
)

