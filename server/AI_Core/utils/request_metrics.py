"""
Request-scoped metrics for AI Core processing.
Uses contextvars so parallel FastAPI requests stay isolated.
"""

from contextlib import contextmanager
from contextvars import ContextVar
from threading import Lock
from typing import Any, Dict, Optional

from config import settings

_request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id_ctx", default=None)
class UsageMetrics:
    """Shared within one request's copied contexts, isolated from other requests."""

    def __init__(self):
        self.lock = Lock()
        self.calls = 0
        self.tokens_in = 0
        self.tokens_out = 0
        self.total_tokens = 0
        self.cost_usd = 0.0
        self.models = []
        self.cache_hits = 0

    def snapshot(self) -> Dict[str, Any]:
        with self.lock:
            return {"llm_calls": self.calls, "tokens_in": self.tokens_in, "tokens_out": self.tokens_out,
                    "total_tokens": self.total_tokens, "cost_usd": self.cost_usd,
                    "models": list(self.models), "cache_hits": self.cache_hits}


_request_metrics_ctx: ContextVar[Optional[UsageMetrics]] = ContextVar("request_metrics", default=None)
_agent_metrics_ctx: ContextVar[Optional[UsageMetrics]] = ContextVar("agent_metrics", default=None)


def _request_metrics() -> UsageMetrics:
    metrics = _request_metrics_ctx.get()
    if metrics is None:
        metrics = UsageMetrics()
        _request_metrics_ctx.set(metrics)
    return metrics


def _active_metrics():
    request = _request_metrics()
    agent = _agent_metrics_ctx.get()
    return (request, agent) if agent is not None and agent is not request else (request,)


@contextmanager
def capture_agent_metrics():
    metrics = UsageMetrics()
    token = _agent_metrics_ctx.set(metrics)
    try:
        yield metrics
    finally:
        _agent_metrics_ctx.reset(token)


def record_cache_hit() -> None:
    metrics = _agent_metrics_ctx.get()
    if metrics is not None:
        with metrics.lock:
            metrics.cache_hits += 1


def begin_request_metrics(request_id: Optional[str]) -> None:
    """Initialize request-scoped metrics for a new request."""
    _request_id_ctx.set(request_id)
    _request_metrics_ctx.set(UsageMetrics())
    _agent_metrics_ctx.set(None)


def record_llm_call() -> None:
    """Increment upstream LLM call count for the current request."""
    for metrics in _active_metrics():
        with metrics.lock:
            metrics.calls += 1


def record_llm_usage(
    *,
    model: Optional[str] = None,
    prompt_tokens: Optional[int] = None,
    completion_tokens: Optional[int] = None,
    total_tokens: Optional[int] = None,
    cost_usd: Optional[float] = None,
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

    in_rate = float(getattr(settings, "LLM_COST_USD_PER_1K_INPUT_TOKENS", 0.0) or 0.0)
    out_rate = float(getattr(settings, "LLM_COST_USD_PER_1K_OUTPUT_TOKENS", 0.0) or 0.0)
    delta_cost = max(0.0, float(cost_usd)) if cost_usd is not None else max(
        0.0, prompt / 1000.0 * in_rate + completion / 1000.0 * out_rate
    )
    for metrics in _active_metrics():
        with metrics.lock:
            metrics.tokens_in += prompt
            metrics.tokens_out += completion
            metrics.total_tokens += max(total, prompt + completion)
            metrics.cost_usd += delta_cost
            if model and str(model).strip() not in metrics.models:
                metrics.models.append(str(model).strip())


def get_llm_call_count() -> int:
    """Return total LLM calls made in the current request scope."""
    return int(_request_metrics().snapshot()["llm_calls"])


def get_llm_usage() -> Dict[str, Any]:
    """Return request-scoped LLM token and cost totals."""
    metrics = _request_metrics().snapshot()
    return {key: metrics[key] for key in ("tokens_in", "tokens_out", "total_tokens", "cost_usd", "models")}


def get_request_id() -> Optional[str]:
    """Return the current request id from context, if set."""
    return _request_id_ctx.get()
