r"""
test_determinism.py - Determinism / Reproducibility Tests
===========================================================

Validates that deterministic agents produce identical output when
given the same input.  This is critical because:

1. The master agent's routing logic must be deterministic (no LLM).
2. All specialist agents (income, budget, investment, debt) are
   deterministic-first -- they compute results without LLM calls.
3. The plan builder must produce the same plan for the same analyses.

These tests run each agent multiple times and compare outputs.
LLM calls are not needed (agents are deterministic by design).

MINDMAP FLOW
------------
::

    Agent Determinism Test Suite
    ├── 1. IncomeExpenseAnalyzer Determinism
    │   ├── Same transactions -> Identical category totals & net cashflow
    │   ├── Same health score & identical financial ratios
    │   └── JSON serialization byte-for-byte match
    ├── 2. BudgetPlanner Determinism
    │   ├── Same profile -> Identical 50/30/20 & debt-heavy splits
    │   ├── Deterministic emergency fund runway & gap
    │   └── Profile hash cache hit invariance
    ├── 3. InvestmentAdvisor Determinism
    │   ├── Same demographics & tolerance -> Identical asset allocation
    │   └── Identical compound return CAGR projections
    ├── 4. DebtOptimizer Determinism
    │   ├── Avalanche & Snowball payoff timelines reproducible
    │   └── Total interest savings calculation bitwise identical
    └── 5. PlanBuilder Determinism
        ├── Plan structure, key metrics, and action buckets match
        └── Idempotent action IDs (SHA-256 hash match)

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |              Input: Fixed Mock Profile / Transactions         |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |                 Run Agent Invocation 1 -> Result 1            |
    |                 Run Agent Invocation 2 -> Result 2            |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |     Compare: json.dumps(Result 1) == json.dumps(Result 2)     |
    +-------------------------------+-------------------------------+
                                    |
                         [Are Outputs Identical?]
                               /         \
                             YES          NO (Non-deterministic drift)
                             /             \
                            v               v
                     +------------+   +-----------------------------+
                     | Test Pass  |   | Test Failure & Diff Report  |
                     +------------+   +-----------------------------+
"""

from __future__ import annotations

import json

import pytest

# ---------------------------------------------------------------------------
# Income Expense Analyzer Determinism
# ---------------------------------------------------------------------------


@pytest.mark.determinism
class TestIncomeAnalyzerDeterminism:
    """IncomeExpenseAnalyzerAgent should produce identical output for same input."""

    def test_same_output_same_transactions(self, income_analyzer, sample_transactions):
        result1 = income_analyzer.analyze_finances(sample_transactions)
        result2 = income_analyzer.analyze_finances(sample_transactions)

        assert json.dumps(result1, sort_keys=True) == json.dumps(result2, sort_keys=True), (
            "Income analyzer produced different results for the same transactions"
        )

    def test_same_output_empty_transactions(self, income_analyzer):
        result1 = income_analyzer.analyze_finances([])
        result2 = income_analyzer.analyze_finances([])

        assert json.dumps(result1, sort_keys=True) == json.dumps(result2, sort_keys=True)

    def test_same_health_score(self, income_analyzer, sample_transactions):
        result1 = income_analyzer.analyze_finances(sample_transactions)
        result2 = income_analyzer.analyze_finances(sample_transactions)

        assert result1.get("health_score") == result2.get("health_score")

    def test_same_summary_metrics(self, income_analyzer, sample_transactions):
        result1 = income_analyzer.analyze_finances(sample_transactions)
        result2 = income_analyzer.analyze_finances(sample_transactions)

        sm1 = result1.get("summary_metrics", {})
        sm2 = result2.get("summary_metrics", {})
        assert json.dumps(sm1, sort_keys=True) == json.dumps(sm2, sort_keys=True)


# ---------------------------------------------------------------------------
# Budget Planner Determinism
# ---------------------------------------------------------------------------


