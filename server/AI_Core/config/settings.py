"""
settings.py - AI Core Configuration Settings
=============================================

This module defines the ``Settings`` class, which is the **single source of
truth** for all configuration values used by the AI Core service.  It reads
from environment variables (with fallback defaults) and provides typed access
to every configurable parameter.

Configuration sources (in priority order)
-----------------------------------------
1. **OS environment variables** (highest priority -- set in Docker, CI, etc.)
2. **``server/.env``** file (project-level overrides)
3. **``AI_Core/.env``** file (service-level overrides)
4. **Hardcoded defaults** in the ``Settings`` class (lowest priority)

The ``load_env_defaults()`` function at module level reads the ``.env`` files
and applies their values to ``os.environ`` **only if** the key is not already
set in the OS environment.  This ensures that real environment variables
always take precedence.

Configuration groups
--------------------
- **LLM Provider** -- which provider to use, API keys for all providers
- **Model** -- model name, temperature, max tokens, cost estimates
- **Rate Limiting** -- timeout, max retries
- **Agent Config** -- per-agent temperature and token limits
- **Financial** -- emergency fund months, savings rate, debt ratios
- **Vision** -- OCR language, max image size
- **Memory** -- SQLite path, top-K retrieval
- **Tools** -- FinWise server URL and auth token

Usage
-----
    from config import settings

    api_key = settings.GEMINI_API_KEY
    config = settings.get_agent_config("master")
"""

import os
from pathlib import Path
from typing import Any, Dict, List

from dotenv import dotenv_values

# --- Directory resolution ---
# Walk up from this file to find the .env files.
_CONFIG_DIR = Path(__file__).resolve().parent       # AI_Core/config/
_AI_CORE_DIR = _CONFIG_DIR.parent                   # AI_Core/
_SERVER_DIR = _AI_CORE_DIR.parent                   # server/


# Resolves candidate dotenv file paths across server and service directories.
# Orders file locations so that service settings override shared server defaults.
# Returns path objects for layered configuration ingestion at startup time.
def resolve_env_file_candidates() -> List[Path]:
    """Return env files in load order, with service values overriding shared defaults.

    OS-level environment variables always take priority over these files.
    """
    return [
        _SERVER_DIR / ".env",   # server/.env (project-level)
        _AI_CORE_DIR / ".env",  # AI_Core/.env (service-level)
    ]


# Ingests and merges variables from discovered dotenv configuration files.
# Populates process environment variables only when not already established.
# Preserves host OS environment variable precedence over local file settings.
def load_env_defaults() -> None:
    """Apply non-empty values from .env files without overwriting real OS env vars.

    This function is called at module import time (see below).  It:
    1. Reads all .env files in precedence order.
    2. Merges their values, with nonempty service values overriding shared defaults.
    3. For each key, sets it in ``os.environ`` only if not already present.
    """
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

    # Apply merged values only if the key is not already set in the OS env.
    for key, value in merged.items():
        existing = os.getenv(key)
        if existing is not None and str(existing).strip():
            continue
        os.environ[key] = value


# Execute at import time so that all subsequent ``os.getenv()`` calls in the
# ``Settings`` class see the merged values.
load_env_defaults()


