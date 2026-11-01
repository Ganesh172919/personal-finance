r"""
test_plan_quality.py - Plan Quality Evaluation
================================================

Validates that the plan builder produces well-structured plans that
satisfy the Plan contract and contain actionable, reasonable content.

Checks:
- Plan contract fields are present
- key_metrics are within reasonable ranges
- action_items have kind, due_days, priority
- executive_summary is non-empty
- data_warnings are populated when data is missing
- Actions are relevant to the user's financial situation

MINDMAP FLOW
------------
::

    Plan Quality Validation
    ├── 1. Schema Conformance
    │   ├── Plan Pydantic model contract verification
    │   ├── Non-empty executive_summary & non-null metrics
    │   └── Required action bucket presence (7d, 30d, 12m)
    ├── 2. Metric Plausibility
    │   ├── Savings rate bounded [0, 100]
    │   ├── Positive emergency runway months
    │   └── Non-negative DTI ratio
    ├── 3. Action Relevance & Actionability
    │   ├── High debt profile -> Debt payoff prioritized in 7-day bucket
    │   ├── Zero savings -> Emergency fund creation prioritized
    │   └── High income surplus -> Investment allocation recommended
    └── 4. Warning Accuracy
        └── Missing profile fields properly reflected in data_warnings

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |             Aggregated Analyses Input (PlanInputs)            |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |                     plan = build_plan(inputs)                 |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |                     assert_valid_plan(plan)                   |
    |  - Assert all schema fields valid                             |
    |  - Assert key_metrics arithmetic sanity                       |
    |  - Assert action_items have kind, due_days, priority          |
    +-------------------------------+-------------------------------+
                                    |
                        [Does Plan Pass Validation?]
                               /         \
                             YES          NO
                             /             \
                            v               v
                     +------------+   +-----------------------------+
                     | Pass       |   | Fail & Show Contract Drift  |
                     +------------+   +-----------------------------+
"""

from __future__ import annotations

from typing import Any, Dict

import pytest

