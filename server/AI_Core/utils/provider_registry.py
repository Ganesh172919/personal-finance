"""
Multi-Provider LLM Registry.

Supports: Gemini, OpenRouter, Groq, Grok (xAI), Together AI, Mistral.

Each provider is created via LangChain's ChatOpenAI (OpenAI-compatible) or
provider-specific LangChain integrations. The registry resolves the active
provider from environment configuration and returns a LangChain-compatible
chat model.

Usage:
    from utils.provider_registry import get_provider, list_providers

    llm = get_provider()             # uses LLM_PROVIDER env var
    llm = get_provider("groq")       # explicit provider
"""

import logging
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI

logger = logging.getLogger(__name__)

DEFAULT_PROVIDER_PRIORITY = ["gemini", "openrouter", "groq", "grok", "together", "mistral"]


# ─── OpenAI-compatible wrapper ────────────────────────────
def _create_openai_compatible(
    api_key: str,
    base_url: str,
    model: str,
    temperature: float = 0.1,
    max_tokens: int = 4096,
    **extra: Any,
) -> BaseChatModel:
    """Create a LangChain ChatOpenAI client pointing at any OpenAI-compatible API."""
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        api_key=api_key,
        base_url=base_url,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        **extra,
    )


# ─── Provider Configuration ──────────────────────────────

@dataclass
class ProviderConfig:
    """Configuration for a single LLM provider."""
    name: str
    display_name: str
    env_key: str                 # env var holding the API key
    base_url: str                # base URL for OpenAI-compatible providers
    default_model: str           # default model name
    model_candidates: List[str]  # fallback model chain
    is_openai_compatible: bool = True
    extra_kwargs: Dict[str, Any] = field(default_factory=dict)


# Provider definitions — all using real, working free-tier endpoints
PROVIDER_CONFIGS: Dict[str, ProviderConfig] = {
    "gemini": ProviderConfig(
        name="gemini",
        display_name="Google Gemini",
        env_key="GEMINI_API_KEY",
        base_url="",  # uses native langchain_google_genai
        default_model="gemini-2.5-flash",
        model_candidates=[
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite",
        ],
        is_openai_compatible=False,
    ),
    "openrouter": ProviderConfig(
        name="openrouter",
        display_name="OpenRouter",
        env_key="OPENROUTER_API_KEY",
        base_url="https://openrouter.ai/api/v1",
        default_model="meta-llama/llama-3.3-70b-instruct:free",
        model_candidates=[
            "meta-llama/llama-3.3-70b-instruct:free",
            "qwen/qwen3-235b-a22b:free",
            "nvidia/llama-3.1-nemotron-70b-instruct:free",
            "deepseek/deepseek-r1:free",
        ],
        extra_kwargs={
            "default_headers": {
                "HTTP-Referer": "https://finwise.app",
                "X-Title": "FinWise AI",
            }
        },
    ),
    "groq": ProviderConfig(
        name="groq",
        display_name="Groq",
        env_key="GROQ_API_KEY",
        base_url="https://api.groq.com/openai/v1",
        default_model="llama-3.3-70b-versatile",
        model_candidates=[
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "gemma2-9b-it",
        ],
    ),
    "grok": ProviderConfig(
        name="grok",
        display_name="xAI Grok",
        env_key="XAI_API_KEY",
        base_url="https://api.x.ai/v1",
        default_model="grok-3-mini-fast",
        model_candidates=[
            "grok-3-mini-fast",
            "grok-3-fast",
        ],
    ),
    "together": ProviderConfig(
        name="together",
        display_name="Together AI",
        env_key="TOGETHER_API_KEY",
        base_url="https://api.together.xyz/v1",
        default_model="meta-llama/Llama-3.3-70B-Instruct-Turbo",
        model_candidates=[
            "meta-llama/Llama-3.3-70B-Instruct-Turbo",
            "Qwen/Qwen2.5-72B-Instruct-Turbo",
            "deepseek-ai/DeepSeek-R1-Distill-Llama-70B",
        ],
    ),
    "mistral": ProviderConfig(
        name="mistral",
        display_name="Mistral AI",
        env_key="MISTRAL_API_KEY",
        base_url="https://api.mistral.ai/v1",
        default_model="mistral-small-latest",
        model_candidates=[
            "mistral-small-latest",
            "open-mistral-nemo",
        ],
    ),
}


