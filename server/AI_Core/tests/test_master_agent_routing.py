from agents.master_agent import MasterFinancialStrategistAgent
from graph.state import AnalysisType
from utils.agent_routing import education_follow_up


def test_routing_define_compound_interest_goes_to_education():
    agent = MasterFinancialStrategistAgent()
    analysis_type = agent.determine_analysis_type(
        user_input="Define compound interest",
        user_profile={"age": 30},
    )

    assert analysis_type == AnalysisType.FINANCIAL_EDUCATION


def test_hypothetical_compound_interest_with_amounts_goes_to_education():
    agent = MasterFinancialStrategistAgent()
    analysis_type = agent.determine_analysis_type(
        user_input=(
            "What is compound interest? If a hypothetical ₹1,000 earns 10% per year "
            "compounded annually for two years, show the ending amount."
        ),
        user_profile={"age": 30},
        conversation_history=[{"role": "user", "content": "How much did I spend this month?"}],
    )

    assert analysis_type == AnalysisType.FINANCIAL_EDUCATION


def test_routing_personal_credit_card_interest_goes_to_debt_optimization():
    agent = MasterFinancialStrategistAgent()
    analysis_type = agent.determine_analysis_type(
        user_input="Why is my credit card interest so high?",
        user_profile={"age": 30},
    )

    assert analysis_type == AnalysisType.DEBT_OPTIMIZATION


def test_routing_first_person_learning_intro_goes_to_education():
    agent = MasterFinancialStrategistAgent()
    analysis_type = agent.determine_analysis_type(
        user_input=(
            "I’m trying to understand budgeting. In two short sentences, explain the difference "
            "between fixed expenses and variable expenses, with one generic example of each."
        ),
        user_profile={"age": 30},
    )

    assert analysis_type == AnalysisType.FINANCIAL_EDUCATION


def test_educational_follow_up_reuses_the_example_without_ledger_context():
    example = "Explain compound interest in a hypothetical example using 1,000 rupees at 10%."
    history = [
        {"role": "user", "content": "How much did I spend from my ledger?"},
        {"role": "user", "content": example},
        {"role": "assistant", "content": "An earlier answer."},
        {"role": "user", "content": "What about after three years?"},
    ]
    question = "And after 5 years?"
    assert education_follow_up(question, history) == [example, "What about after three years?"]
    assert MasterFinancialStrategistAgent().determine_analysis_type(
        question, {"age": 30}, conversation_history=history,
    ) == AnalysisType.FINANCIAL_EDUCATION
    assert not education_follow_up("What about my credit card interest?", history)
    assert not education_follow_up(question, [*history, {"role": "user", "content": "Analyze my budget"}])


def test_generic_debt_comparison_does_not_run_personal_debt_workflow():
    agent = MasterFinancialStrategistAgent()
    profile = {"age": 30}
    comparison = "In two short bullets, compare the debt snowball and avalanche methods using generic examples."
    assert agent.determine_analysis_type(comparison, profile) == AnalysisType.FINANCIAL_EDUCATION
    assert agent.determine_analysis_type("Compare my debts using generic examples.", profile) == AnalysisType.DEBT_OPTIMIZATION


def test_explaining_debt_avalanche_with_rates_uses_financial_education():
    agent = MasterFinancialStrategistAgent()
    profile = {"age": 30}
    question = ("I have a fixed monthly amount to put toward debt. Explain debt avalanche in two bullets "
                "using a 19% credit card and an 8% loan. Assume both require a minimum payment.")
    assert agent.determine_analysis_type(question, profile) == AnalysisType.FINANCIAL_EDUCATION
    history = [{"role": "user", "content": question}]
    follow_up = "In one sentence, what happens to the extra payment once the higher-rate card is paid off?"
    assert education_follow_up(follow_up, history) == [question]
    assert agent.determine_analysis_type(follow_up, profile, conversation_history=history) == AnalysisType.FINANCIAL_EDUCATION
    assert agent.determine_analysis_type(
        "Explain debt avalanche and which debt should I pay first from my saved debts?",
        profile,
    ) == AnalysisType.DEBT_OPTIMIZATION


def test_generic_example_continues_the_educational_topic():
    question = "Give me a generic example of when someone would use that fund, in one sentence."
    original = "What is an emergency fund? Give me one sentence."
    history = [{"role": "user", "content": original}]
    assert education_follow_up(question, history) == [original]
    assert MasterFinancialStrategistAgent().determine_analysis_type(
        question, {"age": 30}, conversation_history=history,
    ) == AnalysisType.FINANCIAL_EDUCATION


def test_hypothetical_variable_rate_risk_routes_to_education():
    question = "What risks does a variable interest rate introduce? Give two short bullets and use a hypothetical example."
    assert MasterFinancialStrategistAgent().determine_analysis_type(
        question, {"age": 30},
    ) == AnalysisType.FINANCIAL_EDUCATION


def test_savings_concept_comparison_routes_to_education_without_generic_example_keyword():
    agent = MasterFinancialStrategistAgent()
    question = "Compare emergency funds and sinking funds in two bullets."
    assert agent.determine_analysis_type(question, {"age": 30}) == AnalysisType.FINANCIAL_EDUCATION
    assert education_follow_up("Give me a simple example.", [{"role": "user", "content": question}]) == [question]


def test_definition_follow_up_classifies_a_mixed_expense():
    example = "What is the difference between a fixed expense and a variable expense?"
    question = ("Using those definitions, how should I classify an electricity bill "
                "with a fixed service charge and metered usage? Answer in one sentence.")
    history = [{"role": "user", "content": example}]
    assert education_follow_up(question, history) == [example]
    assert not education_follow_up(
        "Using those definitions, how should I classify the following items from my ledger?", history,
    )
    assert MasterFinancialStrategistAgent().determine_analysis_type(
        question, {"age": 30}, conversation_history=history,
    ) == AnalysisType.FINANCIAL_EDUCATION

