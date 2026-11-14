"""
registry/context.py - Per-request learning context
==================================================

A ``ContextVar`` carries the tenant, request id and the artifact versions that
were actually served for the current request.  Sub-agent worker threads are
submitted with ``copy_context().run`` so they share the same mutable object.

The context is what lets ``registry.get_prompt`` pick the org's active/canary
artifact and lets the run store record which versions produced an answer.
"""

from __future__ import annotations

import threading
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Dict, Iterator, Optional


# Encapsulates contextual learning and execution metadata for a request.
# Tracks tenant scope, served artifacts, safety verifications, and LLM calls.
# Provides thread-safe mutations across concurrent sub-agent worker threads.
@dataclass
class LearningContext:
    org_id: str = ""
    user_id: str = ""
    request_id: str = ""
    opt_out: bool = False
    agent_output_id: str = ""
    # artifact id -> {"kind", "key", "version", "scope", "status"}
    artifacts: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    # verification outcomes from the number-safety guard: list of bools
    verifications: list = field(default_factory=list)
    cache_hit: bool = False
    fallback_used: bool = False
    # one entry per upstream LLM call: {taskClass, provider, model, latencyMs, tokens}
    llm_calls: list = field(default_factory=list)
    nodes: list = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    # Records an artifact version accessed during request processing.
    # Acquires lock to safely append artifact metadata dictionary.
    # Ensures auditability of prompt and routing configurations served.
    def note_artifact(self, artifact_id: str, meta: Dict[str, Any]) -> None:
        with self._lock:
            self.artifacts[artifact_id] = meta

    # Appends boolean outcome from number safety verification checks.
    # Safely records validation result within thread-synchronized block.
    # Updates tracking metrics for prompt safety and guardrail reliability.
    def note_verification(self, passed: bool) -> None:
        with self._lock:
            self.verifications.append(bool(passed))

    # Records telemetry metadata for individual upstream model invocation.
    # Enforces maximum capacity bound on tracked LLM call records.
    # Captures provider, token metrics, and execution latency details.
    def note_llm_call(self, call: Dict[str, Any]) -> None:
        with self._lock:
            if len(self.llm_calls) < 64:
                self.llm_calls.append(call)

    # Logs execution of graph workflow node within current request context.
    # Appends node name while enforcing capacity limit on execution list.
    # Enables auditing and tracing of graph traversal sequence paths.
    def note_node(self, name: str) -> None:
        with self._lock:
            if len(self.nodes) < 64:
                self.nodes.append(name)

    # Computes aggregated telemetry summary across recorded LLM calls.
    # Calculates total prompt tokens, completion tokens, and latency.
    # Returns formatted dictionary describing dominant model and usage.
    def llm_summary(self) -> Dict[str, Any]:
        """Tokens / latency / dominant provider+model across the request's LLM calls."""
        with self._lock:
            calls = list(self.llm_calls)
        prompt = sum(int(c.get("promptTokens", 0)) for c in calls)
        completion = sum(int(c.get("completionTokens", 0)) for c in calls)
        last = calls[-1] if calls else {}
        return {
            "calls": len(calls),
            "tokens": {"prompt": prompt, "completion": completion, "total": prompt + completion},
            "latencyMs": sum(float(c.get("latencyMs", 0.0)) for c in calls),
            "provider": last.get("provider", ""),
            "model": last.get("model", ""),
            "taskClass": last.get("taskClass", ""),
        }

    # Aggregates safety verification statistics recorded during request.
    # Counts total checks performed and tallies verification failures.
    # Returns summary dictionary reflecting overall verification status.
    def verification_summary(self) -> Dict[str, Any]:
        with self._lock:
            checks = list(self.verifications)
        if not checks:
            return {"checked": 0, "failures": 0, "passed": None}
        failures = sum(1 for ok in checks if not ok)
        return {"checked": len(checks), "failures": failures, "passed": failures == 0}

    # Generates comma-separated version identifiers for served artifacts.
    # Distinguishes prompt artifacts from routing configuration versions.
    # Returns dictionary containing version tokens and artifact identifier list.
    def versions(self) -> Dict[str, Any]:
        """``promptVersion`` / ``routingVersion`` tokens for the response."""
        with self._lock:
            items = list(self.artifacts.items())
        prompt_ids = sorted(aid for aid, m in items if m.get("kind") in ("prompt", "exemplar"))
        routing_ids = sorted(aid for aid, m in items if m.get("kind") == "routing")
        return {
            "promptVersion": ",".join(prompt_ids) if prompt_ids else "default",
            "routingVersion": ",".join(routing_ids) if routing_ids else "default",
            "artifactIds": sorted(aid for aid, _ in items),
        }


