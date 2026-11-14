"""
test_conversation_summary_eval.py - Unit and Evaluation Tests for Conversation Summary & Narration Sign-Off
=============================================================================================================
"""

from fastapi.testclient import TestClient

from api_service import app
from evals.conversation_summary_evaluator import (
    GOLDEN_SUMMARY_CASES,
    ConversationSummaryEvaluator,
    conversation_summary_evaluator,
)


def test_evaluator_evaluates_all_golden_cases():
    """Verify evaluator processes all golden benchmark cases and achieves >= 90% pass rate."""
    report = conversation_summary_evaluator.evaluate_all()
    assert report["total_cases"] == len(GOLDEN_SUMMARY_CASES)
    assert report["passed_cases"] == len(GOLDEN_SUMMARY_CASES)
    assert report["pass_rate"] == 100.0
    assert report["status"] == "passed"
    assert report["invariant_pass_rates"]["heading_structure"] >= 80.0
    assert report["invariant_pass_rates"]["number_safety"] >= 80.0


def test_individual_case_invariants_accuracy():
    """Verify that specific invariant violations are accurately diagnosed."""
    evaluator = ConversationSummaryEvaluator()
    
    # Case 2: Hallucinated APR rate should fail number safety specifically
    case_2 = next(c for c in GOLDEN_SUMMARY_CASES if c.case_id == "case_2_hallucinated_rate_adversarial")
    res_2 = evaluator.evaluate_case(case_2)
    assert res_2["passed"] is True
    assert "number_safety" in res_2["failed_invariants"]
    assert res_2["actual_signoff"] == "signed_off_fallback"

    # Case 3: Missing heading should fail heading structure
    case_3 = next(c for c in GOLDEN_SUMMARY_CASES if c.case_id == "case_3_missing_heading_incomplete")
    res_3 = evaluator.evaluate_case(case_3)
    assert res_3["passed"] is True
    assert "heading_structure" in res_3["failed_invariants"]
    assert res_3["actual_signoff"] == "signed_off_fallback"

    # Case 4: Malicious link should fail sanitization
    case_4 = next(c for c in GOLDEN_SUMMARY_CASES if c.case_id == "case_4_malicious_external_link_injection")
    res_4 = evaluator.evaluate_case(case_4)
    assert res_4["passed"] is True
    assert "link_sanitization" in res_4["failed_invariants"]
    assert res_4["actual_signoff"] == "signed_off_fallback"


def test_multi_provider_matrix_signoff():
    """Verify that simulated Gemini, Groq, and OpenRouter provider outputs are signed off."""
    evaluator = ConversationSummaryEvaluator()
    provider_cases = [c for c in GOLDEN_SUMMARY_CASES if c.case_id.startswith("case_5_") or c.case_id.startswith("case_6_") or c.case_id.startswith("case_7_")]
    assert len(provider_cases) == 3
    for case in provider_cases:
        res = evaluator.evaluate_case(case)
        assert res["passed"] is True
        assert res["actual_signoff"] == "signed_off_provider"
        assert len(res["failed_invariants"]) == 0


def test_api_endpoints_status_and_run():
    """Verify FastAPI evaluation endpoints return correct HTTP response status and metrics."""
    with TestClient(app) as client:
        # GET status
        res_status = client.get("/api/evals/conversation-summary/status")
        assert res_status.status_code == 200
        data_status = res_status.json()
        assert data_status["eval_type"] == "conversation_summary_narration_signoff"
        assert data_status["total_golden_cases"] == len(GOLDEN_SUMMARY_CASES)

        # POST run
        res_run = client.post("/api/evals/conversation-summary/run", json={"mode": "golden"})
        assert res_run.status_code == 200
        data_run = res_run.json()
        assert data_run["status"] == "passed"
        assert data_run["pass_rate"] == 100.0

        # POST evaluate candidate
        res_eval = client.post("/api/summary/evaluate-narration", json={
            "candidate": (
                "## Conversation pulse\nReviewed 2 conversations.\n"
                "## Repeated topics\nBudget and debts.\n"
                "## Recommended next moves\nReopen saved budgets.\n"
                "## Suggested next prompt\nWhat is my savings rate?"
            ),
            "reference_context": {
                "session_count": 2,
                "sessions": [{"title": "Budget", "summary": "Income 5000"}],
            }
        })
        assert res_eval.status_code == 200
        data_eval = res_eval.json()
        assert data_eval["invariants"]["heading_structure"] is True
        assert data_eval["invariants"]["session_count_preservation"] is True
        assert data_eval["signoff_status"] == "signed_off_provider"
