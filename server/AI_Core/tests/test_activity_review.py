import json

import pytest
from fastapi.testclient import TestClient

from api_service import app
from graph.workflow import FinancialWorkflow
from utils.activity_review import activity_review_answer
from utils.request_metrics import begin_request_metrics, get_llm_call_count

QUESTION = "Based on my saved goals and unfinished tasks, what should I work on next?"
CONTEXT = {"as_of": "2026-10-29T12:00:00Z", "tasks": [
    {"title": "Current high priority", "priority": "high", "due_date": "2026-10-30"},
    {"title": "Overdue review", "priority": "low", "due_date": "2026-10-28", "why": "Check the saved budget"},
    {"title": "Finished task", "status": "completed"},
], "goals": [{"name": "Campus buffer", "target": 1250.5, "current": 25.25, "deadline": "2027-05-01"}]}


def test_names_saved_records_ranks_overdue_tasks_and_preserves_cents():
    answer = activity_review_answer(QUESTION, {"currency": "USD"}, CONTEXT)
    assert answer.index("Overdue review") < answer.index("Current high priority")
    assert "Finished task" not in answer
    assert "USD 1,225.25 remaining" in answer
    assert "2027-05-01" in answer
    assert "overdue since 2026-10-28" in answer
    assert "(/tasks)" in answer and "(/goals-debts)" in answer


def test_does_not_guess_progress_or_turn_record_markup_into_links():
    context = {"tasks": [{"title": "[Run](https://example.com) <script>"}], "goals": [{"name": "Buffer", "target": 100}]}
    answer = activity_review_answer(QUESTION, None, context)
    assert "progress is incomplete" in answer
    assert "remaining" not in answer
    assert r"\[Run\]\(https://example.com\)" in answer
    assert r"\<script\>" in answer


@pytest.mark.parametrize("question", ["What is compound interest?", "Mark my task complete", "Review my goals in this attached PDF"])
def test_leaves_unrelated_requests_and_document_questions_to_the_existing_workflow(question):
    assert activity_review_answer(question, None, CONTEXT) == ""


def test_empty_or_malformed_context_is_not_invented():
    assert activity_review_answer(QUESTION, None, None) == ""
    answer = activity_review_answer(QUESTION, None, {"tasks": {}, "goals": "invalid", "as_of": "bad"})
    assert "No open tasks were supplied" in answer
    assert "No saved goals were supplied" in answer


def test_activity_review_skips_graph_fanout_and_model_calls(monkeypatch):
    workflow = FinancialWorkflow()
    monkeypatch.setattr(workflow, "_get_session_manager", lambda: None)
    monkeypatch.setattr(workflow.workflow, "invoke", lambda *_: pytest.fail("Unnecessary specialist fanout"))
    begin_request_metrics("activity-test")
    result = workflow.process_request(QUESTION, {"currency": "USD"}, finance_context=CONTEXT)
    assert result["phase"] == "complete"
    assert [entry["agent"] for entry in result["workflow_trace"]] == ["activity_review"]
    assert result["workflow_trace"][0]["llmCalls"] == 0
    assert get_llm_call_count() == 0
    assert not result["tool_calls"]


@pytest.mark.parametrize("stream", [False, True])
def test_http_and_sse_use_the_same_current_activity_snapshot(stream):
    with TestClient(app) as client:
        response = client.post("/api/agents/process" + ("/stream" if stream else ""), json={
            "user_input": QUESTION, "user_profile": None, "finance_context": CONTEXT,
            "options": {"narrative": True},
        })
    assert response.status_code == 200, response.text
    if stream:
        events = [json.loads(line[6:]) for line in response.text.splitlines()
                  if line.startswith("data: ") and line[6:] != "[DONE]"]
        data = next(event["result"] for event in events if event.get("phase") == "complete")
    else:
        data = response.json()
    assert data["final_output"].startswith("## Your next steps")
    assert "Campus buffer" in data["final_output"]
    assert data["analysis_type"] == "activity_review"
    assert data["llm_call_count"] == 0
    assert not data.get("tool_calls")
