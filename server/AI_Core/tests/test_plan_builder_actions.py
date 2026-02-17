from __future__ import annotations

from tools import PlanInputs, build_plan


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

