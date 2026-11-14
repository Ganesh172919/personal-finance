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


def test_plan_builder_preserves_specialist_percentage_points():
    plan = build_plan(
        PlanInputs(
            user_profile={
                "age": 30,
                "annual_income": 120000,
                "monthly_expenses": None,
                "savings": 10000,
                "debts": [],
                "financial_goals": [],
                "risk_tolerance": "moderate",
                "investment_experience": "beginner",
                "time_horizon": 10,
                "transactions": [],
            },
            income_analysis={"summary_metrics": {"savings_rate": 0.25}},
            debt_optimization={"current_debt_situation": {"debt_to_income_ratio": 0.8, "total_debt": 1200}},
        )
    )

    # Without complete monthly profile cash flow, specialist percentages remain
    # percentage points, including values below 1%.
    assert plan.key_metrics.savings_rate == 0.25
    assert plan.key_metrics.debt_to_income == 0.8


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


def test_plan_currency_rounds_half_up_to_match_client_formatting():
    from tools.plan_builder import _format_currency

    assert _format_currency(3454.5, "USD") == "USD 3,455"
    assert _format_currency(2.5, "USD") == "USD 3"
    assert _format_currency(-3454.5, "USD") == "USD -3,455"
    assert _format_currency(-0.2, "USD") == "USD 0"
    assert _format_currency(1234567.49, "USD") == "USD 1,234,567"
    assert _format_currency(float("nan"), "USD") == "-"
    assert _format_currency(None, "USD") == "-"


def test_empty_profile_income_and_expenses_do_not_invent_zero_cash_flow():
    profile = {"annual_income": 0, "monthly_expenses": 0, "savings": 0, "debts": [], "currency": "USD"}
    plan = build_plan(PlanInputs(user_profile=profile))
    assert plan.key_metrics.monthly_net_cash_flow is None
    assert "Monthly net cash flow | -" in render_plan_markdown(plan)

    provided = build_plan(PlanInputs(user_profile={**profile, "annual_income": 60000, "monthly_expenses": 3000}))
    assert provided.key_metrics.monthly_net_cash_flow == 2000
