import pytest

from config.settings import Settings


def test_validate_api_key_raises_when_missing(monkeypatch):
    monkeypatch.setattr(Settings, "GEMINI_API_KEY", None)
    with pytest.raises(ValueError) as exc:
        Settings.validate_api_key()
    assert "GEMINI_API_KEY" in str(exc.value)


def test_validate_api_key_passes_when_present(monkeypatch):
    monkeypatch.setattr(Settings, "GEMINI_API_KEY", "test-gemini-key")
    Settings.validate_api_key()
