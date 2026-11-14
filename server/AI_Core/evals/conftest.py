"""
conftest.py - Shared Fixtures for the Agent Evaluation Suite
=============================================================

Provides reusable pytest fixtures for all eval test modules:
- Sample user profiles (minimal, full, edge-case)
- Sample transactions, debts, investments
- Agent instances
- Helper functions for running agents and assertions

Every fixture is **deterministic** and requires no LLM calls so that
the eval suite can run in CI without API keys.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List

import pytest

# ---------------------------------------------------------------------------
# Ensure the AI_Core root is on sys.path so that ``from agents import ...``
# works regardless of how pytest is invoked.
# ---------------------------------------------------------------------------
AI_CORE_ROOT = Path(__file__).resolve().parents[1]
if str(AI_CORE_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_CORE_ROOT))


# ---------------------------------------------------------------------------
# Pytest markers
# ---------------------------------------------------------------------------


# Registers specialized test markers within the pytest configuration context.
# Categorizes eval tests into routing, quality, determinism, safety, and latency.
# Enables granular test selection during local testing and automated CI pipelines.
def pytest_configure(config):
    """Register custom markers for the eval suite."""
    config.addinivalue_line("markers", "routing: Routing accuracy tests")
    config.addinivalue_line("markers", "quality: Plan quality tests")
    config.addinivalue_line("markers", "determinism: Determinism / reproducibility tests")
    config.addinivalue_line("markers", "safety: Number safety guard tests")
    config.addinivalue_line("markers", "latency: Latency benchmark tests")


# ---------------------------------------------------------------------------
# User Profiles
# ---------------------------------------------------------------------------


# Provides a minimal test user profile containing only basic age and income fields.
# Simulates sparse user profiles to test agent resilience against missing data.
# Supplies a standard deterministic fixture for edge-case evaluation scenarios.
@pytest.fixture
def minimal_profile() -> Dict[str, Any]:
    """Bare-minimum profile -- age and income only.

    Used for edge-case tests where most fields are missing.
    """
    return {
        "age": 25,
        "annual_income": 300000,
        "monthly_expenses": 20000,
        "savings": 10000,
        "debts": [],
        "financial_goals": [],
        "risk_tolerance": "moderate",
        "investment_experience": "beginner",
        "time_horizon": 10,
        "transactions": [],
    }


# Provides an exhaustive user financial profile with debts, goals, and transactions.
# Represents realistic financial scenarios across multiple months and asset classes.
# Serves as the primary fixture for comprehensive end-to-end plan generation tests.
@pytest.fixture
def full_profile() -> Dict[str, Any]:
    """Complete profile with debts, goals, transactions, and settings.

    Used for comprehensive analysis tests.
    """
    return {
        "age": 35,
        "annual_income": 1200000,
        "monthly_expenses": 60000,
        "savings": 300000,
        "debts": [
            {
                "name": "Home Loan",
                "balance": 3500000,
                "interest_rate": 8.5,
                "minimum_payment": 35000,
            },
            {
                "name": "Credit Card",
                "balance": 150000,
                "interest_rate": 24.0,
                "minimum_payment": 5000,
            },
        ],
        "financial_goals": [
            {"name": "Emergency Fund", "target": 500000, "timeline_months": 12, "priority": 1},
            {"name": "Vacation", "target": 100000, "timeline_months": 6, "priority": 2},
            {"name": "Retirement", "target": 10000000, "timeline_months": 300, "priority": 1},
        ],
        "risk_tolerance": "moderate",
        "investment_experience": "intermediate",
        "time_horizon": 20,
        "transactions": [
            {"amount": 100000, "category": "Salary", "description": "Monthly salary", "date": "2026-01-01", "type": "income"},
            {"amount": -15000, "category": "Rent", "description": "Rent", "date": "2026-01-02", "type": "expense"},
            {"amount": -8000, "category": "Groceries", "description": "Groceries", "date": "2026-01-05", "type": "expense"},
            {"amount": -3000, "category": "Dining", "description": "Dining out", "date": "2026-01-10", "type": "expense"},
            {"amount": -5000, "category": "Transport", "description": "Fuel", "date": "2026-01-12", "type": "expense"},
            {"amount": -10000, "category": "Investment", "description": "SIP", "date": "2026-01-15", "type": "investment"},
            {"amount": 100000, "category": "Salary", "description": "Monthly salary", "date": "2026-02-01", "type": "income"},
            {"amount": -15000, "category": "Rent", "description": "Rent", "date": "2026-02-02", "type": "expense"},
            {"amount": -9000, "category": "Groceries", "description": "Groceries", "date": "2026-02-05", "type": "expense"},
            {"amount": -4000, "category": "Utilities", "description": "Electricity", "date": "2026-02-07", "type": "expense"},
        ],
        "currency": "INR",
        "locale": "en-IN",
        "timezone": "Asia/Kolkata",
    }


# Provides a financial profile with boundary edge cases such as zero income.
# Simulates extreme indebtedness scenarios without corresponding earnings.
# Tests system robustness and error handling under severe financial distress.
@pytest.fixture
def edge_case_profile() -> Dict[str, Any]:
    """Profile with edge-case values: zero income, extreme debt, no expenses.

    Used for robustness tests.
    """
    return {
        "age": 22,
        "annual_income": 0,
        "monthly_expenses": 0,
        "savings": 0,
        "debts": [
            {
                "name": "Student Loan",
                "balance": 500000,
                "interest_rate": 12.0,
                "minimum_payment": 8000,
            },
        ],
        "financial_goals": [],
        "risk_tolerance": "conservative",
        "investment_experience": "beginner",
        "time_horizon": 5,
        "transactions": [],
    }


# Provides a high net worth financial profile with strong savings and zero debt.
# Simulates affluent user personas seeking aggressive growth and wealth building.
# Exercises portfolio allocation and advanced investment advisory logic paths.
@pytest.fixture
def high_income_profile() -> Dict[str, Any]:
    """High-income profile with no debts and strong savings.

    Used for tests where the system should recommend investing.
    """
    return {
        "age": 40,
        "annual_income": 5000000,
        "monthly_expenses": 150000,
        "savings": 5000000,
        "debts": [],
        "financial_goals": [
            {"name": "Retirement", "target": 30000000, "timeline_months": 240, "priority": 1},
        ],
        "risk_tolerance": "aggressive",
        "investment_experience": "advanced",
        "time_horizon": 25,
        "transactions": [
            {"amount": 416667, "category": "Salary", "description": "Monthly salary", "date": "2026-01-01", "type": "income"},
            {"amount": -150000, "category": "Expenses", "description": "Monthly expenses", "date": "2026-01-05", "type": "expense"},
        ],
    }


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------


# Supplies a realistic two-month transaction dataset with diverse expense categories.
# Includes recurring salary inflows, utility bills, and discretionary spending.
# Serves as deterministic input data for income and expense analyzer evaluations.
@pytest.fixture
def sample_transactions() -> List[Dict[str, Any]]:
    """A realistic 2-month transaction history."""
    return [
        {"amount": 80000, "category": "Salary", "description": "Monthly salary", "date": "2026-01-01", "type": "income"},
        {"amount": -15000, "category": "Rent", "description": "Rent payment", "date": "2026-01-02", "type": "expense"},
        {"amount": -6000, "category": "Groceries", "description": "Groceries", "date": "2026-01-05", "type": "expense"},
        {"amount": -3000, "category": "Dining", "description": "Restaurant", "date": "2026-01-08", "type": "expense"},
        {"amount": -2000, "category": "Transport", "description": "Fuel", "date": "2026-01-10", "type": "expense"},
        {"amount": -1500, "category": "Entertainment", "description": "Movie tickets", "date": "2026-01-12", "type": "expense"},
        {"amount": -5000, "category": "Investment", "description": "SIP", "date": "2026-01-15", "type": "investment"},
        {"amount": 80000, "category": "Salary", "description": "Monthly salary", "date": "2026-02-01", "type": "income"},
        {"amount": -15000, "category": "Rent", "description": "Rent payment", "date": "2026-02-02", "type": "expense"},
        {"amount": -7000, "category": "Groceries", "description": "Groceries", "date": "2026-02-05", "type": "expense"},
        {"amount": -4000, "category": "Dining", "description": "Restaurant", "date": "2026-02-08", "type": "expense"},
        {"amount": -2500, "category": "Transport", "description": "Fuel", "date": "2026-02-10", "type": "expense"},
        {"amount": -3000, "category": "Utilities", "description": "Electricity bill", "date": "2026-02-12", "type": "expense"},
        {"amount": -5000, "category": "Investment", "description": "SIP", "date": "2026-02-15", "type": "investment"},
    ]


# ---------------------------------------------------------------------------
# Debts
# ---------------------------------------------------------------------------


# Supplies a standard debt portfolio containing mortgages and revolving credit cards.
# Captures high-interest consumer debt alongside low-interest collateralized loans.
# Exercises basic debt payoff strategy modeling and amortization schedules.
@pytest.fixture
def sample_debts() -> List[Dict[str, Any]]:
    """A typical debt portfolio: home loan + credit card."""
    return [
        {
            "name": "Home Loan",
            "balance": 3000000,
            "interest_rate": 8.5,
            "minimum_payment": 30000,
        },
        {
            "name": "Credit Card",
            "balance": 100000,
            "interest_rate": 36.0,
            "minimum_payment": 5000,
        },
    ]


# Supplies a multi-tier liability portfolio comprising four distinct debt accounts.
# Provides varied balances and interest rates for snowball versus avalanche tests.
# Enables quantitative interest savings comparisons across repayment strategies.
@pytest.fixture
def multiple_debts() -> List[Dict[str, Any]]:
    """Four debts for snowball vs avalanche comparison tests."""
    return [
        {"name": "Personal Loan", "balance": 50000, "interest_rate": 14.0, "minimum_payment": 3000},
        {"name": "Credit Card A", "balance": 25000, "interest_rate": 36.0, "minimum_payment": 2000},
        {"name": "Credit Card B", "balance": 80000, "interest_rate": 24.0, "minimum_payment": 4000},
        {"name": "Car Loan", "balance": 200000, "interest_rate": 10.0, "minimum_payment": 8000},
    ]


# ---------------------------------------------------------------------------
# Agent Instances
# ---------------------------------------------------------------------------


# Provides an isolated instance of the MasterFinancialStrategistAgent for testing.
# Configures fresh agent routing logic and deterministic synthesis capabilities.
# Ensures clean execution state without test cross-contamination between runs.
@pytest.fixture
def master_agent():
    """Fresh MasterFinancialStrategistAgent instance."""
    from agents.master_agent import MasterFinancialStrategistAgent

    return MasterFinancialStrategistAgent()


# Provides an isolated instance of the IncomeExpenseAnalyzerAgent for testing.
# Supplies cash flow metrics, category breakdowns, and anomaly detection rules.
# Enables deterministic validation of transaction analysis logic in unit suites.
@pytest.fixture
def income_analyzer():
    """Fresh IncomeExpenseAnalyzerAgent instance."""
    from agents.income_expense_analyzer import IncomeExpenseAnalyzerAgent

    return IncomeExpenseAnalyzerAgent()


# Provides an isolated instance of the BudgetPlannerAgent for evaluation tests.
# Evaluates category envelope allocations and goal funding recommendations.
# Ensures repeatable budget calculations without external service dependencies.
@pytest.fixture
def budget_planner():
    """Fresh BudgetPlannerAgent instance."""
    from agents.budget_planner import BudgetPlannerAgent

    return BudgetPlannerAgent()


# Provides an isolated instance of the InvestmentAdvisorAgent for test execution.
# Tests risk tolerance assessment logic and asset class allocation models.
# Ensures deterministic investment advice generation without external LLM calls.
@pytest.fixture
def investment_advisor():
    """Fresh InvestmentAdvisorAgent instance."""
    from agents.investment_advisor import InvestmentAdvisorAgent

    return InvestmentAdvisorAgent()


# Provides an isolated instance of the DebtOptimizerAgent for test suites.
# Evaluates repayment strategy selection and debt amortization schedules.
# Verifies accelerated payoff calculations across diverse financial liabilities.
@pytest.fixture
def debt_optimizer():
    """Fresh DebtOptimizerAgent instance."""
    from agents.debt_optimizer import DebtOptimizerAgent

    return DebtOptimizerAgent()


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------


# Provides a test helper fixture for executing master agent query routing logic.
# Dispatches text prompts against user profiles to obtain deterministic route enums.
# Unifies analysis type extraction across test assertions and routing benchmarks.
@pytest.fixture
def run_routing():
    """Fixture that returns a helper function for running the master agent routing."""

    def _run(master_agent, query: str, profile: Dict[str, Any] | None = None) -> str:

        result = master_agent.determine_analysis_type(
            user_input=query,
            user_profile=profile or {},
        )
        if hasattr(result, "value"):
            return result.value
        return str(result).lower()

    return _run


# Validates that a plan dictionary satisfies all structural contract invariants.
# Asserts presence of executive summaries, key metrics, and action bucket arrays.
# Raises explicit assertion errors when plan contracts are violated during tests.
def assert_valid_plan(plan_dict: Dict[str, Any]) -> None:
    """Assert that a plan dict satisfies the Plan contract invariants."""
    assert "executive_summary" in plan_dict, "Plan missing executive_summary"
    assert plan_dict["executive_summary"].strip(), "executive_summary is empty"

    km = plan_dict.get("key_metrics", {})
    assert isinstance(km, dict), "key_metrics must be a dict"

    actions = plan_dict.get("actions", {})
    assert isinstance(actions, dict), "actions must be a dict"
    for bucket in ("next_7_days", "next_30_days", "next_12_months"):
        assert bucket in actions, f"actions missing bucket '{bucket}'"
        assert isinstance(actions[bucket], list), f"actions['{bucket}'] must be a list"


# Asserts that all action items in a list adhere to mandatory schema properties.
# Verifies presence of titles, justifications, positive due days, and impact notes.
# Confirms that action kinds and priorities conform to strict enumeration subsets.
def assert_action_items_valid(items: List[Dict[str, Any]]) -> None:
    """Assert that every action item has the required fields."""
    valid_kinds = {"cashflow", "budget", "debt", "invest", "goal", "education", "generic"}
    valid_priorities = {"low", "medium", "high"}

    for item in items:
        assert "title" in item, f"Action item missing 'title': {item}"
        assert "why" in item, f"Action item missing 'why': {item}"
        assert "kind" in item, f"Action item missing 'kind': {item}"
        assert item["kind"] in valid_kinds, f"Invalid kind '{item['kind']}'"
        assert "due_days" in item, f"Action item missing 'due_days': {item}"
        assert isinstance(item["due_days"], int), f"due_days must be int, got {type(item['due_days'])}"
        assert item["due_days"] > 0, f"due_days must be positive, got {item['due_days']}"
        assert "priority" in item, f"Action item missing 'priority': {item}"
        assert item["priority"] in valid_priorities, f"Invalid priority '{item['priority']}'"
        assert "expected_impact" in item, f"Action item missing 'expected_impact': {item}"
        assert "steps" in item, f"Action item missing 'steps': {item}"
        assert isinstance(item["steps"], list), "steps must be a list"
