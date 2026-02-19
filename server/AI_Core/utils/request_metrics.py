"""
Request-scoped metrics for AI Core processing.
Uses contextvars so parallel FastAPI requests stay isolated.
"""

from contextvars import ContextVar
from typing import Any, Dict, Optional

from config import settings

_request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id_ctx", default=None)
_llm_call_count_ctx: ContextVar[int] = ContextVar("llm_call_count_ctx", default=0)
_llm_tokens_in_ctx: ContextVar[int] = ContextVar("llm_tokens_in_ctx", default=0)
_llm_tokens_out_ctx: ContextVar[int] = ContextVar("llm_tokens_out_ctx", default=0)
_llm_cost_usd_ctx: ContextVar[float] = ContextVar("llm_cost_usd_ctx", default=0.0)
_llm_models_ctx: ContextVar[list[str]] = ContextVar("llm_models_ctx", default=[])


def begin_request_metrics(request_id: Optional[str]) -> None:
    """Initialize request-scoped metrics for a new request."""
    _request_id_ctx.set(request_id)
    _llm_call_count_ctx.set(0)
    _llm_tokens_in_ctx.set(0)
    _llm_tokens_out_ctx.set(0)
    _llm_cost_usd_ctx.set(0.0)
    _llm_models_ctx.set([])


def record_llm_call() -> None:
    """Increment upstream LLM call count for the current request."""
    current = _llm_call_count_ctx.get()
    _llm_call_count_ctx.set(current + 1)


def record_llm_usage(
    *,
    model: Optional[str] = None,
    prompt_tokens: Optional[int] = None,
    completion_tokens: Optional[int] = None,
    total_tokens: Optional[int] = None,
) -> None:
    """
    Record token/cost usage for the current request scope.

    Args:
        model: Model identifier used for this call.
        prompt_tokens: Input tokens for this call.
        completion_tokens: Output tokens for this call.
        total_tokens: Total tokens for this call (optional; derived if missing).
    """

    prompt = int(prompt_tokens or 0)
    completion = int(completion_tokens or 0)
    total = int(total_tokens or (prompt + completion))

    if prompt < 0:
        prompt = 0
    if completion < 0:
        completion = 0
    if total < 0:
        total = 0

    _llm_tokens_in_ctx.set(_llm_tokens_in_ctx.get() + prompt)
    _llm_tokens_out_ctx.set(_llm_tokens_out_ctx.get() + completion)

    models = list(_llm_models_ctx.get() or [])
    if model:
        model_clean = str(model).strip()
        if model_clean and model_clean not in models:
            models.append(model_clean)
            _llm_models_ctx.set(models)

    in_rate = float(getattr(settings, "LLM_COST_USD_PER_1K_INPUT_TOKENS", 0.0) or 0.0)
    out_rate = float(getattr(settings, "LLM_COST_USD_PER_1K_OUTPUT_TOKENS", 0.0) or 0.0)
    if in_rate > 0 or out_rate > 0:
        delta_cost = (prompt / 1000.0) * in_rate + (completion / 1000.0) * out_rate
        _llm_cost_usd_ctx.set(_llm_cost_usd_ctx.get() + float(delta_cost))


def get_llm_call_count() -> int:
    """Return total LLM calls made in the current request scope."""
    return _llm_call_count_ctx.get()


def get_llm_usage() -> Dict[str, Any]:
    """Return request-scoped LLM token and cost totals."""
    tokens_in = int(_llm_tokens_in_ctx.get() or 0)
    tokens_out = int(_llm_tokens_out_ctx.get() or 0)
    cost_usd = float(_llm_cost_usd_ctx.get() or 0.0)
    models = list(_llm_models_ctx.get() or [])

    return {
        "tokens_in": max(0, tokens_in),
        "tokens_out": max(0, tokens_out),
        "total_tokens": max(0, tokens_in + tokens_out),
        "cost_usd": max(0.0, cost_usd),
        "models": models,
    }


def get_request_id() -> Optional[str]:
    """Return the current request id from context, if set."""
    return _request_id_ctx.get()