def _resolve_provider_name() -> str:
    """Resolve the active provider name from environment."""
    provider = os.getenv("LLM_PROVIDER", "").strip().lower()
    if provider and provider in PROVIDER_CONFIGS:
        return provider

    # Auto-detect: first provider with a configured API key wins
    for name in DEFAULT_PROVIDER_PRIORITY:
        config = PROVIDER_CONFIGS[name]
        if os.getenv(config.env_key, "").strip():
            logger.info("Auto-detected LLM provider: %s (via %s)", name, config.env_key)
            return name

    # Default to gemini (may fail later if key is missing)
    return "gemini"


def resolve_provider_chain(provider_name: Optional[str] = None) -> List[str]:
    """
    Resolve the provider failover order for the current environment.

    The preferred provider is attempted first, then the remaining configured
    providers are appended in priority order. If no provider API keys are
    configured, the preferred provider is still returned so callers can emit a
    clear configuration error.
    """

    preferred = (provider_name or _resolve_provider_name()).strip().lower()
    env_priority = [
        item.strip().lower()
        for item in os.getenv("LLM_PROVIDER_PRIORITY", "").split(",")
        if item.strip()
    ]
    priority_order = env_priority or DEFAULT_PROVIDER_PRIORITY

    chain: List[str] = []
    seen = set()

    for name in [preferred, *priority_order]:
        if name not in PROVIDER_CONFIGS or name in seen:
            continue
        seen.add(name)
        if os.getenv(PROVIDER_CONFIGS[name].env_key, "").strip() or name == preferred:
            chain.append(name)

    if not chain and preferred in PROVIDER_CONFIGS:
        chain.append(preferred)

    return chain


def create_chat_model(
    provider_name: Optional[str] = None,
    model: Optional[str] = None,
    temperature: float = 0.1,
    max_tokens: int = 4096,
) -> BaseChatModel:
    """
    Create a LangChain-compatible chat model for the given provider.

    If provider_name is None, resolves from LLM_PROVIDER env var or auto-detects.
    If model is None, uses the provider's default model.
    """
    name = provider_name or _resolve_provider_name()
    config = PROVIDER_CONFIGS.get(name)
    if not config:
        raise ValueError(f"Unknown LLM provider: '{name}'. Available: {list(PROVIDER_CONFIGS.keys())}")

    api_key = os.getenv(config.env_key, "").strip()
    model_name = model or os.getenv("LLM_MODEL", "").strip() or config.default_model

    if not api_key:
        raise ValueError(
            f"API key for provider '{config.display_name}' is not configured. "
            f"Set the {config.env_key} environment variable."
        )

    logger.info(
        "Creating LLM client: provider=%s model=%s temperature=%.2f max_tokens=%d",
        config.display_name,
        model_name,
        temperature,
        max_tokens,
    )

    if not config.is_openai_compatible:
        # Native Gemini
        return ChatGoogleGenerativeAI(
            model=model_name,
            temperature=temperature,
            google_api_key=api_key,
        )

    # OpenAI-compatible providers
    return _create_openai_compatible(
        api_key=api_key,
        base_url=config.base_url,
        model=model_name,
        temperature=temperature,
        max_tokens=max_tokens,
        **config.extra_kwargs,
    )


def get_provider_config(provider_name: Optional[str] = None) -> ProviderConfig:
    """Get the configuration for a provider."""
    name = provider_name or _resolve_provider_name()
    config = PROVIDER_CONFIGS.get(name)
    if not config:
        raise ValueError(f"Unknown provider: {name}")
    return config


def list_providers() -> List[Dict[str, Any]]:
    """List all available providers and their configuration status."""
    result = []
    active = _resolve_provider_name()
    provider_chain = resolve_provider_chain(active)
    for name, config in PROVIDER_CONFIGS.items():
        api_key = os.getenv(config.env_key, "").strip()
        result.append({
            "name": name,
            "display_name": config.display_name,
            "configured": bool(api_key),
            "active": name == active,
            "in_failover_chain": name in provider_chain,
            "default_model": config.default_model,
            "model_candidates": config.model_candidates,
        })
    return result
