from prometheus_client import Counter, Histogram

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