@pytest.mark.determinism
class TestBudgetPlannerDeterminism:
    """BudgetPlannerAgent should produce identical budget for same profile."""

    def test_same_output_same_profile(self, budget_planner, full_profile):
        result1 = budget_planner.create_budget_plan(full_profile)
        result2 = budget_planner.create_budget_plan(full_profile)

        assert json.dumps(result1, sort_keys=True) == json.dumps(result2, sort_keys=True), (
            "Budget planner produced different results for the same profile"
        )

    def test_same_allocations(self, budget_planner, full_profile):
        result1 = budget_planner.create_budget_plan(full_profile)
        result2 = budget_planner.create_budget_plan(full_profile)

        alloc1 = result1.get("budget_allocation", {})
        alloc2 = result2.get("budget_allocation", {})
        assert json.dumps(alloc1, sort_keys=True) == json.dumps(alloc2, sort_keys=True)

    def test_same_savings_plan(self, budget_planner, full_profile):
        result1 = budget_planner.create_budget_plan(full_profile)
        result2 = budget_planner.create_budget_plan(full_profile)

        sp1 = result1.get("savings_plan", {})
        sp2 = result2.get("savings_plan", {})
        assert json.dumps(sp1, sort_keys=True) == json.dumps(sp2, sort_keys=True)

    def test_same_output_minimal_profile(self, budget_planner, minimal_profile):
        result1 = budget_planner.create_budget_plan(minimal_profile)
        result2 = budget_planner.create_budget_plan(minimal_profile)

        assert json.dumps(result1, sort_keys=True) == json.dumps(result2, sort_keys=True)


# ---------------------------------------------------------------------------
# Investment Advisor Determinism
# ---------------------------------------------------------------------------


@pytest.mark.determinism
class TestInvestmentAdvisorDeterminism:
    """InvestmentAdvisorAgent should produce same risk profile and allocation."""

    def test_same_output_same_profile(self, investment_advisor, full_profile):
        result1 = investment_advisor.provide_advice(full_profile)
        result2 = investment_advisor.provide_advice(full_profile)

        assert json.dumps(result1, sort_keys=True) == json.dumps(result2, sort_keys=True), (
            "Investment advisor produced different results for the same profile"
        )

    def test_same_risk_profile(self, investment_advisor, full_profile):
        result1 = investment_advisor.provide_advice(full_profile)
        result2 = investment_advisor.provide_advice(full_profile)

        assert result1.get("risk_profile") == result2.get("risk_profile")

    def test_same_asset_allocation(self, investment_advisor, full_profile):
        result1 = investment_advisor.provide_advice(full_profile)
        result2 = investment_advisor.provide_advice(full_profile)

        alloc1 = result1.get("portfolio_allocation", {})
        alloc2 = result2.get("portfolio_allocation", {})
        assert json.dumps(alloc1, sort_keys=True) == json.dumps(alloc2, sort_keys=True)

    def test_same_expected_returns(self, investment_advisor, full_profile):
        result1 = investment_advisor.provide_advice(full_profile)
        result2 = investment_advisor.provide_advice(full_profile)

        ret1 = result1.get("expected_returns", {})
        ret2 = result2.get("expected_returns", {})
        assert json.dumps(ret1, sort_keys=True) == json.dumps(ret2, sort_keys=True)


# ---------------------------------------------------------------------------
# Debt Optimizer Determinism
# ---------------------------------------------------------------------------


@pytest.mark.determinism
class TestDebtOptimizerDeterminism:
    """DebtOptimizerAgent should produce same strategy for same debts."""

    def test_same_output_same_debts(self, debt_optimizer, sample_debts, full_profile):
        result1 = debt_optimizer.optimize_repayment(sample_debts, full_profile)
        result2 = debt_optimizer.optimize_repayment(sample_debts, full_profile)

        assert json.dumps(result1, sort_keys=True) == json.dumps(result2, sort_keys=True), (
            "Debt optimizer produced different results for the same input"
        )

    def test_same_recommended_strategy(self, debt_optimizer, sample_debts, full_profile):
        result1 = debt_optimizer.optimize_repayment(sample_debts, full_profile)
        result2 = debt_optimizer.optimize_repayment(sample_debts, full_profile)

        strat1 = result1.get("recommended_strategy", {})
        strat2 = result2.get("recommended_strategy", {})
        assert json.dumps(strat1, sort_keys=True) == json.dumps(strat2, sort_keys=True)

    def test_same_debt_analysis(self, debt_optimizer, sample_debts, full_profile):
        result1 = debt_optimizer.optimize_repayment(sample_debts, full_profile)
        result2 = debt_optimizer.optimize_repayment(sample_debts, full_profile)

        analysis1 = result1.get("current_debt_situation", {})
        analysis2 = result2.get("current_debt_situation", {})
        assert json.dumps(analysis1, sort_keys=True) == json.dumps(analysis2, sort_keys=True)

    def test_same_no_debt_response(self, debt_optimizer, full_profile):
        result1 = debt_optimizer.optimize_repayment([], full_profile)
        result2 = debt_optimizer.optimize_repayment([], full_profile)

        assert json.dumps(result1, sort_keys=True) == json.dumps(result2, sort_keys=True)


