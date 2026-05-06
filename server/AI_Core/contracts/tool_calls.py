"""
contracts/tool_calls.py - Tool Call Data Contracts
====================================================

Defines the Pydantic models for **tool calls** -- automation suggestions
that the AI Core generates and the client presents to the user.  Tool
calls are always low-risk and require explicit user confirmation before
execution.

Supported tool names (``ToolName``) map to actions on the FinWise server,
such as creating transactions, managing goals, setting up workflows,
and running budget recommendations.

The ``ToolCall`` model includes a deterministic ``id`` (SHA-256 hash
truncated to 12 hex chars) so that the same suggestion always produces
the same ID, enabling idempotent client-side handling.
"""

from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field

# Risk levels for tool calls.  All AI-generated tool calls default to "low".
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
    "notifications.send",
    "finance.lookupAccount",
    "finance.lookupMerchant",
    "finance.lookupRecurringRule",
    "finance.detectRecurringCandidates",
    "budgets.recommendAllocations",
    "closeMonth.run",
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
