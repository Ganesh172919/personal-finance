import os
from typing import Any, Dict, List

from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class Settings:
    """Application settings configuration."""

    # API Keys
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

    # Model Configuration
    _model_candidates_env = os.getenv(
        "MODEL_CANDIDATES",
        "gemini-2.5-flash,gemini-2.0-flash,gemini-1.5-flash"
    )
    MODEL_CANDIDATES: List[str] = [
        model.strip() for model in _model_candidates_env.split(",") if model.strip()
    ]
    MODEL_NAME = MODEL_CANDIDATES[0] if MODEL_CANDIDATES else "gemini-2.5-flash"
    TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.1"))
    MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "4096"))

    # Optional cost estimation (USD per 1K tokens). Defaults to 0 for local/dev.
    LLM_COST_USD_PER_1K_INPUT_TOKENS = float(os.getenv("LLM_COST_USD_PER_1K_INPUT_TOKENS", "0"))
    LLM_COST_USD_PER_1K_OUTPUT_TOKENS = float(os.getenv("LLM_COST_USD_PER_1K_OUTPUT_TOKENS", "0"))

    # Rate limiting / retry behavior
    LLM_TIMEOUT_SECONDS = int(os.getenv("LLM_TIMEOUT_SECONDS", "30"))
    LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "0"))

    # Agent Configuration
    AGENT_CONFIG = {
        "master": {"temperature": 0.1, "max_tokens": 2048},
        "analyzer": {"temperature": 0.1, "max_tokens": 1024},
        "planner": {"temperature": 0.1, "max_tokens": 1024},
        "advisor": {"temperature": 0.1, "max_tokens": 1024},
        "optimizer": {"temperature": 0.1, "max_tokens": 1024},
        "educator": {"temperature": 0.3, "max_tokens": 1024},
    }

    # Financial Configuration
    EMERGENCY_FUND_MONTHS = 3
    DEFAULT_SAVINGS_RATE = 0.2
    MAX_DEBT_TO_INCOME_RATIO = 0.36

    # Vision configuration (OCR + handwriting)
    VISION_LANG_DEFAULT = os.getenv("VISION_LANG_DEFAULT", "en").strip() or "en"
    _vision_lang_allowed_env = os.getenv("VISION_LANG_ALLOWED", VISION_LANG_DEFAULT)
    VISION_LANG_ALLOWED: List[str] = [
        lang.strip() for lang in _vision_lang_allowed_env.split(",") if lang.strip()
    ]
    VISION_MAX_IMAGE_BYTES = int(os.getenv("VISION_MAX_IMAGE_BYTES", str(10 * 1024 * 1024)))

    # Optional tool-host integration (server-side tools)
    FINWISE_SERVER_URL = os.getenv("FINWISE_SERVER_URL", "").strip()
    FINWISE_TOOLS_TOKEN = os.getenv("FINWISE_TOOLS_TOKEN", "").strip()

    # Local-first memory store (SQLite)
    MEMORY_DB_PATH = os.getenv(
        "FINWISE_MEMORY_DB_PATH",
        os.path.join(os.path.dirname(__file__), "..", "..", "..", ".tmp", "ai_core", "memory.sqlite3"),
    )
    MEMORY_TOP_K = int(os.getenv("FINWISE_MEMORY_TOP_K", "8"))

    @classmethod
    def get_agent_config(cls, agent_type: str) -> Dict[str, Any]:
        """Get configuration for specific agent type."""
        return cls.AGENT_CONFIG.get(agent_type, {"temperature": 0.1, "max_tokens": 1024})

    @classmethod
    def validate_api_key(cls):
        """Validate API key when needed."""
        if not cls.GEMINI_API_KEY:
            raise ValueError(
                "GEMINI_API_KEY environment variable is required. "
                "Please create a .env file with your API key."
            )


settings = Settings()
