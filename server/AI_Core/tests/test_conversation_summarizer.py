import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage

from agents.conversation_summarizer import summarize_conversations
from api_service import app
from graph.workflow import FinancialWorkflow

CONTEXT = {"conversation_sessions": [
    {"id": "a" * 24, "title": "Review my budget", "summary": "Income USD 7500; review the saved budget."},
    {"id": "b" * 24, "title": "Quote the fee in my PDF", "summary": "Historical question: What is the fee? Fee USD 37."},
]}
GOOD = ("## Conversation pulse\nReviewed 2 saved conversations.\n## Repeated topics\nBudget and documents.\n"
        "## Recommended next moves\nReopen the source conversations.\n## Suggested next prompt\nReview my saved priorities.")


def test_factual_summary_counts_real_titles_and_links_only_supplied_sessions():
    result = summarize_conversations(CONTEXT)
    assert "Reviewed 2" in result["response"]
    assert "Budget and cash flow: 1" in result["response"]
    assert "Documents and source checking: 1" in result["response"]
    assert f"(/chat/{'a' * 24})" in result["response"]
    assert not result["fallback_used"]


def test_invalid_rows_and_saved_markup_do_not_become_source_links():
    result = summarize_conversations({"conversation_sessions": [
        {"id": "https://example.com", "title": "Foreign link"},
        {"id": "a" * 24, "title": "[Open](https://example.com) <script>"},
    ]})
    assert "Reviewed 1" in result["response"]
    assert "Foreign link" not in result["response"]
    assert r"\[Open\]\(https://example.com\)" in result["response"]
    assert r"\<script\>" in result["response"]


def test_bounds_input_and_does_not_call_a_model_for_empty_or_non_narrative_context(monkeypatch):
    monkeypatch.setattr("agents.conversation_summarizer.create_llm", lambda *_: pytest.fail("Unnecessary model call"))
    assert "Reviewed 0" in summarize_conversations(None, narrative=True)["response"]
    rows = CONTEXT["conversation_sessions"] * 10
    assert "Reviewed 8" in summarize_conversations({"conversation_sessions": rows})["response"]


@pytest.mark.parametrize("candidate", [
    "FINANCIAL PLAN\nExecutive summary: invest more.",
    GOOD + "\nYou saved USD 9999999.",
    GOOD + "\n[External source](https://example.com)",
])
def test_rejects_generic_plans_invented_figures_and_unverified_links(monkeypatch, candidate):
    invoke = Mock(return_value=(AIMessage(content=candidate), False))
    monkeypatch.setattr("agents.conversation_summarizer.create_llm", lambda *_: SimpleNamespace(
        invoke_with_fallback=invoke, get_route_metadata=lambda: {},
    ))
    result = summarize_conversations(CONTEXT, narrative=True)
    assert result["fallback_used"]
    assert "Keyword matches in conversation titles" in result["response"]
    assert "9999999" not in result["response"]
    invoke.assert_called_once()


def test_one_synthesis_invocation_preserves_provider_text_blocks(monkeypatch):
    invoke = Mock(return_value=(AIMessage(content=[{"type": "text", "text": GOOD}]), False))
    monkeypatch.setattr("agents.conversation_summarizer.create_llm", lambda *_: SimpleNamespace(
        invoke_with_fallback=invoke, get_route_metadata=lambda: {"provider": "test"},
    ))
    result = summarize_conversations(CONTEXT, narrative=True)
    assert result["response"].startswith(GOOD)
    assert not result["fallback_used"]
    assert result["llm_route"]["provider"] == "test"
    invoke.assert_called_once()
    assert invoke.call_args.kwargs == {"max_attempts": 2}


def test_explicit_summary_task_skips_financial_specialist_fanout(monkeypatch):
    workflow = FinancialWorkflow()
    monkeypatch.setattr(workflow, "_get_session_manager", lambda: None)
    monkeypatch.setattr(workflow.workflow, "invoke", lambda *_: pytest.fail("Unnecessary financial plan"))
    result = workflow.process_request("Review my finance conversations", None, finance_context=CONTEXT,
                                      options={"task_type": "conversation_insights", "narrative": False})
    assert [entry["agent"] for entry in result["workflow_trace"]] == ["conversation_summarizer"]
    assert result["workflow_trace"][0]["llmCalls"] == 0
    assert not result["tool_calls"]


@pytest.mark.parametrize("stream", [False, True])
def test_http_and_sse_return_summary_sections_without_financial_actions(stream):
    with TestClient(app) as client:
        response = client.post("/api/agents/process" + ("/stream" if stream else ""), json={
            "user_input": "Review recent conversations", "finance_context": CONTEXT,
            "user_profile": {"age": 28, "annual_income": 90000, "monthly_expenses": 3000, "savings": 15000},
            "options": {"task_type": "conversation_insights", "narrative": False},
        })
    assert response.status_code == 200, response.text
    if stream:
        events = [json.loads(line[6:]) for line in response.text.splitlines()
                  if line.startswith("data: ") and line[6:] != "[DONE]"]
        data = next(event["result"] for event in events if event.get("phase") == "complete")
    else:
        data = response.json()
    assert data["analysis_type"] == "conversation_summarizer"
    assert "## Conversation pulse" in data["final_output"]
    assert not data.get("tool_calls")
    assert data["llm_call_count"] == 0
