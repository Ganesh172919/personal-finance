from calendar import monthrange

import pytest

from agents.income_expense_analyzer import IncomeExpenseAnalyzerAgent
from agents.master_agent import MasterFinancialStrategistAgent
from agents.sub_agent_manager import SubAgentManager
from tools.plan_builder import PlanInputs, build_plan, render_plan_markdown
from utils.agent_helpers import extract_key_insights


def transaction(date, amount, *, currency=None):
    result = {
        "date": date, "amount": amount,
        "type": "income" if amount > 0 else "expense",
        "category": "Salary" if amount > 0 else "Food",
        "description": f"Recorded entry {date}",
    }
    if currency:
        result["currency"] = currency
    return result


def recorded_months(months):
    return [row for month in months for row in (
        transaction(f"2026-{month:02d}-01", 3000),
        transaction(f"2026-{month:02d}-{monthrange(2026, month)[1]}", -1000),
    )]


@pytest.mark.parametrize("months", [1, 3, 12])
def test_recorded_cash_flow_uses_calendar_months_instead_of_whole_window(months):
    analysis = IncomeExpenseAnalyzerAgent().analyze_finances(recorded_months(range(1, months + 1)), "USD")
    metrics = analysis["financial_metrics"]
    assert metrics["net_cash_flow"] == months * 2000
    assert metrics["average_monthly_income"] == 3000
    assert metrics["average_monthly_expenses"] == 1000
    assert analysis["summary_metrics"]["monthly_net_flow"] == 2000
    assert analysis["summary_metrics"]["calendar_months_spanned"] == months
    plan = build_plan(PlanInputs(user_profile={"currency": "USD"}, income_analysis=analysis))
    assert plan.key_metrics.monthly_net_cash_flow == 2000
    assert "Monthly net cash flow | USD 2,000" in render_plan_markdown(plan, "USD")
    assert "Recorded transaction totals: income USD" in analysis["insights"]
    assert "Recorded monthly average cash flow: $2,000.00" in extract_key_insights({"income_analysis": analysis}, "USD")[0]["description"]


def test_sparse_year_spans_twelve_months_and_does_not_claim_missing_activity_is_zero():
    analysis = IncomeExpenseAnalyzerAgent().analyze_finances(recorded_months([1, 12]), "EUR")
    coverage = analysis["categorized_data"]["time_period_analysis"]
    assert coverage["months_analyzed"] == 2
    assert coverage["calendar_months_spanned"] == 12
    assert analysis["summary_metrics"]["monthly_net_flow"] == 333.33
    assert any("not confirmed as zero activity" in warning for warning in analysis["data_warnings"])
    plan = build_plan(PlanInputs(user_profile={"currency": "EUR"}, income_analysis=analysis))
    assert plan.key_metrics.monthly_net_cash_flow == 333.33
    assert any("not confirmed as zero activity" in warning for warning in plan.data_warnings)


def test_calendar_boundary_counts_all_touched_months_without_extrapolating_partial_months():
    analysis = IncomeExpenseAnalyzerAgent().analyze_finances([
        transaction("2025-12-31T23:30:00-05:00", 3000),
        transaction("2026-02-01T00:30:00+05:30", -1200),
    ])
    assert analysis["summary_metrics"]["calendar_months_spanned"] == 3
    assert analysis["summary_metrics"]["monthly_net_flow"] == 600
    assert any("Boundary months may be incomplete" in warning for warning in analysis["data_warnings"])


def test_spending_trends_use_recorded_local_months_and_exclude_investments():
    analysis = IncomeExpenseAnalyzerAgent().analyze_finances([
        transaction("2025-12-31T23:30:00-05:00", -100),
        transaction("2026-02-01T00:30:00+05:30", -50),
        {**transaction("2026-01-15", -500), "type": "investment"},
        transaction(None, -25),
    ])
    spending = analysis["categorized_data"]["spending_trends"]
    assert spending["trends"] == {"2025-12": {"Food": 100.0}, "2026-02": {"Food": 50.0}}
    assert spending["summary"] == {
        "total_spending": 175.0,
        "average_monthly_spending": None,
        "top_categories": {"Food": 175.0},
    }


@pytest.mark.parametrize("bad_date", [None, "", "2026-13-01", "2026-02-30", "2026-01", "not-a-date"])
def test_invalid_or_unknown_dates_preserve_period_totals_but_leave_monthly_values_unknown(bad_date):
    analysis = IncomeExpenseAnalyzerAgent().analyze_finances([
        transaction("2026-01-01", 3000), transaction(bad_date, -1000),
    ])
    assert analysis["financial_metrics"]["net_cash_flow"] == 2000
    assert analysis["summary_metrics"]["monthly_net_flow"] is None
    assert "Monthly average cash flow is unavailable" in analysis["insights"]
    assert extract_key_insights({"income_analysis": analysis}) == []
    plan = build_plan(PlanInputs(user_profile={"currency": "USD"}, income_analysis=analysis))
    assert plan.key_metrics.monthly_net_cash_flow is None


