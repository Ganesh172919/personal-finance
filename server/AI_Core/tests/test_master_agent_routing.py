from agents.master_agent import MasterFinancialStrategistAgent
from graph.state import AnalysisType


def test_routing_define_compound_interest_goes_to_education():
    agent = MasterFinancialStrategistAgent()
    analysis_type = agent.determine_analysis_type(
        user_input="Define compound interest",
        user_profile={"age": 30},
    )

    assert analysis_type == AnalysisType.FINANCIAL_EDUCATION


def test_routing_personal_credit_card_interest_goes_to_debt_optimization():
    agent = MasterFinancialStrategistAgent()
    analysis_type = agent.determine_analysis_type(
        user_input="Why is my credit card interest so high?",
        user_profile={"age": 30},
    )

    assert analysis_type == AnalysisType.DEBT_OPTIMIZATION