# Central configuration registry for AI Core runtime options and API tokens.
# Manages model candidates, rate limits, timeouts, heuristics, and state backends.
# Provides structured access to environment-driven financial assistant settings.
class Settings:
    """Application settings configuration.

    All values are read from environment variables at import time.  Use the
    singleton ``settings`` instance at the bottom of this module.

    Example::

        from config import settings
        print(settings.LLM_PROVIDER)  # "gemini"
    """

    # ======================================================================
    # LLM Provider Selection
    # ======================================================================
    # Set LLM_PROVIDER to one of: gnani, gemini, openrouter, groq, openai, deepseek,
    # grok, together, mistral, fireworks. If not set, auto-detects from the first
    # configured API key.
    LLM_PROVIDER = os.getenv("LLM_PROVIDER", "").strip().lower() or None

    # ======================================================================
    # API Keys (one per provider -- set whichever you want to use)
    # ======================================================================
    GNANI_REASONING_API_KEY = os.getenv("GNANI_REASONING_API_KEY", "").strip() or None
    GNANI_API_BASE_URL = (
        os.getenv("GNANI_REASONING_URL", "").strip()
        or os.getenv("GNANI_API_BASE_URL", "").strip()
    )
    GNANI_MODEL = os.getenv("GNANI_MODEL", "").strip() or "gnani/gnani-evon-v3.3-30B-A3B"
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip() or None
    OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip() or None
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip() or None
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip() or None
    DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip() or None
    XAI_API_KEY = os.getenv("XAI_API_KEY", "").strip() or None
    TOGETHER_API_KEY = os.getenv("TOGETHER_API_KEY", "").strip() or None
    MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "").strip() or None
    FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY", "").strip() or None

    # ======================================================================
    # Model Configuration
    # ======================================================================
    # If set, overrides the provider's default model.
    LLM_MODEL = os.getenv("LLM_MODEL", "").strip() or None

    # Legacy model candidates (used by create_llm fallback when no task config
    # specifies a model).  Comma-separated list.
    _model_candidates_env = os.getenv(
        "MODEL_CANDIDATES",
        "gemini-3.5-flash-lite",
    )
    MODEL_CANDIDATES: List[str] = [
        model.strip() for model in _model_candidates_env.split(",") if model.strip()
    ]
    MODEL_NAME = MODEL_CANDIDATES[0] if MODEL_CANDIDATES else "gemini-3.5-flash-lite"
    TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.1"))
    MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "4096"))

    # ======================================================================
    # Cost Estimation (USD per 1K tokens)
    # ======================================================================
    # Optional -- used for telemetry.  Defaults to 0 for local/dev.
    LLM_COST_USD_PER_1K_INPUT_TOKENS = float(
        os.getenv("LLM_COST_USD_PER_1K_INPUT_TOKENS", "0")
    )
    LLM_COST_USD_PER_1K_OUTPUT_TOKENS = float(
        os.getenv("LLM_COST_USD_PER_1K_OUTPUT_TOKENS", "0")
    )

    # ======================================================================
    # Rate Limiting / Retry Behaviour
    # ======================================================================
    LLM_TIMEOUT_SECONDS = int(os.getenv("LLM_TIMEOUT_SECONDS", "30"))
    LLM_INTERACTIVE_BUDGET_SECONDS = int(os.getenv("LLM_INTERACTIVE_BUDGET_SECONDS", "28"))
    LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "0"))

    # ======================================================================
    # Per-Agent Configuration
    # ======================================================================
    # Maps agent type -> {temperature, max_tokens}.  Used by create_llm().
    # Lower temperature = more deterministic; higher = more creative.
    # Master agent gets more tokens (2048) because it synthesises the final plan.
    AGENT_CONFIG = {
        "master": {"temperature": 0.1, "max_tokens": 2048},
        "analyzer": {"temperature": 0.1, "max_tokens": 1024},
        "planner": {"temperature": 0.1, "max_tokens": 1024},
        "advisor": {"temperature": 0.1, "max_tokens": 1024},
        "optimizer": {"temperature": 0.1, "max_tokens": 1024},
        "educator": {"temperature": 0.3, "max_tokens": 1024},  # Slightly more creative
    }

    # ======================================================================
    # Financial Heuristics
    # ======================================================================
    # These constants are used by specialist agents as default thresholds.
    EMERGENCY_FUND_MONTHS = 3           # Minimum emergency fund runway
    DEFAULT_SAVINGS_RATE = 0.2          # Target savings rate (20%)
    MAX_DEBT_TO_INCOME_RATIO = 0.36     # Maximum healthy debt-to-income ratio
    MIN_EXTRA_DEBT_PAYMENT = 100        # Minimum extra payment capacity for debt snowball

    # ======================================================================
    # Vision Configuration (OCR + Handwriting)
    # ======================================================================
    VISION_LANG_DEFAULT = os.getenv("VISION_LANG_DEFAULT", "en").strip() or "en"
    _vision_lang_allowed_env = os.getenv("VISION_LANG_ALLOWED", VISION_LANG_DEFAULT)
    VISION_LANG_ALLOWED: List[str] = [
        lang.strip() for lang in _vision_lang_allowed_env.split(",") if lang.strip()
    ]
    # Max image size (default 10 MB).  Larger images are rejected with 413.
    VISION_MAX_IMAGE_BYTES = int(
        os.getenv("VISION_MAX_IMAGE_BYTES", str(10 * 1024 * 1024))
    )

    # ======================================================================
    # Tool-Host Integration (optional)
    # ======================================================================
    # If set, tool calls are validated against the FinWise server for RBAC.
    FINWISE_SERVER_URL = os.getenv("FINWISE_SERVER_URL", "").strip()
    FINWISE_TOOLS_TOKEN = os.getenv("FINWISE_TOOLS_TOKEN", "").strip()

    # ======================================================================
    # Memory Store (SQLite fallback)
    # ======================================================================
    # Local-first memory store for user preferences and facts.
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
    # Number of memories to retrieve per query.
    MEMORY_TOP_K = int(os.getenv("FINWISE_MEMORY_TOP_K", "8"))

    # ======================================================================
    # State backend (sessions, checkpoints, memories) - see memory/state_store.py
    # ======================================================================
    # mongo | sqlite | memory (mongomock). Empty = mongo when a Mongo URI is set, else sqlite.
    # SQLite files (MEMORY_DB_PATH above, sessions beside it) are the local-dev fallback.
    STATE_BACKEND = os.getenv("AI_CORE_STATE_BACKEND", "").strip().lower()
    # Mongo TTLs: sessions expire 24h after last update, checkpoints 7d after creation.
    SESSION_TTL_SECONDS = int(os.getenv("AI_CORE_SESSION_TTL_SECONDS", "86400") or 86400)
    CHECKPOINT_TTL_SECONDS = int(os.getenv("AI_CORE_CHECKPOINT_TTL_SECONDS", "604800") or 604800)
    # boundary = checkpoint at request start/end only; every_node = legacy per-node writes.
    CHECKPOINT_MODE = os.getenv("AI_CORE_CHECKPOINT_MODE", "boundary").strip().lower()

    # Retrieves model execution parameters tailored to a specific agent persona.
    # Returns customized generation temperature settings and token budget allocations.
    # Falls back to safe default parameters when requested agent types are omitted.
    @classmethod
    def get_agent_config(cls, agent_type: str) -> Dict[str, Any]:
        """Get temperature/max_tokens configuration for a specific agent type.

        Falls back to ``{"temperature": 0.1, "max_tokens": 1024}`` if the
        agent type is not in ``AGENT_CONFIG``.
        """
        return cls.AGENT_CONFIG.get(
            agent_type, {"temperature": 0.1, "max_tokens": 1024}
        )

    # Validates presence of at least one functional LLM provider API credential.
    # Scans supported platform provider keys including Gemini, Groq, and OpenRouter.
    # Raises explicit configuration errors if all external AI provider keys are missing.
    @classmethod
    def validate_api_key(cls):
        """Validate that at least one LLM API key is configured.

        Raises ``ValueError`` if no keys are set.  Called at startup by
        ``api_service.py`` (non-fatal -- the service continues in fallback
        mode).
        """
        keys = [
            cls.GNANI_REASONING_API_KEY and cls.GNANI_API_BASE_URL,
            cls.GEMINI_API_KEY,
            cls.OPENROUTER_API_KEY,
            cls.GROQ_API_KEY,
            cls.OPENAI_API_KEY,
            cls.DEEPSEEK_API_KEY,
            cls.XAI_API_KEY,
            cls.TOGETHER_API_KEY,
            cls.MISTRAL_API_KEY,
            cls.FIREWORKS_API_KEY,
        ]
        if not any(keys):
            raise ValueError(
                "No LLM API key is configured. Set at least one of: "
                "GNANI_REASONING_API_KEY with GNANI_REASONING_URL, GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, "
                "OPENAI_API_KEY, DEEPSEEK_API_KEY, "
                "XAI_API_KEY, TOGETHER_API_KEY, MISTRAL_API_KEY, FIREWORKS_API_KEY"
            )

    # Gathers diagnostic configuration metadata regarding active model providers.
    # Compiles active provider identifiers, configured models, and registry status.
    # Facilitates health check diagnostics and administrative model telemetry.
    @classmethod
    def get_active_provider_info(cls) -> Dict[str, Any]:
        """Get info about which provider is active and available.

        Returns a dict with the configured provider, model, and a list of
        all providers with their status.
        """
        from utils.provider_registry import list_providers

        return {
            "configured_provider": cls.LLM_PROVIDER,
            "configured_model": cls.LLM_MODEL,
            "providers": list_providers(),
        }


