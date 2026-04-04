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
    get_last_route_snapshot,
)
from .provider_registry import (
    list_providers,
    get_provider_config,
    create_chat_model,
    PROVIDER_CONFIGS,
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
from .key_pool import (
    KeyPool,
    KeyPoolConfig,
    KeyEntry,
    KeyHealth,
    KeyStatus,
    get_key_pool,
    get_all_key_pools,
    reset_all_key_pools,
)
from .model_catalog import (
    ModelEntry,
    ModelCapability,
    SpeedTier,
    CostTier,
    ReasoningStrength,
    get_model_by_id,
    get_all_models,
    get_enabled_models,
    get_models_by_provider,
    get_models_for_task,
    get_fallback_chain,
    get_cheapest_model_for_task,
    get_fastest_model_for_task,
    get_best_model_for_task,
    get_catalog_stats,
    MODEL_CATALOG,
)
from .model_health import (
    ModelHealthStatus,
    ModelHealthTracker,
    get_model_health_tracker,
    reset_model_health_tracker,
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
    "get_last_route_snapshot",
    # Provider Registry
    "list_providers",
    "get_provider_config",
    "create_chat_model",
    "PROVIDER_CONFIGS",
    # Request metrics
    "begin_request_metrics",
    "record_llm_call",
    "get_llm_call_count",
    "record_llm_usage",
    "get_llm_usage",
    "get_request_id",
    # Key Pool
    "KeyPool",
    "KeyPoolConfig",
    "KeyEntry",
    "KeyHealth",
    "KeyStatus",
    "get_key_pool",
    "get_all_key_pools",
    "reset_all_key_pools",
    # Model Catalog
    "ModelEntry",
    "ModelCapability",
    "SpeedTier",
    "CostTier",
    "ReasoningStrength",
    "get_model_by_id",
    "get_all_models",
    "get_enabled_models",
    "get_models_by_provider",
    "get_models_for_task",
    "get_fallback_chain",
    "get_cheapest_model_for_task",
    "get_fastest_model_for_task",
    "get_best_model_for_task",
    "get_catalog_stats",
    "MODEL_CATALOG",
    # Model health
    "ModelHealthStatus",
    "ModelHealthTracker",
    "get_model_health_tracker",
    "reset_model_health_tracker",
]
