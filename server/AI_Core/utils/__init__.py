"""
Utility functions and helpers
"""

from .helpers import (
    ColorFormatter,
    calculate_age,
    calculate_months_between,
    format_currency,
    generate_report_id,
    parse_financial_input,
    safe_json_loads,
    setup_logging,
    validate_email,
)
from .llm_wrapper import (
    FALLBACK_RESPONSES,
    AccessDeniedError,
    AIProviderError,
    ModelNotFoundError,
    QuotaExceededError,
    RateLimitedLLM,
    create_llm,
    get_fallback_response,
)
from .rate_limiter import (
    RateLimitError,
    RetryHandler,
    TokenBucketRateLimiter,
    get_rate_limiter_status,
    reset_rate_limiter,
    with_rate_limit_and_retry,
)
from .request_metrics import (
    begin_request_metrics,
    get_llm_call_count,
    get_llm_usage,
    get_request_id,
    record_llm_call,
    record_llm_usage,
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
