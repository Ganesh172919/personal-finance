from fastapi.testclient import TestClient

from agents import public_web_research
from agents.public_web_research import _answer_with_sources
from api_service import app


def test_research_links_only_opened_sources_and_resolves_provider_references():
    answer, count = _answer_with_sources({
        "content": "The event is in July【1†L29-L33】. [Other link](https://unverified.example/guess)",
        "executed_tools": [
            {"type": "browser_search", "index": 0, "output": "L1: URL: https://search.example/"},
            {"type": "browser.open", "index": 1, "output": "L0: \nL1: URL: https://institute.example/event.pdf\nL2: July"},
        ],
    })
    assert count == 1
    assert "The event is in July [1]" in answer
    assert "https://institute.example/event.pdf" in answer
    assert "unverified.example" not in answer
    assert "search.example" not in answer


def test_research_without_an_opened_source_does_not_display_the_models_claim():
    answer, count = _answer_with_sources({"content": "Invented current information"})
    assert count == 0
    assert "couldn't verify" in answer
    assert "Invented current information" not in answer


def test_research_uses_the_direct_response_contract(monkeypatch):
    def answer(question):
        assert question == "Find a public event"
        return {
            "response": "Public event details",
            "llm_route": {"active_provider": "groq", "active_model": "groq/openai/gpt-oss-20b"},
        }

    monkeypatch.setattr(public_web_research, "research_public_web", answer)
    with TestClient(app) as client:
        result = client.post("/api/agents/process", json={
            "user_input": "Find a public event",
            "options": {"conversation_mode": True, "public_web_search": True},
            "finance_context": {"evidence": [{"type": "account", "label": "Private balance"}]},
        }).json()
    assert result["success"] is True
    assert result["analysis_type"] == "public_web_research"
    assert result["final_output"] == "Public event details"
    assert result["active_provider"] == "groq"
    assert result["fallback_path"] == []
    assert not result["evidence"]
