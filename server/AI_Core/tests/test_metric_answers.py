from types import SimpleNamespace

import pytest

from agents.master_agent import MasterFinancialStrategistAgent
from utils.metric_answers import direct_metric_answer

PROFILE = {"annual_income": 90000, "currency": "USD", "debts": [{"minimum_payment": 60}]}
QUESTION = "What is my monthly income and minimum debt payment ratio?"


def test_direct_metric_answer_contains_income_and_calculation():
    result = direct_metric_answer(QUESTION, PROFILE)
    assert "USD 7,500.00" in result
    assert "USD 90,000.00 annual income / 12" in result
    assert "0.80%" in result
    assert "USD 60.00 monthly minimum payments / USD 7,500.00 monthly income x 100" in result


@pytest.mark.parametrize("income", [0, None, "invalid", float("inf"), -1])
def test_ratio_does_not_invent_a_value_when_income_is_missing_or_zero(income):
    result = direct_metric_answer("My debt payment ratio", {**PROFILE, "annual_income": income})
    assert "positive monthly income" in result
    assert "%" not in result


def test_missing_payments_are_distinguished_from_an_empty_debt_list():
    assert "Add all debt minimum payments" in direct_metric_answer(QUESTION, {**PROFILE, "debts": [{}]})
    assert "0.00%" in direct_metric_answer(QUESTION, {**PROFILE, "debts": []})


def test_unrelated_questions_do_not_get_a_metric_prefix():
    assert direct_metric_answer("Help me plan a holiday", PROFILE) == ""


def test_synthesis_keeps_direct_answer_and_does_not_invoke_narration():
    agent = MasterFinancialStrategistAgent.__new__(MasterFinancialStrategistAgent)
    agent.llm = SimpleNamespace(get_route_metadata=lambda: {})
    result = agent.synthesize_plan(PROFILE, {}, {"user_input": QUESTION, "options": {"narrative": False}})
    assert result["response"].startswith("**Monthly income: USD 7,500.00**")
    assert "0.80%" in result["response"]
    assert result["fallback_used"] is False


def test_direct_metric_answer_total_debt_and_savings_rate():
    profile = {
        "annual_income": 120000,
        "monthly_expenses": 6000,
        "currency": "USD",
        "debts": [
            {"name": "Credit Card", "balance": 5000, "minimum_payment": 150},
            {"name": "Student Loan", "balance": 15000, "minimum_payment": 250},
        ],
    }

    # Total debt query
    debt_res = direct_metric_answer("What is my total debt?", profile)
    assert "Total debt: USD 20,000.00" in debt_res
    assert "across 2 debt account(s)" in debt_res

    # Savings rate query
    # monthly_income = 10,000, monthly_expenses = 6,000, net = 4,000 -> 40.00%
    savings_res = direct_metric_answer("What is my current savings rate?", profile)
    assert "Savings rate: 40.00%" in savings_res
    assert "USD 4,000.00 net monthly savings" in savings_res

