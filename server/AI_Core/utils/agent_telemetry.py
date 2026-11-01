"""
agent_telemetry.py - Per-Agent, Per-Model, and Per-Workflow Telemetry
======================================================================

Tracks fine-grained operational metrics for the multi-agent system.
All state is thread-safe (threading locks protect shared data structures)
and can be queried via ``get_telemetry_summary()`` for the ``/api/ai/status``
endpoint.

Metrics tracked
---------------
**Per-agent:**
- Invocation count, success count, failure count
- Average latency (ms)
- Fallback rate (deterministic response used instead of LLM)

**Per-model:**
- Token usage (input / output / total)
- Estimated cost (USD)
- Error rate

**Per-workflow:**
- Total duration (ms)
- Number of agents invoked
- Parallel execution group count and agent lists

MINDMAP FLOW
------------
::

    AgentTelemetry System
    ├── 1. Thread-Safe Storage Mutex (_lock)
    │   ├── Atomic metric increments
    │   └── Safe snapshot extraction
    ├── 2. Per-Agent Metric Dimensions (_agent_metrics)
    │   ├── Invocations, Successes, Failures, Error Count
    │   ├── Cumulative & Average Latency (ms)
    │   ├── Fallback Invocation Count & Rate
    │   ├── Total Tokens Consumed (Input / Output)
    │   └── Deterministic Cache Hit Ratio
    ├── 3. Per-Model & Provider Dimensions (_model_metrics)
    │   ├── Call Counts by Model Identifier
    │   ├── Token Usage Tracking (Prompt vs Completion)
    │   ├── Financial Cost Estimation (USD rates per million tokens)
    │   └── Model-specific Error Rates & Outage Rates
    ├── 4. Per-Workflow Aggregate Telemetry (_workflow_executions)
    │   ├── End-to-end Latency (ms)
    │   ├── Specialist Roster Invoked
    │   └── Parallel Execution Concurrency Factor
    └── 5. Reporting & Status Surface
        ├── Snapshot Generator (get_telemetry_summary)
        ├── Export to /api/ai/status Endpoint
        └── Reset Functionality for Test Suites

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |                  Agent / Workflow Event Occurs                |
    +-------------------------------+-------------------------------+
                                    |
            +-----------------------+-----------------------+
            |                       |                       |
            v                       v                       v
    [Agent Invocation]      [Model LLM Call]      [Workflow Complete]
    record_agent_           record_model_         record_workflow_
    invocation(...)         usage(...)            execution(...)
            |                       |                       |
            +-----------------------+-----------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |                   Acquire Thread Lock (_lock)                 |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |             Update In-Memory Telemetry Aggregates             |
    |  - Increment invocations, tokens, errors                      |
    |  - Recalculate moving average latency                         |
    |  - Track model dollar costs & fallback ratios                 |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |                   Release Thread Lock (_lock)                 |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |       Query via get_telemetry_summary() -> JSON Response      |
    +---------------------------------------------------------------+

Usage
-----
::

    from utils.agent_telemetry import (
        record_agent_invocation,
        record_model_usage,
        record_workflow_execution,
        get_telemetry_summary,
    )
"""

import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Thread-safe lock for all telemetry state
# ---------------------------------------------------------------------------
_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Per-agent metrics
# ---------------------------------------------------------------------------
# Keyed by agent name (e.g. "budget_planner", "master_agent").
_agent_metrics: Dict[str, Dict[str, Any]] = {}


def _ensure_agent(name: str) -> Dict[str, Any]:
    """Return (or lazily initialise) the metrics dict for *name*."""
    if name not in _agent_metrics:
        _agent_metrics[name] = {
            "invocation_count": 0,
            "success_count": 0,
            "failure_count": 0,
            "fallback_count": 0,
            "total_latency_ms": 0.0,
            "avg_latency_ms": 0.0,
            "llm_call_count": 0,
            "token_count": 0,
            "cache_hit_count": 0,
        }
    return _agent_metrics[name]


def record_agent_invocation(
    agent_name: str,
    *,
    latency_ms: float = 0.0,
    success: bool = True,
    fallback_used: bool = False,
    llm_calls: int = 0,
    token_count: int = 0,
    cache_hit: bool = False,
) -> None:
    """Record one agent invocation.

    Parameters
    ----------
    agent_name : str
        Canonical agent name (e.g. ``"budget_planner"``).
    latency_ms : float
        Wall-clock duration of the agent call in milliseconds.
    success : bool
        ``True`` if the agent produced a usable output.
    fallback_used : bool
        ``True`` if the agent fell back to a deterministic response.
    """
    with _lock:
        entry = _ensure_agent(agent_name)
        entry["invocation_count"] += 1
        entry["total_latency_ms"] += latency_ms
        entry["llm_call_count"] += max(0, llm_calls)
        entry["token_count"] += max(0, token_count)
        entry["cache_hit_count"] += int(cache_hit)
        if success:
            entry["success_count"] += 1
        else:
            entry["failure_count"] += 1
        if fallback_used:
            entry["fallback_count"] += 1

        count = entry["invocation_count"]
        entry["avg_latency_ms"] = round(entry["total_latency_ms"] / count, 2) if count else 0.0