def test_real_profile_monthly_values_take_precedence_over_recorded_window():
    analysis = IncomeExpenseAnalyzerAgent().analyze_finances(recorded_months([1, 12]), "USD")
    plan = build_plan(PlanInputs(
        user_profile={"annual_income": 60000, "monthly_expenses": 3000, "currency": "USD"},
        income_analysis=analysis,
    ))
    assert plan.key_metrics.monthly_net_cash_flow == 2000
    assert plan.key_metrics.savings_rate == 40
    assert any("saved profile income and expenses" in assumption for assumption in plan.assumptions)


def test_explicit_zero_recorded_flow_is_preserved_and_is_not_a_negative_deficit():
    analysis = IncomeExpenseAnalyzerAgent().analyze_finances([
        transaction("2026-01-01", 1000), transaction("2026-01-31", -1000),
    ])
    assert analysis["summary_metrics"]["monthly_net_flow"] == 0
    assert not any("monthly average deficit" in concern for concern in analysis["patterns_detected"]["concerns"])
    plan = build_plan(PlanInputs(user_profile={"currency": "USD"}, income_analysis=analysis))
    assert plan.key_metrics.monthly_net_cash_flow == 0


def test_explicit_no_income_with_recorded_profile_expenses_does_not_invent_a_savings_rate():
    plan = build_plan(PlanInputs(user_profile={"annual_income": 0, "monthly_expenses": 200}))
    assert plan.key_metrics.monthly_net_cash_flow == -200
    assert plan.key_metrics.savings_rate is None


@pytest.mark.parametrize("flow", [None, float("nan"), float("inf")])
def test_unknown_or_nonfinite_monthly_values_cannot_promote_total_period_cash_flow(flow):
    analysis = {"summary_metrics": {"net_cash_flow": 24000, "monthly_net_flow": flow}}
    plan = build_plan(PlanInputs(user_profile={"annual_income": 0, "monthly_expenses": 0}, income_analysis=analysis))
    assert plan.key_metrics.monthly_net_cash_flow is None
    assert extract_key_insights({"income_analysis": analysis}) == []


def test_legacy_period_only_summary_is_labeled_without_claiming_monthly_coverage():
    analysis = {"summary_metrics": {"net_cash_flow": 24000}}
    plan = build_plan(PlanInputs(user_profile={"currency": "USD"}, income_analysis=analysis))
    assert plan.key_metrics.monthly_net_cash_flow is None
    insight = extract_key_insights({"income_analysis": analysis}, "USD")[0]
    assert insight["description"] == "Recorded net cash flow: $24,000.00"


def test_income_narrative_uses_request_currency_without_cross_request_state():
    agent = IncomeExpenseAnalyzerAgent()
    rows = recorded_months([1])
    for currency in ("USD", "EUR", "GBP"):
        analysis = agent.analyze_finances(rows, currency)
        assert f"income {currency} 3,000.00" in analysis["insights"]
        assert "INR" not in analysis["insights"]
    assert "INR" not in agent.analyze_finances(rows)["insights"]
    tagged = [dict(row, currency="EUR") for row in rows]
    assert "income EUR 3,000.00" in agent.analyze_finances(tagged)["insights"]


def test_dispatch_and_cache_inputs_include_the_profile_currency():
    manager = SubAgentManager({})
    rows = recorded_months([1])
    assert manager._build_agent_kwargs("income_expense_analyzer", {"transactions": rows, "currency": "USD"}, "", {}) == {
        "transactions": rows, "currency_code": "USD",
    }
    task = {"id": "income", "assigned_agent": "income_expense_analyzer"}
    assert manager._make_subtask_cache_key(task, {"transactions": rows, "currency": "USD"}, "", {}) != manager._make_subtask_cache_key(task, {"transactions": rows, "currency": "EUR"}, "", {})


@pytest.mark.parametrize("summary,label", [
    ({"net_cash_flow": 24000}, "Recorded net cash flow: $24,000.00"),
    ({"net_cash_flow": 24000, "monthly_net_flow": 2000}, "Recorded monthly average cash flow: $2,000.00"),
    ({"net_cash_flow": 24000, "monthly_net_flow": None}, "Recorded monthly cash flow unavailable"),
])
def test_legacy_master_synthesis_helpers_keep_period_and_monthly_cash_flow_distinct(summary, label):
    agent = MasterFinancialStrategistAgent.__new__(MasterFinancialStrategistAgent)
    analysis = {"summary_metrics": summary}
    assert agent._extract_key_insight("income_analysis", analysis, "USD") == label
    assert label in agent._extract_key_metrics({"income_analysis": analysis}, {"currency": "USD"})
    assert label in agent._create_fallback_plan({"income_analysis": analysis}, "USD")
