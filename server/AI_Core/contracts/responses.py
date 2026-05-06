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
