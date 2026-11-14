"""
agent_outputs.py - Structured Output Contracts for Specialist Agents
====================================================================

Pydantic models that define the expected output shape for each specialist
agent.  These contracts provide:

- **Type safety** -- catch shape mismatches at the boundary, not deep in code
- **Auto-documentation** -- OpenAPI schemas generated from the models
- **Easier aggregation** -- the AggregatorAgent can validate inputs
- **Better error messages** -- Pydantic reports exactly which field is wrong

MINDMAP FLOW
------------
::

    Agent Output Contracts (Pydantic V2)
    ├── 1. Income / Expense Models
    │   ├── SummaryMetrics (income, expenses, cash flow, savings rate)
    │   ├── CategoryBreakdown (category, amount, percentage, count)
    │   ├── Anomaly (category, amount, z-score, reason)
    │   ├── RecurringItem (merchant, amount, frequency)
    │   └── IncomeAnalysisOutput (aggregate schema)
    ├── 2. Budget Planner Models
    │   ├── BudgetAllocation (needs, wants, savings, debt)
    │   ├── SavingsPlan (emergency target, monthly targets, gap)
    │   └── BudgetPlanOutput (complete budget plan contract)
    ├── 3. Investment Advisor Models
    │   ├── AssetAllocationSlice (asset class, percentage, rationale)
    │   ├── ExpectedReturns (nominal, real CAGR, projection timeline)
    │   └── InvestmentAdviceOutput (complete portfolio recommendation)
    ├── 4. Debt Optimizer Models
    │   ├── DebtRepaymentScheduleItem (month, debt, payment, balance)
    │   ├── StrategyComparison (snowball vs avalanche savings)
    │   └── DebtOptimizationOutput (complete debt reduction contract)
    └── 5. Educational Models
        ├── EducationalExplanation (topic, core definition, key takeaways)
        └── FinancialEducationOutput (education schema)

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |              Specialist Agent Execution Result                |
    |                   (Raw Output Dictionary)                     |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |         Model.model_validate(raw_result_dictionary)           |
    +-------------------------------+-------------------------------+
                                    |
                        [Is Structure Conforming?]
                               /          \
                             YES           NO
                             /              \
                            v                v
     +-------------------------------+   +-----------------------------+
     | Strongly-typed validated      |   | ValidationError with exact  |
     | Pydantic instance             |   | field path and reason       |
     +---------------+---------------+   +--------------+--------------+
                     |                                  |
                     v                                  v
     +-------------------------------+   +-----------------------------+
     | Consumed by AggregatorAgent / |   | Handled gracefully by error |
     | Workflow State Machine        |   | handling pipeline           |
     +-------------------------------+   +-----------------------------+

Each agent's ``analyze`` / ``create`` / ``provide`` / ``optimize`` method
returns a plain dict that matches one of these models.  The API service or
aggregator can then call ``Model.model_validate(result)`` to get typed
access.

Usage
-----
::

    from contracts.agent_outputs import IncomeAnalysisOutput

    raw = income_agent.analyze_finances(transactions=...)
    validated = IncomeAnalysisOutput.model_validate(raw)
    print(validated.summary_metrics.savings_rate)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

# ── Income / Expense Analyzer Output ────────────────────────────────────

# High-level aggregate cash flow metrics schema.
# Encapsulates total income, total expenses, net savings rate, and primary category.
# Provides baseline figures for comprehensive financial health score calculations.
class SummaryMetrics(BaseModel):
    """High-level cash-flow metrics."""
    total_income: float = 0.0
    total_expenses: float = 0.0
    net_cash_flow: float = 0.0
    savings_rate: float = 0.0
    top_category: Optional[str] = None
    top_category_amount: float = 0.0


# Spending breakdown model per individual budget category.
# Tracks nominal expense amounts, portfolio percentages, and transaction volume.
# Supplies detailed category analytics for budget recommendations.
class CategoryBreakdown(BaseModel):
    """Spending per category."""
    category: str
    amount: float = 0.0
    percentage: float = 0.0
    transaction_count: int = 0


# Detected anomalous spending pattern schema with statistical scoring.
# Records outlier transaction amounts, category tags, and deviation z-scores.
# Flags unexpected expenditure spikes for proactive user alerting.
class Anomaly(BaseModel):
    """A detected spending anomaly."""
    category: str
    amount: float = 0.0
    z_score: float = 0.0
    description: str = ""


# Standardizes analytical transaction outputs for downstream planning pipelines.
# Output schema contract emitted by the income and expense analyzer agent.
# Aggregates summary cash flow metrics, category breakdowns, and anomaly lists.
class IncomeAnalysisOutput(BaseModel):
    """Output contract for IncomeExpenseAnalyzerAgent."""
    summary_metrics: SummaryMetrics = Field(default_factory=SummaryMetrics)
    category_breakdown: List[CategoryBreakdown] = Field(default_factory=list)
    anomalies: List[Anomaly] = Field(default_factory=list)
    health_score: float = 0.0
    trends: Dict[str, Any] = Field(default_factory=dict)


# ── Budget Planner Output ───────────────────────────────────────────────

# Category-specific budget target allocation contract.
# Defines planned expenditure limits, budget percentages, and expense flexibility.
# Differentiates between fixed obligations and discretionary spending targets.
class BudgetAllocation(BaseModel):
    """A single budget category allocation."""
    category: str
    allocated: float = 0.0
    percentage: float = 0.0
    type: str = "variable"  # "fixed" or "variable"


# Monthly funding schedule for a specific financial milestone goal.
# Calculates required monthly capital allocations and projected completion timelines.
# Aligns active savings goals with holistic user cash flow capacity.
class GoalFunding(BaseModel):
    """Monthly funding plan for a financial goal."""
    goal_name: str
    monthly_amount: float = 0.0
    months_to_target: int = 0


# Comprehensive budget plan contract produced by the budget planner agent.
# Details categorical spending limits, emergency fund goals, and savings targets.
# Specifies governing allocation frameworks such as standard 50/30/20 rules.
class BudgetPlanOutput(BaseModel):
    """Output contract for BudgetPlannerAgent."""
    total_income: float = 0.0
    total_expenses: float = 0.0
    savings_rate: float = 0.0
    allocations: List[BudgetAllocation] = Field(default_factory=list)
    goal_funding: List[GoalFunding] = Field(default_factory=list)
    emergency_fund_target: float = 0.0
    emergency_fund_months: float = 0.0
    method: str = "50/30/20"  # "50/30/20" or "debt_heavy"


# ── Investment Advisor Output ───────────────────────────────────────────

# Asset class target weighting schema for investment portfolio construction.
# Represents targeted allocation percentages across equity, debt, and cash assets.
# Provides granular asset class targets for portfolio rebalancing.
class AssetAllocation(BaseModel):
    """Portfolio allocation by asset class."""
    asset_class: str
    percentage: float = 0.0


# Risk assessment output schema based on user financial profile parameters.
# Classifies investor tolerance into conservative, moderate, or aggressive profiles.
# Details numerical risk scores and underlying demographic weighting factors.
class RiskProfileResult(BaseModel):
    """Risk assessment result."""
    profile: str = "moderate"  # conservative, moderate, aggressive
    score: float = 0.0
    factors: Dict[str, Any] = Field(default_factory=dict)


# Portfolio recommendation output schema from the investment advisor agent.
# Captures target asset allocations, expected annual returns, and rebalance rules.
# Embeds risk tolerance assessments to guide long-term wealth accumulation.
class InvestmentAdviceOutput(BaseModel):
    """Output contract for InvestmentAdvisorAgent."""
    risk_profile: str = "moderate"
    risk_assessment: RiskProfileResult = Field(default_factory=RiskProfileResult)
    asset_allocation: Dict[str, float] = Field(default_factory=dict)
    expected_annual_return: float = 0.0
    strategy: Dict[str, Any] = Field(default_factory=dict)
    rebalancing_schedule: str = "Semi-annual"


# ── Debt Optimizer Output ───────────────────────────────────────────────

# Summary contract for an individual debt obligation or liability account.
# Captures remaining principal balances, interest rates, and required minimums.
# Supplies granular debt parameters to debt optimization algorithms.
class DebtSummary(BaseModel):
    """Summary of a single debt."""
    name: str
    balance: float = 0.0
    interest_rate: float = 0.0
    minimum_payment: float = 0.0


# Comparative debt payoff strategy projection schema.
# Models total interest costs and debt-free horizons for avalanche or snowball.
# Quantifies financial savings achievable through structured payoff schedules.
class PayoffStrategy(BaseModel):
    """A debt payoff strategy comparison."""
    method: str  # "snowball" or "avalanche"
    total_interest: float = 0.0
    months_to_debt_free: int = 0
    monthly_payment: float = 0.0


# Complete debt reduction strategy contract from the debt optimizer agent.
# Aggregates liability summaries, strategy trade-offs, and consolidation options.
# Identifies available surplus cash flow capacity for accelerated repayment.
class DebtOptimizationOutput(BaseModel):
    """Output contract for DebtOptimizerAgent."""
    current_debt_situation: Dict[str, Any] = Field(default_factory=dict)
    debts: List[DebtSummary] = Field(default_factory=list)
    strategies: List[PayoffStrategy] = Field(default_factory=list)
    recommended_strategy: Dict[str, Any] = Field(default_factory=dict)
    consolidation_options: List[Dict[str, Any]] = Field(default_factory=list)
    extra_payment_capacity: float = 0.0


# ── Financial Educator Output ───────────────────────────────────────────

# Educational guidance output schema from the financial educator agent.
# Outlines core financial concepts, plain-language explanations, and key takeaways.
# Tags educational material with appropriate user experience difficulty levels.
class FinancialEducatorOutput(BaseModel):
    """Output contract for FinancialEducatorAgent."""
    concept: str = ""
    explanation: str = ""
    key_points: List[str] = Field(default_factory=list)
    resources: List[str] = Field(default_factory=list)
    difficulty: str = "beginner"  # beginner, intermediate, advanced


# Alias for backward compatibility
# Backward compatibility alias for the financial educator response contract.
# Preserves legacy contract naming across earlier service integration points.
# Ensures seamless interoperability with existing client and test callers.
FinancialEducationOutput = FinancialEducatorOutput
