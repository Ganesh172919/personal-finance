from types import SimpleNamespace

import pytest

from agents.aggregator import AggregatorAgent
from agents.budget_planner import BudgetPlannerAgent
from agents.debt_optimizer import DebtOptimizerAgent
from agents.investment_advisor import InvestmentAdvisorAgent
from agents.master_agent import MasterFinancialStrategistAgent
from utils.agent_helpers import get_currency_code

PROFILE = {
    "age": 30, "annual_income": 60000, "monthly_expenses": 2000, "savings": 10000,
    "debts": [{"name": "Card", "balance": 1000, "interest_rate": 12, "minimum_payment": 50}],
    "financial_goals": [{"name": "Emergency fund", "target": 15000, "timeline_months": 12, "priority": 1}],
}
ANALYSES = {"income_analysis": {"summary_metrics": {"net_cash_flow": 3000, "savings_rate": 60}}}


@pytest.mark.parametrize("agent_class", [MasterFinancialStrategistAgent, AggregatorAgent])
def test_synthesis_and_insights_use_request_currency_without_cross_request_state(agent_class):
    agent = agent_class.__new__(agent_class)
    agent.llm = SimpleNamespace(get_route_metadata=lambda: {})
    for currency, symbol in [("EUR", "€"), ("USD", "$"), ("GBP", "£")]:
        profile = {**PROFILE, "currency": currency}
        if isinstance(agent, AggregatorAgent):
            result = agent.aggregate({"income": {"agent": "income_expense_analyzer", **ANALYSES["income_analysis"]}},
                                     profile, {"options": {"narrative": False}})
        else:
            result = agent.synthesize_plan(profile, ANALYSES, {"options": {"narrative": False}})
        assert currency in result["response"]
        assert symbol in result["insights"][0]["description"]
        assert "₹" not in result["response"] + result["insights"][0]["description"]


@pytest.mark.parametrize("currency,symbol", [("EUR", "€"), ("USD", "$"), ("GBP", "£")])
def test_specialist_narratives_and_strategy_rationale_use_profile_currency(currency, symbol):
    profile = {**PROFILE, "currency": currency}
    budget = BudgetPlannerAgent().create_budget_plan(profile)
    debt = DebtOptimizerAgent().optimize_repayment(profile["debts"], profile)
    investment = InvestmentAdvisorAgent().provide_advice(profile)
    narratives = [budget["detailed_recommendations"], debt["detailed_recommendations"],
                  debt["recommended_strategy"]["rationale"], investment["recommendations"]]
    for narrative in narratives:
        assert symbol in narrative
        assert "₹" not in narrative


@pytest.mark.parametrize("currency", [None, "", "INVALID", "€", "日本円"])
def test_currency_default_is_consistent_across_insights_and_plan(currency):
    profile = {**PROFILE, "currency": currency}
    agent = MasterFinancialStrategistAgent.__new__(MasterFinancialStrategistAgent)
    agent.llm = SimpleNamespace(get_route_metadata=lambda: {})
    result = agent.synthesize_plan(profile, ANALYSES, {"options": {"narrative": False}})
    assert get_currency_code(profile) == "INR"
    assert "INR" in result["response"]
    assert "₹" in result["insights"][0]["description"]
