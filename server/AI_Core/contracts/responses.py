from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from .plan import Plan
from .tool_calls import ToolCall
from .trace import WorkflowTraceEntry


class UsageMetadata(BaseModel):
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
