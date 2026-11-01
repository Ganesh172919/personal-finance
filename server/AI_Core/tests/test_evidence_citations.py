import pytest
from fastapi.testclient import TestClient

from api_service import _extract_request_evidence, app


def test_process_preserves_verified_page_citation_without_narration():
    citation = {
        "id": "retrieval:qa", "type": "retrieval_chunk", "label": "loan.pdf · page 4",
        "snippet": "Prepayment fee USD 25", "entity_id": "507f1f77bcf86cd799439011", "page_number": 4,
    }
    with TestClient(app) as client:
        response = client.post("/api/agents/process", json={
            "user_input": "Explain my monthly budget", "user_profile": None,
            "finance_context": {"evidence": [citation]}, "options": {"narrative": False},
        })
    assert response.status_code == 200
    assert response.json()["evidence"] == [citation]
    assert response.json()["llm_call_count"] == 0


@pytest.mark.parametrize("page_number", [0, -1, 1.5, True, "4", 9_007_199_254_740_992, None])
def test_invalid_page_is_not_added_to_evidence(page_number):
    normalized = _extract_request_evidence({"evidence": [{"label": "Legacy source", "page_number": page_number}]})
    assert normalized[0]["label"] == "Legacy source"
    assert "page_number" not in normalized[0]