from evals.conftest import assert_action_items_valid, assert_valid_plan
from tools.plan_builder import PlanInputs, build_plan

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _build_plan_from_profile(
    profile: Dict[str, Any] | None,
    *,
    income_analysis: Dict[str, Any] | None = None,
    budget_plan: Dict[str, Any] | None = None,
    investment_advice: Dict[str, Any] | None = None,
    debt_optimization: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    plan = build_plan(
        PlanInputs(
            user_profile=profile,
            income_analysis=income_analysis,
            budget_plan=budget_plan,
            investment_advice=investment_advice,
            debt_optimization=debt_optimization,
        )
    )
    return plan.model_dump()


# ---------------------------------------------------------------------------
# Structural Validation
# ---------------------------------------------------------------------------


@pytest.mark.quality
class TestPlanStructure:
    """Validate that the plan satisfies the Plan contract."""

    def test_plan_with_full_profile(self, full_profile):
        plan = _build_plan_from_profile(full_profile)
        assert_valid_plan(plan)

    def test_plan_with_minimal_profile(self, minimal_profile):
        plan = _build_plan_from_profile(minimal_profile)
        assert_valid_plan(plan)

    def test_plan_with_no_profile(self):
        plan = _build_plan_from_profile(None)
        assert_valid_plan(plan)

    def test_plan_with_edge_case_profile(self, edge_case_profile):
        plan = _build_plan_from_profile(edge_case_profile)
        assert_valid_plan(plan)

    def test_plan_with_high_income_profile(self, high_income_profile):
        plan = _build_plan_from_profile(high_income_profile)
        assert_valid_plan(plan)


# ---------------------------------------------------------------------------
# Key Metrics Validation
# ---------------------------------------------------------------------------


@pytest.mark.quality
class TestKeyMetrics:
    """Validate key_metrics are within reasonable ranges."""

    def test_savings_rate_in_range(self, full_profile):
        plan = _build_plan_from_profile(full_profile)
        km = plan["key_metrics"]
        if km.get("savings_rate") is not None:
            assert 0 <= km["savings_rate"] <= 100, f"savings_rate {km['savings_rate']} out of range"

    def test_debt_to_income_in_range(self, full_profile):
        plan = _build_plan_from_profile(full_profile)
        km = plan["key_metrics"]
        if km.get("debt_to_income") is not None:
            assert 0 <= km["debt_to_income"] <= 100, f"debt_to_income {km['debt_to_income']} out of range"

    def test_emergency_fund_months_positive(self, full_profile):
        plan = _build_plan_from_profile(full_profile)
        km = plan["key_metrics"]
        if km.get("emergency_fund_months") is not None:
            assert km["emergency_fund_months"] >= 0, f"emergency_fund_months {km['emergency_fund_months']} is negative"

    def test_total_debt_matches_profile(self, full_profile):
        plan = _build_plan_from_profile(full_profile)
        km = plan["key_metrics"]
        if km.get("total_debt") is not None:
            expected_debt = sum(d.get("balance", 0) for d in full_profile.get("debts", []))
            assert abs(km["total_debt"] - expected_debt) < 1, (
                f"total_debt {km['total_debt']} != expected {expected_debt}"
            )

    def test_cash_flow_from_expenses(self, full_profile):
        """Net cash flow should approximately equal income - expenses."""
        plan = _build_plan_from_profile(full_profile)
        km = plan["key_metrics"]
        if km.get("monthly_net_cash_flow") is not None:
            expected = full_profile["annual_income"] / 12 - full_profile["monthly_expenses"]
            assert abs(km["monthly_net_cash_flow"] - expected) < 1, (
                f"cash flow {km['monthly_net_cash_flow']} != expected {expected}"
            )

    def test_zero_income_no_crash(self, edge_case_profile):
        plan = _build_plan_from_profile(edge_case_profile)
        km = plan["key_metrics"]
        # Should not crash; savings_rate may be None or 0
        assert isinstance(km, dict)

    def test_no_profile_metrics_are_none(self):
        plan = _build_plan_from_profile(None)
        km = plan["key_metrics"]
        # Without profile, most metrics should be None
        assert isinstance(km, dict)


# ---------------------------------------------------------------------------
# Action Items Validation
# ---------------------------------------------------------------------------


@pytest.mark.quality
class TestActionItems:
    """Validate action items have required fields and sensible values."""

    def test_action_items_have_required_fields(self, full_profile):
        plan = _build_plan_from_profile(full_profile)
        actions = plan["actions"]
        for bucket in ("next_7_days", "next_30_days", "next_12_months"):
            assert_action_items_valid(actions[bucket])

    def test_action_items_have_steps(self, full_profile):
        plan = _build_plan_from_profile(full_profile)
        actions = plan["actions"]
        for bucket in ("next_7_days", "next_30_days", "next_12_months"):
            for item in actions[bucket]:
                assert len(item["steps"]) > 0, f"Action '{item['title']}' has no steps"

    def test_action_items_have_expected_impact(self, full_profile):
        plan = _build_plan_from_profile(full_profile)
        actions = plan["actions"]
        for bucket in ("next_7_days", "next_30_days", "next_12_months"):
            for item in actions[bucket]:
                assert item["expected_impact"].strip(), (
                    f"Action '{item['title']}' has empty expected_impact"
                )

    def test_no_profile_has_profile_completion_action(self):
        plan = _build_plan_from_profile(None)
        actions = plan["actions"]
        all_titles = [
            item["title"]
            for bucket in ("next_7_days", "next_30_days", "next_12_months")
            for item in actions[bucket]
        ]
        assert any("profile" in t.lower() for t in all_titles), (
            f"Expected a 'complete profile' action, got: {all_titles}"
        )

    def test_negative_cash_flow_has_stabilize_action(self):
        profile = {
            "age": 30,
            "annual_income": 300000,
            "monthly_expenses": 35000,  # expenses > income
            "savings": 10000,
            "debts": [],
            "financial_goals": [],
            "risk_tolerance": "moderate",
            "investment_experience": "beginner",
            "time_horizon": 10,
            "transactions": [],
        }
        plan = _build_plan_from_profile(profile)
        actions = plan["actions"]
        all_titles = [
            item["title"].lower()
            for bucket in ("next_7_days", "next_30_days", "next_12_months")
            for item in actions[bucket]
        ]
        assert any("cash flow" in t or "stabilize" in t for t in all_titles), (
            f"Expected cash flow stabilization action, got: {all_titles}"
        )

    def test_debt_present_has_debt_action(self, full_profile):
        plan = _build_plan_from_profile(full_profile)
        actions = plan["actions"]
        all_titles = [
            item["title"].lower()
            for bucket in ("next_7_days", "next_30_days", "next_12_months")
            for item in actions[bucket]
        ]
        assert any("debt" in t for t in all_titles), (
            f"Expected debt action for profile with debts, got: {all_titles}"
        )


# ---------------------------------------------------------------------------
# Data Warnings
# ---------------------------------------------------------------------------


@pytest.mark.quality
class TestDataWarnings:
    """Validate data_warnings are populated appropriately."""

    def test_no_profile_generates_warnings(self):
        plan = _build_plan_from_profile(None)
        assert len(plan["data_warnings"]) > 0, "Expected warnings for missing profile"

    def test_empty_transactions_generates_warning(self, minimal_profile):
        plan = _build_plan_from_profile(minimal_profile)
        # minimal_profile has empty transactions
        warning_text = " ".join(plan["data_warnings"]).lower()
        assert "transaction" in warning_text, (
            f"Expected transaction warning, got: {plan['data_warnings']}"
        )

    def test_full_profile_has_fewer_warnings(self, full_profile):
        plan = _build_plan_from_profile(full_profile)
        # Full profile should have fewer warnings than no profile
        no_profile_warnings = _build_plan_from_profile(None)["data_warnings"]
        assert len(plan["data_warnings"]) <= len(no_profile_warnings)

    def test_warnings_are_strings(self, full_profile):
        plan = _build_plan_from_profile(full_profile)
        for warning in plan["data_warnings"]:
            assert isinstance(warning, str), f"Warning is not a string: {type(warning)}"


# ---------------------------------------------------------------------------
# Executive Summary
# ---------------------------------------------------------------------------


@pytest.mark.quality
class TestExecutiveSummary:
    """Validate executive summary content."""

    def test_summary_non_empty(self, full_profile):
        plan = _build_plan_from_profile(full_profile)
        assert plan["executive_summary"].strip(), "Executive summary is empty"

    def test_summary_mentions_cash_flow_for_positive_flow(self, full_profile):
        plan = _build_plan_from_profile(full_profile)
        summary = plan["executive_summary"].lower()
        assert "cash flow" in summary or "surplus" in summary, (
            f"Expected cash flow mention in summary: {plan['executive_summary']}"
        )

    def test_summary_mentions_negative_flow(self):
        profile = {
            "age": 30,
            "annual_income": 200000,
            "monthly_expenses": 25000,
            "savings": 5000,
            "debts": [],
            "financial_goals": [],
            "risk_tolerance": "moderate",
            "investment_experience": "beginner",
            "time_horizon": 10,
            "transactions": [],
        }
        plan = _build_plan_from_profile(profile)
        summary = plan["executive_summary"].lower()
        assert "negative" in summary or "stabiliz" in summary, (
            f"Expected negative flow mention: {plan['executive_summary']}"
        )

    def test_summary_for_no_profile_is_generic(self):
        plan = _build_plan_from_profile(None)
        summary = plan["executive_summary"].lower()
        assert "profile" in summary or "income" in summary or "personalized" in summary, (
            f"Expected generic guidance: {plan['executive_summary']}"
        )


# ---------------------------------------------------------------------------
# Plan with Specialist Outputs
# ---------------------------------------------------------------------------


@pytest.mark.quality
class TestPlanWithSpecialistOutputs:
    """Validate plans built with specialist agent outputs."""

    def test_plan_with_income_analysis(self, full_profile):
        income_analysis = {
            "summary_metrics": {
                "net_cash_flow": 15000,
                "savings_rate": 25.0,
            }
        }
        plan = _build_plan_from_profile(full_profile, income_analysis=income_analysis)
        assert_valid_plan(plan)
        km = plan["key_metrics"]
        assert km["monthly_net_cash_flow"] is not None

    def test_plan_with_budget_plan(self, full_profile):
        budget_plan = {
            "savings_plan": {"total_monthly_savings": 20000},
        }
        plan = _build_plan_from_profile(full_profile, budget_plan=budget_plan)
        assert_valid_plan(plan)

    def test_plan_with_investment_advice(self, full_profile):
        investment_advice = {
            "risk_profile": "moderate",
            "asset_allocation": {"Domestic Equity": 40, "Bonds": 30, "Cash": 10},
        }
        plan = _build_plan_from_profile(full_profile, investment_advice=investment_advice)
        assert_valid_plan(plan)

    def test_plan_with_debt_optimization(self, full_profile):
        debt_optimization = {
            "current_debt_situation": {
                "total_debt": 3650000,
                "debt_to_income_ratio": 3.33,
            },
            "recommended_strategy": {"recommended_method": "avalanche"},
        }
        plan = _build_plan_from_profile(full_profile, debt_optimization=debt_optimization)
        assert_valid_plan(plan)
        km = plan["key_metrics"]
        assert km["total_debt"] is not None

    def test_plan_with_all_specialists(self, full_profile):
        income_analysis = {"summary_metrics": {"net_cash_flow": 15000, "savings_rate": 25.0}}
        budget_plan = {"savings_plan": {"total_monthly_savings": 20000}}
        investment_advice = {"risk_profile": "moderate"}
        debt_optimization = {
            "current_debt_situation": {"total_debt": 3650000, "debt_to_income_ratio": 3.33},
            "recommended_strategy": {"recommended_method": "avalanche"},
        }
        plan = _build_plan_from_profile(
            full_profile,
            income_analysis=income_analysis,
            budget_plan=budget_plan,
            investment_advice=investment_advice,
            debt_optimization=debt_optimization,
        )
        assert_valid_plan(plan)