def get_agent_metrics() -> Dict[str, Dict[str, Any]]:
    """Return a snapshot of per-agent metrics."""
    with _lock:
        snapshot: Dict[str, Dict[str, Any]] = {}
        for name, entry in _agent_metrics.items():
            count = entry["invocation_count"]
            snapshot[name] = {
                **entry,
                "success_rate": round(entry["success_count"] / count * 100, 2) if count else 0.0,
                "fallback_rate": round(entry["fallback_count"] / count * 100, 2) if count else 0.0,
            }
        return snapshot


# ---------------------------------------------------------------------------
# Per-model metrics
# ---------------------------------------------------------------------------
# Keyed by model ID (e.g. "gemini/gemini-2.5-flash").
_model_metrics: Dict[str, Dict[str, Any]] = {}


def _ensure_model(model_id: str) -> Dict[str, Any]:
    if model_id not in _model_metrics:
        _model_metrics[model_id] = {
            "call_count": 0,
            "error_count": 0,
            "total_input_tokens": 0,
            "total_output_tokens": 0,
            "total_cost_usd": 0.0,
        }
    return _model_metrics[model_id]


def record_model_usage(
    model_id: str,
    *,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cost_usd: float = 0.0,
    error: bool = False,
) -> None:
    """Record one LLM model call.

    Parameters
    ----------
    model_id : str
        The model identifier (e.g. ``"gemini/gemini-2.5-flash"``).
    input_tokens : int
        Prompt tokens consumed.
    output_tokens : int
        Completion tokens produced.
    cost_usd : float
        Estimated cost in USD for this call.
    error : bool
        ``True`` if the call resulted in an error.
    """
    with _lock:
        entry = _ensure_model(model_id)
        entry["call_count"] += 1
        entry["total_input_tokens"] += max(0, input_tokens)
        entry["total_output_tokens"] += max(0, output_tokens)
        entry["total_cost_usd"] += max(0.0, cost_usd)
        if error:
            entry["error_count"] += 1


def get_model_metrics() -> Dict[str, Dict[str, Any]]:
    """Return a snapshot of per-model metrics."""
    with _lock:
        snapshot: Dict[str, Dict[str, Any]] = {}
        for model_id, entry in _model_metrics.items():
            count = entry["call_count"]
            snapshot[model_id] = {
                **entry,
                "total_tokens": entry["total_input_tokens"] + entry["total_output_tokens"],
                "error_rate": round(entry["error_count"] / count * 100, 2) if count else 0.0,
            }
        return snapshot


# ---------------------------------------------------------------------------
# Per-workflow metrics
# ---------------------------------------------------------------------------
_workflow_metrics: Dict[str, Dict[str, Any]] = {
    "total_executions": 0,
    "total_duration_ms": 0.0,
    "avg_duration_ms": 0.0,
    "avg_agent_count": 0.0,
    "parallel_execution_count": 0,
    "total_agents_invoked": 0,
    "last_execution": None,
}


def record_workflow_execution(
    *,
    duration_ms: float,
    agent_count: int,
    parallel_groups: Optional[List[List[str]]] = None,
) -> None:
    """Record one complete workflow execution.

    Parameters
    ----------
    duration_ms : float
        Total wall-clock duration of the workflow in milliseconds.
    agent_count : int
        Number of distinct agents that were invoked.
    parallel_groups : list[list[str]], optional
        Lists of agent names that were executed in parallel.
    """
    with _lock:
        m = _workflow_metrics
        m["total_executions"] += 1
        m["total_duration_ms"] += duration_ms
        m["total_agents_invoked"] += agent_count
        m["avg_duration_ms"] = round(m["total_duration_ms"] / m["total_executions"], 2)
        m["avg_agent_count"] = round(m["total_agents_invoked"] / m["total_executions"], 2)

        if parallel_groups:
            m["parallel_execution_count"] += len(parallel_groups)

        m["last_execution"] = {
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "duration_ms": round(duration_ms, 2),
            "agent_count": agent_count,
            "parallel_groups": parallel_groups or [],
        }


def get_workflow_metrics() -> Dict[str, Any]:
    """Return a snapshot of per-workflow metrics."""
    with _lock:
        return dict(_workflow_metrics)


# ---------------------------------------------------------------------------
# Telemetry summary (exposed to /api/ai/status)
# ---------------------------------------------------------------------------

def get_telemetry_summary() -> Dict[str, Any]:
    """Return the full telemetry summary for the status endpoint.

    Includes per-agent, per-model, and per-workflow metrics.
    """
    return {
        "agents": get_agent_metrics(),
        "models": get_model_metrics(),
        "workflows": get_workflow_metrics(),
    }
