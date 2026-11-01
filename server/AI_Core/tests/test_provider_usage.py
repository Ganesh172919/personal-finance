from types import SimpleNamespace

from langchain_core.messages import AIMessage, HumanMessage

from utils.key_pool import reset_all_key_pools
from utils.llm_wrapper import RateLimitedLLM
from utils.provider_registry import OpenAICompatibleChatClient
from utils.request_metrics import begin_request_metrics, get_llm_usage


def test_openai_compatible_response_uses_langchain_token_schema(monkeypatch):
    completion = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="A valid answer"))],
        usage=SimpleNamespace(prompt_tokens=12, completion_tokens=8, total_tokens=20),
    )
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **_: completion)))
    monkeypatch.setattr("utils.provider_registry.OpenAI", lambda **_: client)
    adapter = OpenAICompatibleChatClient(
        provider_name="groq", api_key="test", base_url="https://example.test",
        model="test-model", temperature=0.1, max_tokens=100,
    )
    response = adapter.invoke([HumanMessage(content="Hello")])
    assert isinstance(response, AIMessage)
    assert response.content == "A valid answer"
    assert response.usage_metadata == {"input_tokens": 12, "output_tokens": 8, "total_tokens": 20}

    begin_request_metrics("provider-usage")
    RateLimitedLLM(provider="groq")._record_usage("groq/test-model", response)
    assert get_llm_usage()["tokens_in"] == 12
    assert get_llm_usage()["tokens_out"] == 8


def test_cooled_down_key_is_not_reused_from_environment(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    reset_all_key_pools()
    try:
        llm = RateLimitedLLM(provider="gemini")
        pool = llm._get_key_pool("gemini")
        for key in pool.get_all_keys():
            pool.record_failure(key.key_id, 403)
        assert llm._get_api_key("gemini") == ("", None)
    finally:
        reset_all_key_pools()
