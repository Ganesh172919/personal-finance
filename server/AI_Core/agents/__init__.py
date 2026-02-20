"""
FinWise Financial Assistant - Multi-Agent System
"""

# Import all agent classes
from .budget_planner import BudgetPlannerAgent
from .debt_optimizer import DebtOptimizerAgent
from .financial_educator import FinancialEducatorAgent
from .income_expense_analyzer import IncomeExpenseAnalyzerAgent
from .investment_advisor import InvestmentAdvisorAgent
from .master_agent import MasterFinancialStrategistAgent

__all__ = [
    "BudgetPlannerAgent",
    "DebtOptimizerAgent",
    "FinancialEducatorAgent",
    "IncomeExpenseAnalyzerAgent",
    "InvestmentAdvisorAgent",
    "MasterFinancialStrategistAgent",
]