_ctx: ContextVar[Optional[LearningContext]] = ContextVar("learning_ctx", default=None)


# Initializes new LearningContext instance bound to current ContextVar.
# Populates tenant identifiers, request ID, and opt-out preferences.
# Returns configured context object active for downstream operations.
def begin_context(
    org_id: str = "",
    user_id: str = "",
    request_id: str = "",
    *,
    opt_out: bool = False,
    agent_output_id: str = "",
) -> LearningContext:
    ctx = LearningContext(
        org_id=(org_id or "").strip(),
        user_id=(user_id or "").strip(),
        request_id=request_id or "",
        opt_out=bool(opt_out),
        agent_output_id=agent_output_id or "",
    )
    _ctx.set(ctx)
    return ctx


# Retrieves active LearningContext bound to current execution thread.
# Reads underlying ContextVar carrying request-scoped learning data.
# Returns current LearningContext instance or None if not initialized.
def current_context() -> Optional[LearningContext]:
    return _ctx.get()


# Clears active LearningContext from thread-local ContextVar storage.
# Resets context pointer to None to prevent cross-request leakage.
# Ensures clean execution environment for subsequent inbound requests.
def clear_context() -> None:
    _ctx.set(None)


# Provides context manager interface for scoping request LearningContext.
# Sets active context on entry and guarantees cleanup upon block exit.
# Yields populated LearningContext instance for scoped code execution.
@contextmanager
def learning_context(
    org_id: str = "", user_id: str = "", request_id: str = "", *, opt_out: bool = False
) -> Iterator[LearningContext]:
    ctx = LearningContext(
        org_id=(org_id or "").strip(), user_id=(user_id or "").strip(), request_id=request_id or "", opt_out=opt_out
    )
    token = _ctx.set(ctx)
    try:
        yield ctx
    finally:
        _ctx.reset(token)


# Records outcome of guardrail verification in current request context.
# Accesses active LearningContext instance if present in thread scope.
# Delegates update to note_verification method of current context.
def record_verification(passed: bool) -> None:
    """Called by the agents right after the number-safety guard decides."""
    ctx = _ctx.get()
    if ctx is not None:
        ctx.note_verification(passed)


# Flags current request context as having served response from cache.
# Locates thread-scoped LearningContext instance if one exists.
# Updates cache hit boolean attribute to true for metric tracking.
def record_cache_hit() -> None:
    ctx = _ctx.get()
    if ctx is not None:
        ctx.cache_hit = True


# Captures upstream LLM invocation metrics into active request context.
# Extracts token consumption from response metadata and calculates latency.
# Records model parameters, provider details, and task classification.
def record_llm_call(
    *, task_class: str = "", provider: str = "", model: str = "", latency_ms: float = 0.0, response: Any = None
) -> None:
    """Called by the LLM wrapper after each successful upstream call."""
    ctx = _ctx.get()
    if ctx is None:
        return
    usage = getattr(response, "usage_metadata", None) or {}
    try:
        prompt = int(usage.get("input_tokens", usage.get("prompt_tokens", 0)) or 0)
        completion = int(usage.get("output_tokens", usage.get("completion_tokens", 0)) or 0)
    except Exception:
        prompt = completion = 0
    ctx.note_llm_call(
        {
            "taskClass": task_class,
            "provider": provider,
            "model": model,
            "latencyMs": float(latency_ms or 0.0),
            "promptTokens": prompt,
            "completionTokens": completion,
        }
    )


# Flags active request context as having utilized fallback routing path.
# Inspects current thread-local ContextVar for active learning context.
# Sets fallback_used boolean attribute to true for telemetry reporting.
def record_fallback() -> None:
    ctx = _ctx.get()
    if ctx is not None:
        ctx.fallback_used = True


# Appends graph workflow node execution record to current request context.
# Safely ignores invocation if no active learning context is configured.
# Delegates node logging to active LearningContext note_node method.
def record_node(name: str) -> None:
    ctx = _ctx.get()
    if ctx is not None:
        ctx.note_node(name)
