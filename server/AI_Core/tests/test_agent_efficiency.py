from types import SimpleNamespace

import pytest

from agents.master_agent import MasterFinancialStrategistAgent
from agents.task_decomposer import TaskDecomposerAgent
from graph.state import AnalysisType
from graph.workflow import FinancialWorkflow
from utils.agent_routing import domain_scores, select_specialists
from utils.request_metrics import begin_request_metrics, get_llm_call_count, record_llm_call, record_llm_usage

PROFILE = {
    "age": 35, "annual_income": 90000, "monthly_expenses": 3000, "savings": 15000,
    "debts": [{"name": "Card", "balance": 1000, "interest_rate": 12, "minimum_payment": 50}],
    "financial_goals": [{"name": "Buffer", "target": 18000, "timeline_months": 12, "priority": 1}],
    "risk_tolerance": "moderate", "time_horizon": 10, "currency": "USD",
    "transactions": [{"amount": 5000, "type": "income", "category": "Salary", "date": "2026-10-01"}],
}


class CountingLLM:
    def __init__(self):
        self.calls = 0

    def invoke_with_fallback(self, messages, reference):
        self.calls += 1
        record_llm_call()
        record_llm_usage(model="test", prompt_tokens=20, completion_tokens=10)
        return SimpleNamespace(content=reference), False

    def get_route_metadata(self):
        return {}


@pytest.fixture
def workflow(monkeypatch):
    workflow = FinancialWorkflow()
    monkeypatch.setattr(workflow, "_get_session_manager", lambda: None)
    workflow.master_agent.llm = CountingLLM()
    workflow.task_decomposer.llm = CountingLLM()
    begin_request_metrics("efficiency-test")
    return workflow


@pytest.mark.parametrize("narrative,expected_calls", [(False, 0), (True, 1)])
def test_complex_request_runs_two_specialists_and_only_one_optional_rewrite(workflow, narrative, expected_calls):
    result = workflow.process_request("Create a comprehensive budget and debt repayment plan", PROFILE,
                                      options={"narrative": narrative})
    assert result["phase"] == "complete", result
    assert result["error"] is None
    agents = [entry["agent"] for entry in result["workflow_trace"]]
    assert agents.count("budget_planner") == 1
    assert agents.count("debt_optimizer") == 1
    assert "income_expense_analyzer" not in agents
    assert "investment_advisor" not in agents
    assert "aggregator" not in agents
    assert workflow.task_decomposer.llm.calls == 0
    assert workflow.master_agent.llm.calls == expected_calls
    assert get_llm_call_count() == expected_calls  # Includes calls inside LangGraph's copied contexts.
    assert sum(entry.get("llmCalls", 0) for entry in result["workflow_trace"]) == expected_calls
    assert result["final_output"]["tool_calls"]
    assert len(result["subtasks"]) == 2


def test_shallow_multi_domain_request_does_not_fan_out_to_all_four_agents(workflow):
    profile = {**PROFILE, "financial_goals": [], "savings": 0, "time_horizon": 0}
    result = workflow.process_request("Compare my budget and debt payments", profile, options={"narrative": False})
    assert result["current_analysis"]["type"] == "comprehensive"
    specialists = [entry["agent"] for entry in result["workflow_trace"] if entry["agent"] in domain_scores("")]
    assert set(specialists) == {"budget_planner", "debt_optimizer"}
    assert len(specialists) == 2


def test_full_financial_review_keeps_all_applicable_specialists(workflow):
    result = workflow.process_request("Analyze my finances", PROFILE, options={"narrative": False})
    agents = {entry["agent"] for entry in result["workflow_trace"]}
    assert set(domain_scores("")).issubset(agents)
    assert result["phase"] == "complete"
    assert select_specialists("Analyze my finances", {**PROFILE, "transactions": [], "debts": []}) == [
        "budget_planner", "investment_advisor",
    ]


@pytest.mark.parametrize("query,expected", [
    ("Help me repay my debt", AnalysisType.DEBT_OPTIMIZATION),
    ("Create my budget", AnalysisType.BUDGET_PLANNING),
    ("What is compound interest?", AnalysisType.FINANCIAL_EDUCATION),
])
def test_explicit_questions_override_old_investment_context(query, expected):
    agent = MasterFinancialStrategistAgent.__new__(MasterFinancialStrategistAgent)
    assert agent.determine_analysis_type(query, PROFILE,
        conversation_history=[{"role": "user", "content": "Optimize my investment portfolio"}],
        session_summary="We discussed stocks, savings and income") == expected


@pytest.mark.parametrize("query", ["What about next year?", "Explain that in more detail"])
def test_ambiguous_followups_inherit_latest_user_domain(query):
    agent = MasterFinancialStrategistAgent.__new__(MasterFinancialStrategistAgent)
    assert agent.determine_analysis_type(query, PROFILE,
        conversation_history=[{"role": "user", "content": "Help me optimize my investment portfolio"}],
        session_summary="Earlier budgets and loans") == AnalysisType.INVESTMENT_ADVICE


