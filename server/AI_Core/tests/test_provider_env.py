import pytest

from config.settings import Settings
from utils.provider_registry import resolve_provider_chain


def test_validate_api_key_raises_when_missing(monkeypatch):
    monkeypatch.setattr(Settings, "GEMINI_API_KEY", None)
    monkeypatch.setattr(Settings, "OPENROUTER_API_KEY", None)
    monkeypatch.setattr(Settings, "GROQ_API_KEY", None)
    monkeypatch.setattr(Settings, "XAI_API_KEY", None)
    monkeypatch.setattr(Settings, "TOGETHER_API_KEY", None)
    monkeypatch.setattr(Settings, "MISTRAL_API_KEY", None)

    with pytest.raises(ValueError) as exc:
        Settings.validate_api_key()

    assert "GEMINI_API_KEY" in str(exc.value)


def test_validate_api_key_passes_when_present(monkeypatch):
    monkeypatch.setattr(Settings, "GEMINI_API_KEY", "test-gemini-key")
    Settings.validate_api_key()


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
