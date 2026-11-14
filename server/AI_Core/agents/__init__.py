"""
FinWise Financial Assistant - Multi-Agent System
"""

# Import all agent classes
# Exports core specialized agent classes for financial planning and advisory.
# Provides centralized access to individual domain analysts and planners.
# Connects coordinator and manager modules with the multi-agent graph engine.
from .aggregator import AggregatorAgent
from .budget_planner import BudgetPlannerAgent
from .debt_optimizer import DebtOptimizerAgent
from .financial_educator import FinancialEducatorAgent
from .income_expense_analyzer import IncomeExpenseAnalyzerAgent
from .investment_advisor import InvestmentAdvisorAgent
from .master_agent import MasterFinancialStrategistAgent
from .sub_agent_manager import SubAgentManager
from .task_decomposer import TaskDecomposerAgent

# Explicit public API export manifest defining public module members.
# Specifies importable financial agents and coordinator manager types.
# Controls wildcard import visibility across external service boundaries.
__all__ = [
    "AggregatorAgent",
    "BudgetPlannerAgent",
    "DebtOptimizerAgent",
    "FinancialEducatorAgent",
    "IncomeExpenseAnalyzerAgent",
    "InvestmentAdvisorAgent",
    "MasterFinancialStrategistAgent",
    "SubAgentManager",
    "TaskDecomposerAgent",
]
