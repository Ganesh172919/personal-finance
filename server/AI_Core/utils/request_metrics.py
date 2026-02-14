"""
Request-scoped metrics for AI Core processing.
Uses contextvars so parallel FastAPI requests stay isolated.
"""

from contextvars import ContextVar
from typing import Optional

_request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id_ctx", default=None)
_llm_call_count_ctx: ContextVar[int] = ContextVar("llm_call_count_ctx", default=0)


def begin_request_metrics(request_id: Optional[str]) -> None:
    """Initialize request-scoped metrics for a new request."""
    _request_id_ctx.set(request_id)
    _llm_call_count_ctx.set(0)


def record_llm_call() -> None:
    """Increment upstream LLM call count for the current request."""
    current = _llm_call_count_ctx.get()
    _llm_call_count_ctx.set(current + 1)


def get_llm_call_count() -> int:
    """Return total LLM calls made in the current request scope."""
    return _llm_call_count_ctx.get()


def get_request_id() -> Optional[str]:
    """Return the current request id from context, if set."""
    return _request_id_ctx.get()
