"""
contracts/responses.py - HTTP Response Data Contracts
=======================================================

Defines the Pydantic models for the ``/api/agents/process`` endpoint
response.  ``ProcessResponse`` is the top-level response model that
FastAPI uses for automatic JSON serialisation and OpenAPI schema
generation.

The response includes:
- The synthesised financial plan (always present).
- Workflow trace (timestamps for each agent that ran).
- Tool calls (automation suggestions for the client to present).
- LLM usage metadata (tokens, cost, models used).
- Session state (for resumable workflows).
- Grounding evidence and confidence metrics (RAG retrieval integration).

MINDMAP FLOW
------------
::

    ProcessResponse Contract
    ├── 1. Response Envelope
    │   ├── success: bool
    │   ├── final_output: str (Rendered Markdown response)
    │   └── agent: str (Executing or synthesizing agent)
    ├── 2. Strategic Metadata
    │   ├── actionType: str (e.g., "rebalance", "budget_cut", "debt_payoff")
    │   ├── priority: "low" | "medium" | "high"
    │   └── insights: list[dict] (Key actionable takeaways)
    ├── 3. Execution Topology & Audit
    │   ├── analysis_type: str (e.g., "comprehensive", "budget")
    │   ├── agents_involved: list[str] (Specialists invoked)
    │   ├── detailed_analysis: dict (Raw analyses per specialist)
    │   ├── workflow_trace: list[WorkflowTraceEntry] (Node latencies, statuses)
    │   └── subtasks: list[dict] (Subtask DAG definitions & states)
    ├── 4. Grounding & Evidence (RAG)
    │   ├── evidence: list[dict] (Knowledge chunk citations & snippets)
    │   └── confidence: dict (retrieval, math, recommendation confidence scores)
    ├── 5. Runtime & Resilience Metadata
    │   ├── fallback_used: bool (Deterministic fallback indicator)
    │   ├── llm_call_count: int
    │   ├── llm_route: dict (Provider, active model, fallback sequence)
    │   └── usage: UsageMetadata (tokens in/out, total, estimated USD cost)
    └── 6. Interactive Artifacts
        ├── plan: Plan (Deterministic Pydantic financial plan)
        └── tool_calls: list[ToolCall] (Client UI automation suggestions)

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |              AI Core LangGraph Workflow Finishes              |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |            Construct ProcessResponse Pydantic Instance        |
    |  - final_output = markdown text                               |
    |  - evidence = retrieved workspace knowledge chunks            |
    |  - confidence = scoring evaluation metrics                    |
    |  - workflow_trace = node execution timings                    |
    |  - usage = aggregated tokens & cost                           |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |            Pydantic JSON Serialization & Validation           |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |  Delivered over HTTP 200 to Node.js /aiCoreClient Service     |
    +---------------------------------------------------------------+
"""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from .plan import Plan
from .tool_calls import ToolCall
from .trace import WorkflowTraceEntry


class UsageMetadata(BaseModel):
    """LLM token and cost usage for the current request."""
    tokens_in: int = 0
    tokens_out: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    models: List[str] = Field(default_factory=list)


class ProcessResponse(BaseModel):
    success: bool = True
    final_output: str
    agent: str = "master"
    actionType: Optional[str] = None
    priority: Literal["low", "medium", "high"] = "medium"
    insights: List[Dict[str, Any]] = Field(default_factory=list)
    analysis_type: str = "comprehensive"
    agents_involved: List[str] = Field(default_factory=list)
    detailed_analysis: Dict[str, Any] = Field(default_factory=dict)
    workflow_trace: List[WorkflowTraceEntry] = Field(default_factory=list)
    evidence: List[Dict[str, Any]] = Field(default_factory=list)
    confidence: Dict[str, Any] = Field(default_factory=dict)
    fallback_used: bool = False
    llm_call_count: int = 0
    request_id: str
    plan: Plan
    usage: UsageMetadata = Field(default_factory=UsageMetadata)
    tool_calls: List[ToolCall] = Field(default_factory=list)
    session_id: Optional[str] = None
    session_status: Optional[str] = None
    workflow_phase: Optional[str] = None
    active_provider: Optional[str] = None
    active_model: Optional[str] = None
    active_key_id: Optional[str] = None
    fallback_path: List[str] = Field(default_factory=list)
    recovered_failures: List[Dict[str, Any]] = Field(default_factory=list)
    recovered_from_checkpoint: bool = False
