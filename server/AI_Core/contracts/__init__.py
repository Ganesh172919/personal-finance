"""
contracts - Data contracts for structured AI Core outputs
"""

# Imports strongly-typed Pydantic contracts across agent output boundaries.
# Exposes structured schemas for plans, tool calls, traces, and specialist responses.
# Provides central contract exports for external service callers and internal agents.
from .agent_outputs import (
    BudgetPlanOutput,
    DebtOptimizationOutput,
    FinancialEducationOutput,
    FinancialEducatorOutput,
    IncomeAnalysisOutput,
    InvestmentAdviceOutput,
)
from .plan import ActionBuckets, ActionItem, KeyMetrics, Plan
from .responses import ProcessResponse
from .tool_calls import ToolCall
from .trace import WorkflowTraceEntry

# Public module export manifest defining standard contract data models.
# Ensures clean module interface encapsulation for external consumers.
# Governs public symbol export across AI Core service component boundaries.
__all__ = [
    "ActionBuckets",
    "ActionItem",
    "BudgetPlanOutput",
    "DebtOptimizationOutput",
    "FinancialEducationOutput",
    "FinancialEducatorOutput",
    "IncomeAnalysisOutput",
    "InvestmentAdviceOutput",
    "KeyMetrics",
    "Plan",
    "ProcessResponse",
    "WorkflowTraceEntry",
    "ToolCall",
]
