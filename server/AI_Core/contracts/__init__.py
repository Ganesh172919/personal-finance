"""
contracts - Data contracts for structured AI Core outputs
"""

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
