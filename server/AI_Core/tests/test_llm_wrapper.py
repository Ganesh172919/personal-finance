"""
Tests for model/key/provider failover and secure fallback behavior.
"""

from __future__ import annotations

from typing import Any

import pytest
from langchain_core.messages import HumanMessage

from utils.key_pool import reset_all_key_pools
from utils.llm_wrapper import RateLimitedLLM
from utils.model_health import reset_model_health_tracker


class FakeResponse:
    def __init__(self, content: str, usage_metadata: dict[str, int] | None = None):
        self.content = content
        self.usage_metadata = usage_metadata or {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}


class FakeClient:
    def __init__(self, response: Any):
        self.response = response

    def invoke(self, messages, **kwargs):
        del messages, kwargs
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


@pytest.fixture(autouse=True)
def reset_state():
    reset_all_key_pools()
    reset_model_health_tracker()
    yield
    reset_all_key_pools()
    reset_model_health_tracker()


def test_rotates_to_next_key_on_rate_limit(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY_1", "bad-key")
    monkeypatch.setenv("OPENROUTER_API_KEY_2", "good-key")
    monkeypatch.setenv("LLM_PROVIDER_PRIORITY", "openrouter")

    def fake_create_chat_model(*, provider_name, model, api_key, **kwargs):
        del kwargs
        if api_key == "bad-key":
            return FakeClient(Exception("429 too many requests"))
        return FakeClient(FakeResponse(content=f"{provider_name}:{model}:ok"))

    monkeypatch.setattr("utils.llm_wrapper.create_chat_model", fake_create_chat_model)

    llm = RateLimitedLLM(
        provider="openrouter",
        model="openrouter/meta-llama/llama-3.3-70b-instruct:free",
    )
    result = llm.invoke([HumanMessage(content="hello")])

    assert result.content.endswith(":ok")
    assert llm.active_key_id == "openrouter_2"
    assert any(item["type"] == "key_failover" for item in llm.get_route_metadata()["recovered_failures"])


def test_falls_back_to_next_model_on_404(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "single-key")
    monkeypatch.setenv("LLM_PROVIDER_PRIORITY", "openrouter")

    def fake_create_chat_model(*, model, **kwargs):
        del kwargs
        if model.endswith("meta-llama/llama-3.3-70b-instruct:free"):
            return FakeClient(Exception("404 model not found"))
        return FakeClient(FakeResponse(content="model-fallback-ok"))

    monkeypatch.setattr("utils.llm_wrapper.create_chat_model", fake_create_chat_model)

    llm = RateLimitedLLM(
        provider="openrouter",
        model="openrouter/meta-llama/llama-3.3-70b-instruct:free",
        model_candidates=["openrouter/qwen/qwen3-235b-a22b:free"],
    )
    result = llm.invoke([HumanMessage(content="route")])

    assert result.content == "model-fallback-ok"
    assert llm.active_model.endswith("qwen/qwen3-235b-a22b:free")
    assert any(item["type"] == "model_failover" for item in llm.get_route_metadata()["recovered_failures"])


def test_fails_over_to_next_provider(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "or-key")
    monkeypatch.setenv("GEMINI_API_KEY", "gem-key")
    monkeypatch.setenv("LLM_PROVIDER_PRIORITY", "openrouter,gemini")

    def fake_create_chat_model(*, provider_name, **kwargs):
        del kwargs
        if provider_name == "openrouter":
            return FakeClient(Exception("500 upstream unavailable"))
        return FakeClient(FakeResponse(content="gemini-ok"))

    monkeypatch.setattr("utils.llm_wrapper.create_chat_model", fake_create_chat_model)

    llm = RateLimitedLLM(
        provider="openrouter",
        model="openrouter/meta-llama/llama-3.3-70b-instruct:free",
    )
    result = llm.invoke([HumanMessage(content="route")])

    assert result.content == "gemini-ok"
    assert llm.active_provider == "gemini"
    assert any(item["type"] == "provider_failover" for item in llm.get_route_metadata()["recovered_failures"])


def test_secure_fallback_redacts_secrets(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-super-secret-token-1234567890")
    monkeypatch.setenv("LLM_PROVIDER_PRIORITY", "openrouter")

    def fake_create_chat_model(**kwargs):
        del kwargs
        return FakeClient(Exception("403 invalid api_key=sk-super-secret-token-1234567890"))

    monkeypatch.setattr("utils.llm_wrapper.create_chat_model", fake_create_chat_model)

    llm = RateLimitedLLM(
        provider="openrouter",
        model="openrouter/meta-llama/llama-3.3-70b-instruct:free",
    )
    response, fallback_used = llm.invoke_with_fallback([HumanMessage(content="route")], "deterministic-fallback")

    assert fallback_used is True
    assert response.content == "deterministic-fallback"
    assert "sk-super-secret-token-1234567890" not in str(llm.get_stats()["last_error"])
    assert "***REDACTED***" in str(llm.get_stats()["last_error"])
