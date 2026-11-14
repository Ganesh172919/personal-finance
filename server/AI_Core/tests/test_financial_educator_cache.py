import json

import pytest
from fastapi.testclient import TestClient

from agents.financial_educator import FinancialEducatorAgent
from api_service import app


class _Response:
    def __init__(self, content: str):
        self.content = content


def test_specific_compound_interest_concept_takes_priority():
    assert FinancialEducatorAgent()._simple_concept_extraction("How does compound interest work?") == "compound interest"


def test_hypothetical_compound_interest_and_rate_follow_up_use_the_calculator(monkeypatch):
    def fail_on_model(*_args, **_kwargs):
        pytest.fail("A complete compound-interest example should use the local calculator")

    monkeypatch.setattr(FinancialEducatorAgent, "explain_concept", fail_on_model)
    question = (
        "Answer briefly. Explain compound interest using a hypothetical example of "
        "1,000 rupees at 10% per year for 2 years."
    )
    with TestClient(app) as client:
        for current, history, ending, interest in [
            (question, [], "₹1,210", "₹210"),
            ("What if it were 5% instead?", [{"role": "user", "content": question}], "₹1,102.50", "₹102.50"),
        ]:
            response = client.post("/api/agents/process", json={
                "user_input": current,
                "user_profile": {"age": 30, "annual_income": 0, "monthly_expenses": 0, "savings": 0},
                "conversation_history": history,
            })
            assert response.status_code == 200
            data = response.json()
            assert data["analysis_type"] == "financial_education"
            assert data["llm_call_count"] == 0
            assert f"**{ending}**" in data["final_output"]
            assert f"**{interest}** in total interest" in data["final_output"]


def test_financial_educator_never_reuses_another_users_concept_answer(monkeypatch):
    agent = FinancialEducatorAgent()
    prompts = []

    def fake_invoke_with_fallback(messages, _fallback, *, max_attempts):
        assert max_attempts == 4
        prompts.append(str(messages[-1].content))
        return _Response(f"Answer for request {len(prompts)}"), False

    monkeypatch.setattr(agent.llm, "invoke_with_fallback", fake_invoke_with_fallback)

    first = agent.explain_concept("Budget for Alice's private goal?", {"age": 30})
    second = agent.explain_concept("Budget for Bob's private goal?", {"age": 40})

    assert len(prompts) == 2
    assert "Alice" in prompts[0] and "Bob" not in prompts[0]
    assert "Bob" in prompts[1] and "Alice" not in prompts[1]
    assert first["explanation"] != second["explanation"]
    assert set(first.keys()) == {"concept_explained", "explanation", "fallback_used", "llm_route"}


@pytest.mark.parametrize("stream", [False, True])
def test_educational_chat_excludes_private_profile_and_unrelated_plan(monkeypatch, stream):
    question = "Explain the difference between an emergency fund and a sinking fund."
    answer = "An emergency fund covers surprises. A sinking fund saves for a planned expense."

    def explain(_self, prompt, profile):
        assert prompt == question
        assert profile is None
        return {"explanation": answer, "fallback_used": False}

    monkeypatch.setattr(FinancialEducatorAgent, "explain_concept", explain)
    with TestClient(app) as client:
        response = client.post("/api/agents/process" + ("/stream" if stream else ""), json={
            "user_input": question,
            "user_profile": {"age": 30, "annual_income": 90000, "monthly_expenses": 3000, "savings": 15000},
            "finance_context": {"evidence": [{"type": "account", "label": "Unrelated balance"}], "confidence": {"score": 0.7}},
        })
    assert response.status_code == 200
    if stream:
        events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: {")]
        data = next(event["result"] for event in events if event.get("phase") == "complete")
    else:
        data = response.json()
    assert data["final_output"] == answer
    assert data["analysis_type"] == "financial_education"
    assert not data["actionType"] and not data.get("tool_calls")
    assert not data["evidence"] and not data["confidence"]
    assert all(value is None for value in data["plan"]["key_metrics"].values())
