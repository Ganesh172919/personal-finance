import os
from pathlib import Path
from typing import Any, Dict, List

from dotenv import dotenv_values


_CONFIG_DIR = Path(__file__).resolve().parent
_AI_CORE_DIR = _CONFIG_DIR.parent
_SERVER_DIR = _AI_CORE_DIR.parent


def resolve_env_file_candidates() -> List[Path]:
    """Return env files in precedence order without overriding OS-level env vars."""
    return [
        _SERVER_DIR / ".env",
        _AI_CORE_DIR / ".env",
    ]


def load_env_defaults() -> None:
    """Apply non-empty values from env files without overwriting real OS env vars."""
    merged: Dict[str, str] = {}

    for env_file in resolve_env_file_candidates():
        if not env_file.exists():
            continue

        for key, value in dotenv_values(env_file).items():
            if value is None:
                continue

            cleaned = str(value).strip()
            if not cleaned:
                continue

            merged[key] = cleaned

    for key, value in merged.items():
        existing = os.getenv(key)
        if existing is not None and str(existing).strip():
            continue
        os.environ[key] = value


load_env_defaults()


class Settings:
    """Application settings configuration."""

    # Provider selection
    # Set LLM_PROVIDER to one of: gemini, openrouter, groq, grok, together, mistral
    # If not set, auto-detects from the first configured API key.
    LLM_PROVIDER = os.getenv("LLM_PROVIDER", "").strip().lower() or None

    # API keys (set whichever providers you want to use)
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip() or None
    OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip() or None
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip() or None
    XAI_API_KEY = os.getenv("XAI_API_KEY", "").strip() or None
    TOGETHER_API_KEY = os.getenv("TOGETHER_API_KEY", "").strip() or None
    MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "").strip() or None

    # Model override
    # If set, overrides the provider's default model.
    LLM_MODEL = os.getenv("LLM_MODEL", "").strip() or None

    # Model configuration (legacy, still used by create_llm fallback)
    _model_candidates_env = os.getenv(
        "MODEL_CANDIDATES",
        "gemini-2.5-flash,gemini-2.5-flash-lite",
    )
    MODEL_CANDIDATES: List[str] = [
        model.strip() for model in _model_candidates_env.split(",") if model.strip()
    ]
    MODEL_NAME = MODEL_CANDIDATES[0] if MODEL_CANDIDATES else "gemini-2.5-flash"
    TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.1"))
    MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "4096"))

    # Optional cost estimation (USD per 1K tokens). Defaults to 0 for local/dev.
    LLM_COST_USD_PER_1K_INPUT_TOKENS = float(
        os.getenv("LLM_COST_USD_PER_1K_INPUT_TOKENS", "0")
    )
    LLM_COST_USD_PER_1K_OUTPUT_TOKENS = float(
        os.getenv("LLM_COST_USD_PER_1K_OUTPUT_TOKENS", "0")
    )

    # Rate limiting / retry behavior
    LLM_TIMEOUT_SECONDS = int(os.getenv("LLM_TIMEOUT_SECONDS", "30"))
    LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "0"))

    # Agent configuration
    AGENT_CONFIG = {
        "master": {"temperature": 0.1, "max_tokens": 2048},
        "analyzer": {"temperature": 0.1, "max_tokens": 1024},
        "planner": {"temperature": 0.1, "max_tokens": 1024},
        "advisor": {"temperature": 0.1, "max_tokens": 1024},
        "optimizer": {"temperature": 0.1, "max_tokens": 1024},
        "educator": {"temperature": 0.3, "max_tokens": 1024},
    }

    # Financial configuration
    EMERGENCY_FUND_MONTHS = 3
    DEFAULT_SAVINGS_RATE = 0.2
    MAX_DEBT_TO_INCOME_RATIO = 0.36

    # Vision configuration (OCR + handwriting)
    VISION_LANG_DEFAULT = os.getenv("VISION_LANG_DEFAULT", "en").strip() or "en"
    _vision_lang_allowed_env = os.getenv("VISION_LANG_ALLOWED", VISION_LANG_DEFAULT)
    VISION_LANG_ALLOWED: List[str] = [
        lang.strip() for lang in _vision_lang_allowed_env.split(",") if lang.strip()
    ]
    VISION_MAX_IMAGE_BYTES = int(
        os.getenv("VISION_MAX_IMAGE_BYTES", str(10 * 1024 * 1024))
    )

    # Optional tool-host integration (server-side tools)
    FINWISE_SERVER_URL = os.getenv("FINWISE_SERVER_URL", "").strip()
    FINWISE_TOOLS_TOKEN = os.getenv("FINWISE_TOOLS_TOKEN", "").strip()

    # Local-first memory store (SQLite)
    MEMORY_DB_PATH = os.getenv(
        "FINWISE_MEMORY_DB_PATH",
        os.path.join(
            os.path.dirname(__file__),
            "..",
            "..",
            "..",
            ".tmp",
            "ai_core",
            "memory.sqlite3",
        ),
    )
    MEMORY_TOP_K = int(os.getenv("FINWISE_MEMORY_TOP_K", "8"))

    @classmethod
    def get_agent_config(cls, agent_type: str) -> Dict[str, Any]:
        """Get configuration for specific agent type."""
        return cls.AGENT_CONFIG.get(
            agent_type, {"temperature": 0.1, "max_tokens": 1024}
        )

    @classmethod
    def validate_api_key(cls):
        """Validate that at least one API key is configured."""
        keys = [
            cls.GEMINI_API_KEY,
            cls.OPENROUTER_API_KEY,
            cls.GROQ_API_KEY,
            cls.XAI_API_KEY,
            cls.TOGETHER_API_KEY,
            cls.MISTRAL_API_KEY,
        ]
        if not any(keys):
            raise ValueError(
                "No LLM API key is configured. Set at least one of: "
                "GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, "
                "XAI_API_KEY, TOGETHER_API_KEY, MISTRAL_API_KEY"
            )

    @classmethod
    def get_active_provider_info(cls) -> Dict[str, Any]:
        """Get info about which provider is active and available."""
        from utils.provider_registry import list_providers

        return {
            "configured_provider": cls.LLM_PROVIDER,
            "configured_model": cls.LLM_MODEL,
            "providers": list_providers(),
        }


settings = Settings()
