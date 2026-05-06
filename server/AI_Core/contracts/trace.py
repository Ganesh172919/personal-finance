"""
contracts/trace.py - Workflow Trace Entry Contract
====================================================

Defines the ``WorkflowTraceEntry`` model used to record timestamps and
status for each agent that runs during a workflow execution.  The frontend
uses these entries to render a live progress timeline (e.g. "income
analyzer started... completed in 45ms").
"""

from typing import Optional

from pydantic import BaseModel


class WorkflowTraceEntry(BaseModel):
    """A single trace entry recording when an agent started, ended, and its status."""

    agent: str               # Agent name (e.g. "income_expense_analyzer")
    startedAt: str           # ISO 8601 UTC timestamp
    endedAt: str             # ISO 8601 UTC timestamp
    status: str              # "success", "error", "retry", or "reused"
    error: Optional[str] = None  # Error message if status is "error"