def test_word_boundaries_prevent_accidental_domains():
    assert not any(domain_scores("My membership in Stockholm is active").values())


def test_planner_is_lazy_and_does_not_add_duplicate_or_unrequested_work(monkeypatch):
    monkeypatch.setattr("agents.task_decomposer.create_llm", lambda *args: pytest.fail("Unexpected LLM initialization"))
    planner = TaskDecomposerAgent()
    plan = planner.decompose("Create my budget", PROFILE, force=True)
    assert [task["assigned_agent"] for task in plan["subtasks"]] == ["budget_planner"]
    assert all(task["dependencies"] == [] for task in plan["subtasks"])
    assert plan["decomposition_plan"]["mode"] == "deterministic"


def test_invalid_opt_in_llm_plan_falls_back_without_duplicate_work():
    planner = TaskDecomposerAgent()
    planner.llm = SimpleNamespace(invoke_with_fallback=lambda *args: (SimpleNamespace(content='{"subtasks": [1, 2]}'), False))
    result = planner.decompose("Plan my budget and debts", PROFILE, force=True, use_llm=True)
    assert {task["assigned_agent"] for task in result["subtasks"]} == {"budget_planner", "debt_optimizer"}
    assert result["decomposition_plan"]["fallback"] is True


def test_opt_in_plan_deduplicates_agents_and_rejects_dependency_cycles():
    planner = TaskDecomposerAgent()
    task = {"id": "a", "assigned_agent": "budget_planner", "description": "Budget", "dependencies": []}
    assert len(planner._validate_subtasks([task, {**task, "id": "b"}])) == 1
    assert planner._validate_subtasks([{**task, "dependencies": ["a"]}]) == []
    assert planner._parse_llm_output("[]") == {}
    assert planner._validate_subtasks(None) == []


def test_node_retry_executes_the_handler_again_before_advancing(workflow):
    calls = []

    def handler():
        calls.append(True)
        if len(calls) == 1:
            raise RuntimeError("Temporary failure")
        return {"answer": "ready"}

    result = workflow._execute_with_trace({"workflow_trace": [], "max_retries": 1}, "test_retry", handler)
    assert len(calls) == 2
    assert result["answer"] == "ready"
    assert result["error"] is None
    assert [entry["status"] for entry in result["workflow_trace"]] == ["retry", "success"]


def test_node_stops_after_retry_budget(workflow):
    calls = []

    def handler():
        calls.append(True)
        raise RuntimeError("Still unavailable")

    with pytest.raises(RuntimeError, match="Still unavailable"):
        workflow._execute_with_trace({"workflow_trace": [], "max_retries": 1}, "test_exhausted", handler)
    assert len(calls) == 2


def test_failed_workflow_keeps_retry_traces_without_running_synthesis(workflow, monkeypatch):
    calls = []

    def fail(profile):
        calls.append(True)
        raise RuntimeError("Budget unavailable")

    monkeypatch.setattr(workflow.budget_planner, "create_budget_plan", fail)
    result = workflow.process_request("Create my budget", PROFILE, options={"narrative": True})
    assert len(calls) == 3
    assert "Budget unavailable" in result["error"]
    assert [entry["status"] for entry in result["workflow_trace"]][-3:] == ["retry", "retry", "error"]
    assert workflow.master_agent.llm.calls == 0


def test_missing_profile_does_not_launch_a_personalized_multi_agent_pipeline(workflow, monkeypatch):
    calls = []

    def educate(*args):
        calls.append(True)
        return {"explanation": "Add a profile to receive personalized analysis."}

    monkeypatch.setattr(workflow.financial_educator, "explain_concept", educate)
    result = workflow.process_request("Plan my income budget investments and debts", None, options={"narrative": True})
    assert result["phase"] == "complete"
    assert len(calls) == 1
    assert [entry["agent"] for entry in result["workflow_trace"]] == ["master_agent", "financial_educator"]
    assert workflow.task_decomposer.llm.calls == 0
    assert workflow.master_agent.llm.calls == 0


@pytest.mark.parametrize("allocation_key", ["portfolio_allocation", "asset_allocation"])
def test_risk_verification_reads_current_and_legacy_specialist_allocations(workflow, allocation_key):
    result = workflow._run_verification({
        "user_profile": {**PROFILE, "risk_tolerance": "conservative"},
        "investment_advice": {allocation_key: {"Domestic Equity": 50, "International Equity": 10}},
    })
    warnings = result["verification_results"]["warnings"]
    assert any(warning["type"] == "aggressive_for_tolerance" for warning in warnings)
