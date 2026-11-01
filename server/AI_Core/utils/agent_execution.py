"""
agent_execution.py - Agent Execution Context and Telemetry Measurement
======================================================================

Measures execution duration, token consumption, cache hits, and error states
inside worker threads while isolating and preserving per-agent usage metrics.

Key responsibilities
--------------------
- Context manager protocol (__enter__, __exit__) for wrapping agent operations.
- High-resolution timing with perf_counter.
- Request-level metric scoping via capture_agent_metrics().
- Trace payload synthesis (timestamps, latency, token counts, errors).
- Automatic telemetry dispatch to record_agent_invocation().

MINDMAP FLOW
------------
::

    AgentExecution Context
    ├── 1. Initialization (__init__)
    │   ├── Agent Identifier (e.g. "budget_planner", "master")
    │   ├── Workflow Phase Tag (default: "execution")
    │   └── State Containers (result dict, trace dict)
    ├── 2. Scope Entry (__enter__)
    │   ├── UTC Timestamp Capture (started_at)
    │   ├── High-Resolution Timer Start (perf_counter)
    │   └── Scoped Metric Collector Initialization (capture_agent_metrics)
    ├── 3. Target Block Execution (Wrapped Code)
    │   └── Agent Method / LLM Call executes within thread
    ├── 4. Scope Exit (__exit__)
    │   ├── High-Resolution Duration Delta (elapsed in ms)
    │   ├── Metric Snapshot (tokens in/out, llm_calls, cache_hits)
    │   ├── Error / Fallback Inspection (from exception or result dict)
    │   └── Trace Dictionary Construction
    └── 5. Telemetry Dispatch
        ├── Record in Agent Telemetry Registry (record_agent_invocation)
        └── Output Trace Object for Workflow / Aggregator Graph

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |              with AgentExecution(agent_name):                 |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |                          __enter__()                          |
    |  - started_at = datetime.now(timezone.utc)                    |
    |  - started = perf_counter()                                   |
    |  - scope = capture_agent_metrics().__enter__()                |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |                     Execute Agent Logic                       |
    |      (Deterministic calculations OR LLM inference calls)      |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |                          __exit__()                           |
    |  - elapsed = (perf_counter() - started) * 1000                |
    |  - usage = metrics.snapshot()                                 |
    |  - Inspect result/exceptions for errors & fallback flags      |
    |  - Construct trace dictionary                                 |
    |  - record_agent_invocation(...)                               |
    +---------------------------------------------------------------+
"""

from datetime import datetime, timezone
from time import perf_counter

from utils.agent_telemetry import record_agent_invocation
from utils.request_metrics import capture_agent_metrics


class AgentExecution:
    def __init__(self, agent: str, phase: str = "execution"):
        self.agent = agent
        self.phase = phase
        self.result = {}
        self.trace = {}

    def __enter__(self):
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.started = perf_counter()
        self.scope = capture_agent_metrics()
        self.metrics = self.scope.__enter__()
        return self

    def __exit__(self, exc_type, exc, traceback):
        elapsed = (perf_counter() - self.started) * 1000
        usage = self.metrics.snapshot()
        self.scope.__exit__(exc_type, exc, traceback)
        values = [self.result] + [value for value in self.result.values() if isinstance(value, dict)]
        error = str(exc) if exc is not None else next((str(value["error"]) for value in values if value.get("error")), None)
        fallback = any(bool(value.get("fallback_used")) for value in values)
        self.trace = {
            "agent": self.agent, "phase": self.phase, "startedAt": self.started_at,
            "endedAt": datetime.now(timezone.utc).isoformat(), "status": "error" if error else "success",
            "latencyMs": round(elapsed, 3), "llmCalls": usage["llm_calls"],
            "inputTokens": usage["tokens_in"], "outputTokens": usage["tokens_out"],
            "tokenCount": usage["total_tokens"], "fallbackUsed": fallback, "cacheHit": usage["cache_hits"] > 0,
        }
        if error:
            self.trace["error"] = error
        record_agent_invocation(
            self.agent, latency_ms=elapsed, success=not error, fallback_used=fallback,
            llm_calls=usage["llm_calls"], token_count=usage["total_tokens"], cache_hit=usage["cache_hits"] > 0,
        )
        return False
