from fastapi.testclient import TestClient

from api_service import app
from utils.flat_rate_comparison import flat_rate_comparison

QUESTION = (
    "Compare two hypothetical shipping options for 60 parcels. Option A charges ₹420 plus ₹18 per parcel. "
    "Option B charges ₹100 plus ₹24 per parcel. Give both totals, state which is cheaper and by how much, "
    "and find the first whole parcel count where A becomes cheaper. Show your arithmetic."
)


def test_chat_computes_totals_at_the_first_whole_unit_with_no_model():
    with TestClient(app) as client:
        response = client.post("/api/agents/process", json={
            "user_input": QUESTION,
            "options": {"conversation_mode": True},
        })
    assert response.status_code == 200
    result = response.json()
    assert result["analysis_type"] == "flat_rate_calculator"
    assert result["llm_call_count"] == 0
    for part in ("₹1,500", "₹1,540", "₹40", "54 parcels", "₹1,392", "₹1,396"):
        assert part in result["final_output"]


def test_a_tie_is_not_a_cheaper_option():
    question = QUESTION.replace("60 parcels", "50 parcels").replace("₹420", "₹400")
    answer = flat_rate_comparison(question)
    assert answer and "Both options cost the same" in answer and "51 parcels" in answer


def test_extra_requirements_remain_with_the_conversational_agent():
    assert flat_rate_comparison(QUESTION + " Translate to German.") is None
