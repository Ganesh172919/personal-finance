from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field


ToolRisk = Literal["low", "medium", "high"]
ToolName = Literal[
    "transactions.create",
    "goals.createOrUpdate",
    "debts.createOrUpdate",
    "workflows.create",
    "workflows.enable",
    "workflows.run",
    "exports.create",
    "notifications.sendEmail",
]


class ToolCall(BaseModel):
    id: str
    title: str
    description: str
    tool: ToolName
    args: Dict[str, Any] = Field(default_factory=dict)
    requires_confirmation: bool = True
    risk: ToolRisk = "low"


class ToolCallSet(BaseModel):
    tool_calls: List[ToolCall] = Field(default_factory=list)

