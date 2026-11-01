"""
contracts/trace.py - Workflow Trace Entry Contract
====================================================

Defines the ``WorkflowTraceEntry`` model used to record timestamps and
status for each agent that runs during a workflow execution.  The frontend
uses these entries to render a live progress timeline (e.g. "income
analyzer started... completed in 45ms") in the AgentWorkflowVisualizer.

MINDMAP FLOW
------------
::

    WorkflowTraceEntry Model
    ├── 1. Agent Identification
    │   ├── agent: str (Specialist name, e.g. "budget_planner", "master")
    │   └── phase: Optional[str] (e.g. "routing", "execution", "synthesis")
    ├── 2. Timing & Latency
    │   ├── startedAt: str (ISO 8601 UTC timestamp)
    │   ├── endedAt: str (ISO 8601 UTC timestamp)
    │   └── latencyMs: float (Duration in milliseconds)
    ├── 3. Status & Health
    │   ├── status: "success" | "error" | "retry" | "reused"
    │   └── error: Optional[str] (Error description on failure)
    ├── 4. Token & Cache Telemetry
    │   ├── llmCalls: int (Number of external inference invocations)
    │   ├── inputTokens / outputTokens / tokenCount
    │   └── cacheHit: bool (Deterministic response cache hit flag)
    └── 5. Fallback Audit
        └── fallbackUsed: bool (Indicates deterministic rule fallback)

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |                  Agent Execution Starts                       |
    |  - Record agent name & ISO 8601 timestamp in startedAt        |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |                  Agent Execution Finishes                     |
    |  - Compute latencyMs = (endedAt - startedAt)                  |
    |  - Inspect tokens consumed & cache hit status                 |
    |  - Capture error string if failed                             |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |         Instantiate WorkflowTraceEntry Pydantic Model         |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    | Appended to state["workflow_trace"] & Streamed via SSE to UI |
    +---------------------------------------------------------------+
"""

from typing import Optional

from pydantic import BaseModel, Field


class WorkflowTraceEntry(BaseModel):
    """A single trace entry recording when an agent started, ended, and its status."""

    agent: str               # Agent name (e.g. "income_expense_analyzer")
    startedAt: str           # ISO 8601 UTC timestamp
    endedAt: str             # ISO 8601 UTC timestamp
    status: str              # "success", "error", "retry", or "reused"
    error: Optional[str] = None  # Error message if status is "error"
    phase: Optional[str] = None
    latencyMs: float = Field(default=0, ge=0)
    llmCalls: int = Field(default=0, ge=0)
    inputTokens: int = Field(default=0, ge=0)
    outputTokens: int = Field(default=0, ge=0)
    tokenCount: int = Field(default=0, ge=0)
    fallbackUsed: bool = False
    cacheHit: bool = False

