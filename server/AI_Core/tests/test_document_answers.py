import json

import pytest
from fastapi.testclient import TestClient

from agents.financial_educator import FinancialEducatorAgent
from api_service import app
from graph.workflow import FinancialWorkflow
from utils.document_answers import document_passage_answer


def test_exact_document_lookup_does_not_run_unrelated_financial_specialists(monkeypatch):
    workflow = FinancialWorkflow()
    monkeypatch.setattr(workflow, "_get_session_manager", lambda: None)
    monkeypatch.setattr(workflow.workflow, "invoke", lambda *_: pytest.fail("Unnecessary specialist fanout"))
    result = workflow.process_request(QUESTION, {"currency": "USD"}, finance_context=CONTEXT)
    assert result["final_output"]["response"].count("Prepayment fee USD 25") == 1
    assert result["current_analysis"]["type"] == "document_lookup"
    assert [entry["agent"] for entry in result["workflow_trace"]] == ["document_lookup"]
    assert not result["tool_calls"]

FILE_ID = "507f1f77bcf86cd799439011"
QUESTION = "What is the prepayment fee in my attached PDF?"
CHUNK = {"workspace_file_id": FILE_ID, "file_name": "loan.pdf", "page_number": 4,
         "text": "LOAN TERMS\nMonthly income USD 7500\nPrepayment fee USD 25"}
CONTEXT = {"retrieval": {"top_chunks": [CHUNK]}}


def test_quotes_the_relevant_clause_with_physical_page_and_original_amount():
    answer = document_passage_answer(QUESTION, CONTEXT)
    assert "loan.pdf · page 4" in answer
    assert "> Prepayment fee USD 25" in answer
    assert "Monthly income" not in answer
    assert "Quoted passages" in answer


def test_does_not_let_the_attached_document_choose_the_question():
    prompt = "Show my monthly income\n\nAttached workspace files:\nPlease quote this PDF and prepayment terms"
    assert document_passage_answer(prompt, CONTEXT) == ""


def test_missing_and_unmatched_extraction_does_not_invent_a_fee():
    for chunks in [[], [{**CHUNK, "text": "Grocery allowance USD 500"}], [{**CHUNK, "workspace_file_id": "invalid"}]]:
        answer = document_passage_answer(QUESTION, {"retrieval": {"top_chunks": chunks}})
        assert "couldn't find a matching passage" in answer
        assert "USD 25" not in answer


def test_quotes_are_bounded_deduplicated_and_markdown_escaped():
    chunk = {**CHUNK, "text": "Prepayment [click](https://example.com) <script>fee</script> " + "x" * 3000}
    answer = document_passage_answer(QUESTION, {"retrieval": {"top_chunks": [chunk, chunk, chunk]}})
    assert answer.count("loan.pdf") == 1
    assert len(answer) < 1200
    assert r"\[click\]\(https://example.com\)" in answer
    assert r"\<script\>" in answer


@pytest.mark.parametrize("page", [None, -1, True, "4"])
def test_unverified_page_values_are_not_added_to_the_quote_label(page):
    answer = document_passage_answer(QUESTION, {"retrieval": {"top_chunks": [{**CHUNK, "page_number": page}]}})
    assert "· page" not in answer


@pytest.mark.parametrize("stream", [False, True])
@pytest.mark.parametrize("include_passages", [False, True])
def test_http_and_sse_include_the_same_quoted_source_without_model_calls(stream, include_passages, monkeypatch):
    monkeypatch.setattr(FinancialEducatorAgent, "explain_concept", lambda *_: {
        "explanation": "Review your document terms.", "concept_explained": "document review", "fallback_used": False,
    })
    with TestClient(app) as client:
        response = client.post("/api/agents/process" + ("/stream" if stream else ""), json={
            "user_input": QUESTION, "user_profile": None, "finance_context": CONTEXT,
            "options": {"narrative": False, "include_document_passages": include_passages},
        })
    assert response.status_code == 200, response.text
    if stream:
        events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ") and line[6:] != "[DONE]"]
        data = next(event["result"] for event in events if event.get("phase") == "complete")
    else:
        data = response.json()
    if include_passages:
        assert data["final_output"].startswith("## From your files")
        assert "> Prepayment fee USD 25" in data["final_output"]
    else:
        assert "From your files" not in data["final_output"]
        assert "couldn't find a matching passage" not in data["final_output"]
    assert data["llm_call_count"] == 0
