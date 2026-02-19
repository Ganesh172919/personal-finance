from __future__ import annotations

from tools import PlanInputs, build_plan, render_plan_markdown


def test_plan_builder_action_items_have_kind_and_due_days():
    plan = build_plan(
        PlanInputs(
            user_profile={
                "age": 30,
                "annual_income": 600000,
                "monthly_expenses": 35000,
                "savings": 50000,
                "debts": [],
                "financial_goals": [],
                "risk_tolerance": "moderate",
                "investment_experience": "beginner",
                "time_horizon": 10,
                "transactions": [],
            }
        )
    )

    allowed = {"cashflow", "budget", "debt", "invest", "goal", "education", "generic"}

    for bucket in [*plan.actions.next_7_days, *plan.actions.next_30_days, *plan.actions.next_12_months]:
        assert bucket.kind in allowed
        assert bucket.due_days is not None
        assert isinstance(bucket.due_days, int)
        assert bucket.due_days > 0
        assert bucket.id


def test_plan_builder_normalizes_ratio_metrics_to_percent():
    plan = build_plan(
        PlanInputs(
            user_profile={
                "age": 30,
                "annual_income": 120000,
                "monthly_expenses": 6000,
                "savings": 10000,
                "debts": [],
                "financial_goals": [],
                "risk_tolerance": "moderate",
                "investment_experience": "beginner",
                "time_horizon": 10,
                "transactions": [],
            },
            income_analysis={"summary_metrics": {"savings_rate": 0.25}},
            debt_optimization={"current_debt_situation": {"debt_to_income_ratio": 0.4, "total_debt": 20000}},
        )
    )

    assert plan.key_metrics.savings_rate == 25.0
    assert plan.key_metrics.debt_to_income == 40.0


def test_plan_markdown_uses_currency_code():
    plan = build_plan(
        PlanInputs(
            user_profile={
                "age": 30,
                "annual_income": 600000,
                "monthly_expenses": 35000,
                "savings": 50000,
                "debts": [],
                "financial_goals": [],
                "risk_tolerance": "moderate",
                "investment_experience": "beginner",
                "time_horizon": 10,
                "transactions": [],
                "currency": "EUR",
            },
            budget_plan={"savings_plan": {"total_monthly_savings": 5000}},
        )
    )

    markdown = render_plan_markdown(plan, currency_code="EUR")
    assert "EUR 5,000" in markdown
