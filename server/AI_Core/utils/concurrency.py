"""
concurrency.py - Bounded offload of blocking work from async handlers
=====================================================================

The LangGraph workflow, OCR and tool simulation are synchronous.  Running them
inside ``async def`` handlers blocks the event loop (so ``/health`` stalls
behind one slow request).  ``WorkGate`` fixes both halves of that problem:

* **Admission control** - at most ``AI_CORE_MAX_INFLIGHT`` heavy requests run
  per process.  When the gate is full the caller gets ``503`` with
  ``Retry-After`` immediately (load shedding) instead of queueing unboundedly;
  the gateway holds the real bounded queue and retries.
* **Offload** - admitted work runs in a worker thread via
  ``anyio.to_thread.run_sync`` which copies ``contextvars`` so request-scoped
  metrics stay attached to the request.

The gate counter is the effective ``CapacityLimiter``: in-flight work can never
exceed it, so it is always below anyio's default thread-pool size.
"""

from __future__ import annotations

import os
import threading
from contextlib import asynccontextmanager
from functools import partial
from typing import Any, Callable, Dict, TypeVar

import anyio
from fastapi import HTTPException

from utils.prometheus_metrics import INFLIGHT_GAUGE, SHED_TOTAL

T = TypeVar("T")


# Parses integer environment variable with default value and minimum bound.
# Safely handles parsing errors and invalid values by returning fallback.
# Returns bounded integer configuration value for concurrency limits.
def _env_int(name: str, default: int, minimum: int = 1) -> int:
    try:
        return max(minimum, int(os.getenv(name, "") or default))
    except ValueError:
        return default


# Process-wide concurrency limiter and admission controller for heavy tasks.
# Prevents event loop blocking by shedding excess load with HTTP 503 errors.
# Monitors in-flight worker threads and exposes Prometheus telemetry metrics.
class WorkGate:
    """Process-wide admission gate for heavy (blocking) work."""

    # Initializes WorkGate with configurable inflight limit and retry intervals.
    # Reads environment variables for default capacity if not explicitly given.
    # Sets up internal thread synchronization lock and operational counters.
    def __init__(self, max_inflight: int | None = None, retry_after_seconds: int | None = None):
        self.max_inflight = max_inflight or _env_int("AI_CORE_MAX_INFLIGHT", 6)
        self.retry_after_seconds = retry_after_seconds or _env_int("AI_CORE_SHED_RETRY_AFTER_SECONDS", 2)
        self._lock = threading.Lock()
        self._inflight = 0
        self._shed = 0
        self._completed = 0

    # -- admission ---------------------------------------------------------
    # Attempts to acquire execution slot without blocking or raising exceptions.
    # Checks active inflight counter against maximum capacity threshold.
    # Returns true if slot was reserved or false if capacity is exhausted.
    def try_claim(self) -> bool:
        with self._lock:
            if self._inflight >= self.max_inflight:
                self._shed += 1
                SHED_TOTAL.inc()
                return False
            self._inflight += 1
            INFLIGHT_GAUGE.set(self._inflight)
            return True

    # Claims concurrency execution slot or raises HTTP 503 Service Unavailable.
    # Injects standard Retry-After header for clients when load shedding occurs.
    # Ensures only admitted work proceeds to backend execution threads.
    def claim(self) -> None:
        """Claim a slot or raise ``503`` (load shed)."""
        if not self.try_claim():
            raise HTTPException(
                status_code=503,
                detail="AI Core is at capacity; retry shortly",
                headers={"Retry-After": str(self.retry_after_seconds)},
            )

    # Releases claimed execution slot and decrements active inflight count.
    # Thread-safely updates completed task counter and Prometheus gauge.
    # Restores capacity for subsequent queued or incoming requests.
    def release(self) -> None:
        with self._lock:
            self._inflight = max(0, self._inflight - 1)
            self._completed += 1
            INFLIGHT_GAUGE.set(self._inflight)

    # -- execution ---------------------------------------------------------
    # Async context manager scoping slot claim across an arbitrary code block.
    # Automatically reserves slot on entry and guarantees release on exit.
    # Yields active gate instance for managing long-lived asynchronous tasks.
    @asynccontextmanager
    async def slot(self):
        """Hold a slot for an arbitrary async scope (e.g. an SSE stream)."""
        self.claim()
        try:
            yield self
        finally:
            self.release()

    # Executes synchronous callable in thread pool under bounded gate admission.
    # Claims capacity slot, offloads work to worker thread, and frees slot.
    # Returns computed result of wrapped function or re-raises exceptions.
    async def run(self, fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        """Claim a slot, run ``fn`` in a worker thread, release the slot."""
        self.claim()
        try:
            return await offload(fn, *args, **kwargs)
        finally:
            self.release()

    # -- introspection -----------------------------------------------------
    # Returns current number of active in-flight execution slots claimed.
    # Provides atomic read of internal inflight counter state.
    # Returns integer count of tasks currently executing under gate.
    @property
    def inflight(self) -> int:
        return self._inflight

    # Returns dictionary snapshot of gate admission and load-shedding counters.
    # Acquires lock to safely read inflight, max capacity, and totals.
    # Returns telemetry dictionary for administrative status monitoring.
    def stats(self) -> Dict[str, int]:
        with self._lock:
            return {
                "inflight": self._inflight,
                "max_inflight": self.max_inflight,
                "shed_total": self._shed,
                "completed_total": self._completed,
            }


# Runs blocking synchronous function inside AnyIO worker thread pool.
# Preserves active context variables across thread execution boundary.
# Returns asynchronous future resolving to return value of function.
async def offload(fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Run blocking ``fn`` in a worker thread (context-preserving, no gate)."""
    return await anyio.to_thread.run_sync(partial(fn, *args, **kwargs))


_gate: WorkGate | None = None
_gate_lock = threading.Lock()


# Returns process-wide singleton WorkGate admission controller instance.
# Lazily initializes singleton instance under thread-safe double-checked lock.
# Returns shared WorkGate instance managing system-wide request load.
def get_work_gate() -> WorkGate:
    global _gate
    if _gate is None:
        with _gate_lock:
            if _gate is None:
                _gate = WorkGate()
    return _gate


# Replaces or resets singleton WorkGate instance for isolated testing.
# Thread-safely updates global gate pointer to supplied instance or None.
# Facilitates deterministic unit testing across mock concurrency states.
def reset_work_gate(gate: WorkGate | None = None) -> None:
    """Replace the singleton (tests)."""
    global _gate
    with _gate_lock:
        _gate = gate