# Global singleton instance providing typed access to application configuration.
# Exposes validated environment settings to all agent and orchestration modules.
# Ensures unified configuration values across all concurrent server threads.
settings = Settings()


# ============================================================================
# END-OF-FILE SUMMARY -- config/settings.py
# ============================================================================
# Key takeaways:
#
# 1. ``Settings`` is the **single source of truth** for all configuration.
#    Every module imports ``from config import settings`` to access config
#    values.
#
# 2. Configuration follows a **layered precedence**: OS env vars > .env files
#    > hardcoded defaults.  The ``load_env_defaults()`` function at module
#    level ensures .env values are applied without overriding real env vars.
#
# 3. Two ``.env`` files are checked: ``server/.env`` (project-level) and
#    ``AI_Core/.env`` (service-level).  This allows per-environment overrides
#    without changing code.
#
# 4. All API keys are optional -- the system degrades gracefully.  The
#    ``validate_api_key()`` method checks that at least one key is present
#    but does not prevent the service from starting.
#
# 5. Per-agent configuration (``AGENT_CONFIG``) allows different agents to
#    use different temperature and token limits.  The master agent gets more
#    tokens because it synthesises the final plan.
#
# 6. Financial heuristics (``EMERGENCY_FUND_MONTHS``, ``DEFAULT_SAVINGS_RATE``,
#    ``MAX_DEBT_TO_INCOME_RATIO``) are used by specialist agents as default
#    thresholds when the user has not specified their own targets.
# ============================================================================
