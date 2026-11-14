"""LLM_PROVIDER=mock: deterministic, offline, instant LLM for CI and load tests."""

from __future__ import annotations

import pytest
from langchain_core.messages import HumanMessage

from utils import llm_wrapper
from utils.llm_wrapper import MOCK_RESPONSE_TEXT, create_llm, mock_llm_enabled


@pytest.fixture
def mock_env(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.delenv("LLM_MOCK_LATENCY_MS", raising=False)
    # Fail loudly if anything tries to reach a real provider.
    def _boom(*_a, **_k):
        raise AssertionError("mock mode must never build a provider client")

    monkeypatch.setattr(llm_wrapper.RateLimitedLLM, "_client_for_model", _boom)


def test_mock_disabled_by_default(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    assert mock_llm_enabled() is False
    monkeypatch.setenv("LLM_PROVIDER", "Gemini")
    assert mock_llm_enabled() is False


def test_invoke_returns_canned_message(mock_env):
    assert mock_llm_enabled() is True
    llm = create_llm("educator")
    first = llm.invoke([HumanMessage(content="explain budgeting")])
    second = llm.invoke([HumanMessage(content="something else entirely")])
    assert first.content == second.content == MOCK_RESPONSE_TEXT
    assert first.response_metadata["provider"] == "mock"
    # Deterministic and digit-free so the number-safety guard never trips.
    assert not any(ch.isdigit() for ch in MOCK_RESPONSE_TEXT)


def test_invoke_with_fallback_never_uses_fallback(mock_env):
    llm = create_llm("master")
    response, fallback_used = llm.invoke_with_fallback([HumanMessage(content="hi")], "FALLBACK")
    assert fallback_used is False
    assert response.content == MOCK_RESPONSE_TEXT


def test_route_snapshot_reports_mock(mock_env):
    create_llm("master").invoke([HumanMessage(content="hi")])
    snapshot = llm_wrapper.get_last_route_snapshot()
    assert snapshot["active_provider"] == "mock"


def test_latency_is_configurable_and_clamped(mock_env, monkeypatch):
    sleeps = []
    monkeypatch.setattr(llm_wrapper.time, "sleep", lambda s: sleeps.append(s))
    monkeypatch.setenv("LLM_MOCK_LATENCY_MS", "250")
    create_llm("master").invoke([HumanMessage(content="hi")])
    monkeypatch.setenv("LLM_MOCK_LATENCY_MS", "999999")
    create_llm("master").invoke([HumanMessage(content="hi")])
    monkeypatch.setenv("LLM_MOCK_LATENCY_MS", "not-a-number")
    create_llm("master").invoke([HumanMessage(content="hi")])
    assert sleeps == [0.25, 30.0]
