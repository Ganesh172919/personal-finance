"""
Utility functions and helpers
"""

from .helpers import (
    setup_logging,
    validate_email,
    format_currency,
    parse_financial_input,
    calculate_age,
    generate_report_id,
    safe_json_loads,
    calculate_months_between,
    ColorFormatter
)

from .rate_limiter import (
    TokenBucketRateLimiter,
    RetryHandler,
    RateLimitError,
    with_rate_limit_and_retry,
    get_rate_limiter_status,
    reset_rate_limiter
)

from .llm_wrapper import (
    RateLimitedLLM,
    AIProviderError,
    QuotaExceededError,
    AccessDeniedError,
    ModelNotFoundError,
    create_llm,
    get_fallback_response,
    FALLBACK_RESPONSES
)

from .request_metrics import (
    begin_request_metrics,
    record_llm_call,
    get_llm_call_count,
    record_llm_usage,
    get_llm_usage,
    get_request_id
)

__all__ = [
    # Helpers
    "setup_logging",
    "validate_email",
    "format_currency", 
    "parse_financial_input",
    "calculate_age",
    "generate_report_id",
    "safe_json_loads",
    "calculate_months_between",
    "ColorFormatter",
    # Rate limiting
    "TokenBucketRateLimiter",
    "RetryHandler",
    "RateLimitError",
    "with_rate_limit_and_retry",
    "get_rate_limiter_status",
    "reset_rate_limiter",
    # LLM Wrapper
    "RateLimitedLLM",
    "AIProviderError",
    "QuotaExceededError",
    "AccessDeniedError",
    "ModelNotFoundError",
    "create_llm",
    "get_fallback_response",
    "FALLBACK_RESPONSES",
    # Request metrics
    "begin_request_metrics",
    "record_llm_call",
    "get_llm_call_count",
    "record_llm_usage",
    "get_llm_usage",
    "get_request_id"
]
