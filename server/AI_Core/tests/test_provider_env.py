import os
import subprocess
import sys
from pathlib import Path

import pytest

from config.settings import Settings, resolve_env_file_candidates
from utils.provider_registry import create_chat_model, get_provider_config, list_providers, resolve_provider_chain


def test_resolve_env_file_candidates_lists_server_then_ai_core():
    candidates = resolve_env_file_candidates()

    assert candidates[0].name == ".env"
    assert candidates[0].parent.name == "server"
    assert candidates[1].name == ".env"
    assert candidates[1].parent.name == "AI_Core"


def test_validate_api_key_raises_when_missing(monkeypatch):
    monkeypatch.setattr(Settings, "GNANI_REASONING_API_KEY", None)
    monkeypatch.setattr(Settings, "GEMINI_API_KEY", None)
    monkeypatch.setattr(Settings, "OPENROUTER_API_KEY", None)
    monkeypatch.setattr(Settings, "GROQ_API_KEY", None)
    monkeypatch.setattr(Settings, "OPENAI_API_KEY", None)
    monkeypatch.setattr(Settings, "DEEPSEEK_API_KEY", None)
    monkeypatch.setattr(Settings, "XAI_API_KEY", None)
    monkeypatch.setattr(Settings, "TOGETHER_API_KEY", None)
    monkeypatch.setattr(Settings, "MISTRAL_API_KEY", None)
    monkeypatch.setattr(Settings, "FIREWORKS_API_KEY", None)

    with pytest.raises(ValueError) as exc:
        Settings.validate_api_key()

    assert "GNANI_REASONING_API_KEY" in str(exc.value)


def test_validate_api_key_passes_when_present(monkeypatch):
    monkeypatch.setattr(Settings, "GNANI_REASONING_API_KEY", "test-gnani-key")
    monkeypatch.setattr(Settings, "GNANI_API_BASE_URL", "https://reasoning.example.test/v1")
    Settings.validate_api_key()


def test_gnani_chat_client_uses_configured_endpoint_and_model():
    script = """
from types import SimpleNamespace
from unittest.mock import patch

from langchain_core.messages import HumanMessage

with patch("dotenv.dotenv_values", return_value={}):
    from utils.llm_wrapper import create_llm

with patch("utils.provider_registry.OpenAI") as sdk:
    complete = sdk.return_value.chat.completions.create
    complete.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="Answer"))],
        usage=None,
    )
    response = create_llm("master", provider="gnani").invoke([HumanMessage(content="Hello")], max_attempts=1)
    assert sdk.call_args.kwargs["base_url"] == "https://reasoning.example.test/v1"
    assert sdk.call_args.kwargs["api_key"] == "test-reasoning-key"
    assert complete.call_args.kwargs["model"] == "gnani/custom-evon"
    assert response.content == "Answer"
"""
    subprocess.run(
        [sys.executable, "-c", script],
        cwd=Path(__file__).resolve().parents[1],
        env={
            **os.environ,
            "GNANI_API_KEY": "test-voice-key",
            "GNANI_REASONING_API_KEY": "test-reasoning-key",
            "GNANI_REASONING_URL": "https://reasoning.example.test/v1",
            "GNANI_API_BASE_URL": "https://legacy.example.test/v1",
            "GNANI_MODEL": "gnani/custom-evon",
            "LLM_PROVIDER": "gnani",
            "LLM_MODEL": "",
        },
        check=True,
    )


def test_gnani_voice_key_does_not_configure_reasoning(monkeypatch):
    monkeypatch.setenv("GNANI_API_KEY", "test-gnani-key")
    monkeypatch.delenv("GNANI_REASONING_API_KEY", raising=False)
    monkeypatch.setattr(get_provider_config("gnani"), "base_url", "https://reasoning.example.test/v1")

    assert "gnani" not in resolve_provider_chain("gemini")
    assert not next(provider for provider in list_providers() if provider["name"] == "gnani")["configured"]
    with pytest.raises(ValueError, match="GNANI_REASONING_API_KEY"):
        create_chat_model(provider_name="gnani")


def test_resolve_provider_chain_prefers_selected_provider_and_keeps_configured_fallbacks(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "grok")
    monkeypatch.setenv("XAI_API_KEY", "xai-key")
    monkeypatch.setenv("OPENROUTER_API_KEY", "openrouter-key")
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-key")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("TOGETHER_API_KEY", raising=False)
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)

    chain = resolve_provider_chain()

    assert chain[0] == "grok"
    assert "openrouter" in chain
    assert "gemini" in chain
    assert "groq" not in chain


def test_resolve_provider_chain_includes_preferred_provider_even_without_key(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "grok")
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "openrouter-key")

    chain = resolve_provider_chain()

    assert chain[0] == "grok"
    assert "openrouter" in chain


def test_fireworks_uses_its_own_default_model_and_endpoint(monkeypatch):
    monkeypatch.setenv("FIREWORKS_API_KEY", "local-test-key")
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setenv("LLM_MODEL", "openai/gpt-oss-20b")

    from unittest.mock import patch

    with patch("utils.provider_registry.OpenAI") as sdk:
        client = create_chat_model(provider_name="fireworks")
        assert client.model == "accounts/fireworks/models/gpt-oss-120b"
        assert sdk.call_args.kwargs["base_url"] == "https://api.fireworks.ai/inference/v1"