# ---------------------------------------------------------------------------
# Plan Builder Determinism
# ---------------------------------------------------------------------------


@pytest.mark.determinism
class TestPlanBuilderDeterminism:
    """Plan builder should produce identical plan for same inputs."""

    def test_same_plan_same_inputs(self, full_profile):
        from tools.plan_builder import PlanInputs, build_plan

        inputs = PlanInputs(user_profile=full_profile)
        plan1 = build_plan(inputs).model_dump()
        plan2 = build_plan(inputs).model_dump()

        assert json.dumps(plan1, sort_keys=True) == json.dumps(plan2, sort_keys=True), (
            "Plan builder produced different plans for the same inputs"
        )

    def test_same_plan_no_profile(self):
        from tools.plan_builder import PlanInputs, build_plan

        inputs = PlanInputs(user_profile=None)
        plan1 = build_plan(inputs).model_dump()
        plan2 = build_plan(inputs).model_dump()

        assert json.dumps(plan1, sort_keys=True) == json.dumps(plan2, sort_keys=True)

    def test_same_plan_with_all_specialists(self, full_profile):
        from tools.plan_builder import PlanInputs, build_plan

        income = {"summary_metrics": {"net_cash_flow": 15000, "savings_rate": 25.0}}
        budget = {"savings_plan": {"total_monthly_savings": 20000}}
        invest = {"risk_profile": "moderate"}
        debt = {
            "current_debt_situation": {"total_debt": 3650000, "debt_to_income_ratio": 3.33},
            "recommended_strategy": {"recommended_method": "avalanche"},
        }

        inputs = PlanInputs(
            user_profile=full_profile,
            income_analysis=income,
            budget_plan=budget,
            investment_advice=invest,
            debt_optimization=debt,
        )
        plan1 = build_plan(inputs).model_dump()
        plan2 = build_plan(inputs).model_dump()

        assert json.dumps(plan1, sort_keys=True) == json.dumps(plan2, sort_keys=True)

    def test_same_plan_action_ids(self, full_profile):
        from tools.plan_builder import PlanInputs, build_plan

        inputs = PlanInputs(user_profile=full_profile)
        plan1 = build_plan(inputs).model_dump()
        plan2 = build_plan(inputs).model_dump()

        ids1 = [
            item["id"]
            for bucket in ("next_7_days", "next_30_days", "next_12_months")
            for item in plan1["actions"][bucket]
        ]
        ids2 = [
            item["id"]
            for bucket in ("next_7_days", "next_30_days", "next_12_months")
            for item in plan2["actions"][bucket]
        ]
        assert ids1 == ids2, "Action IDs differ between runs"


# ---------------------------------------------------------------------------
# Master Agent Routing Determinism
# ---------------------------------------------------------------------------


@pytest.mark.determinism
class TestMasterRoutingDeterminism:
    """Master agent routing should be deterministic."""

    def test_same_route_same_query(self, master_agent, full_profile):
        queries = [
            "Create a budget for me",
            "Help me pay off debt",
            "Optimize my portfolio",
            "Show my spending",
            "What is inflation?",
        ]
        for query in queries:
            results = [
                master_agent.determine_analysis_type(query, full_profile)
                for _ in range(5)
            ]
            values = [r.value if hasattr(r, "value") else str(r) for r in results]
            assert len(set(values)) == 1, (
                f"Routing not deterministic for '{query}': got {set(values)}"
            )
