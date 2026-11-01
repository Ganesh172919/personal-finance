"""
FinWise Financial Assistant - Multi-Agent System
"""

# Import all agent classes
from .aggregator import AggregatorAgent
from .budget_planner import BudgetPlannerAgent
from .debt_optimizer import DebtOptimizerAgent
from .financial_educator import FinancialEducatorAgent
from .income_expense_analyzer import IncomeExpenseAnalyzerAgent
from .investment_advisor import InvestmentAdvisorAgent
from .master_agent import MasterFinancialStrategistAgent
from .sub_agent_manager import SubAgentManager
from .task_decomposer import TaskDecomposerAgent

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
