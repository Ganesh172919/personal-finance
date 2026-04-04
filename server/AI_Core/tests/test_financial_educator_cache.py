from agents.financial_educator import FinancialEducatorAgent


class _Response:
    def __init__(self, content: str):
        self.content = content


def test_financial_educator_concept_cache_hits(monkeypatch):
    agent = FinancialEducatorAgent()

    calls = {"count": 0}

    def fake_invoke_with_fallback(_messages, _fallback):
        calls["count"] += 1
        return _Response("Hello from educator"), False

    monkeypatch.setattr(agent.llm, "invoke_with_fallback", fake_invoke_with_fallback)

    first = agent.explain_concept("Define compound interest", {"age": 30})
    second = agent.explain_concept("Define compound interest", {"age": 30})

    assert calls["count"] == 1
    assert first == second
    assert set(first.keys()) == {"concept_explained", "explanation", "fallback_used", "llm_route"}
