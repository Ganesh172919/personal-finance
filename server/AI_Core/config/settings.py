import os
from dotenv import load_dotenv
from typing import Dict, Any, List

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
