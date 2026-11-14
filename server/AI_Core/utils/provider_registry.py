"""
Provider registry and stable chat client adapters for the FinWise AI Core.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from openai import OpenAI

from config import settings

logger = logging.getLogger(__name__)

# Default ordering of providers evaluated during model initialization.
# Ranks providers by cost efficiency, reasoning quality, and reliability.
# Serves as baseline candidate chain when environment override is omitted.
DEFAULT_PROVIDER_PRIORITY = [
    "gnani",
    "gemini",
    "openrouter",
    "groq",
    "openai",
    "deepseek",
    "grok",
    "together",
    "mistral",
    "fireworks",
]


# Strips provider namespace prefix from candidate model identifier.
# Ensures model string matches provider-specific downstream endpoint format.
# Returns clean model identifier suitable for direct API invocations.
def _normalize_model_name(provider_name: str, model_name: str) -> str:
    cleaned = str(model_name or "").strip()
    prefix = f"{provider_name}/"
    if cleaned.startswith(prefix):
        return cleaned[len(prefix) :]
    return cleaned


# Recursively extracts and merges raw text from complex message content bodies.
# Flattens string, dictionary, or list payload structures into unified text.
# Returns concatenated plain text string extracted from message structure.
def _extract_text_content(content: Any) -> str:
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        parts: List[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if text:
                    parts.append(str(text))
        return "\n".join(part for part in parts if part)

    return str(content or "")


# Converts LangChain BaseMessage objects into OpenAI chat format dictionaries.
# Maps SystemMessage, HumanMessage, and AIMessage into role-based payloads.
# Returns list of dictionary objects conforming to OpenAI completion API.
def _to_openai_messages(messages: Iterable[BaseMessage]) -> List[Dict[str, str]]:
    converted: List[Dict[str, str]] = []
    for message in messages:
        if isinstance(message, SystemMessage):
            role = "system"
        elif isinstance(message, HumanMessage):
            role = "user"
        else:
            role = "assistant"

        converted.append(
            {
                "role": role,
                "content": _extract_text_content(getattr(message, "content", "")),
            }
        )
    return converted


# Abstract base class defining common interface for chat provider adapters.
# Establishes invoke method contract returning standardized AIMessage objects.
# Unifies heterogeneous LLM SDKs behind uniform client abstractions.
class BaseProviderChatClient:
    # Dispatches chat completion request to underlying model provider.
    # Accepts message sequence and provider-specific execution options.
    # Returns normalized AIMessage response containing output and metadata.
    def invoke(self, messages: List[BaseMessage], **kwargs: Any) -> AIMessage:
        raise NotImplementedError


# Chat model client adapter supporting OpenAI-compatible HTTP REST endpoints.
# Wraps OpenAI client SDK with custom base URLs, tokens, and extra headers.
# Handles response parsing, token usage extraction, and error propagation.
class OpenAICompatibleChatClient(BaseProviderChatClient):
    # Initializes OpenAI-compatible client adapter with connection settings.
    # Configures target model, generation temperature, and custom headers.
    # Instantiates underlying OpenAI client with zero retry delegation.
    def __init__(
        self,
        *,
        provider_name: str,
        api_key: str,
        base_url: str,
        model: str,
        temperature: float,
        max_tokens: int,
        extra_headers: Optional[Dict[str, str]] = None,
    ):
        self.provider_name = provider_name
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.extra_headers = dict(extra_headers or {})
        # The gateway owns retry and failover decisions for all providers.
        self.client = OpenAI(api_key=api_key, base_url=base_url, max_retries=0)

    # Sends chat messages to OpenAI-compatible endpoint and parses output.
    # Extracts generated text content, token usage metadata, and response info.
    # Returns structured AIMessage populated with usage metrics.
    def invoke(self, messages: List[BaseMessage], **kwargs: Any) -> AIMessage:
        timeout = kwargs.get("timeout")
        response = self.client.chat.completions.create(
            model=self.model,
            messages=_to_openai_messages(messages),
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            extra_headers=self.extra_headers or None,
            timeout=timeout,
        )

        choice = response.choices[0].message if response.choices else None
        content = _extract_text_content(getattr(choice, "content", ""))
        usage = getattr(response, "usage", None)

        usage_metadata = {
            "input_tokens": int(getattr(usage, "prompt_tokens", 0) or 0),
            "output_tokens": int(getattr(usage, "completion_tokens", 0) or 0),
            "total_tokens": int(getattr(usage, "total_tokens", 0) or 0),
        }

        return AIMessage(
            content=content,
            usage_metadata=usage_metadata,
            response_metadata={
                "provider": self.provider_name,
                "model": self.model,
            },
        )


# Chat model client adapter integrating Google Gemini Generative AI SDK.
# Translates LangChain messages into Google GenAI API representations.
# Normalizes output payload format for seamless system interoperability.
class GeminiChatClient(BaseProviderChatClient):
    # Initializes Gemini chat client adapter with credentials and parameters.
    # Configures Google Generative AI model, token limits, and temperature.
    # Instantiates ChatGoogleGenerativeAI client instance for inference.
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        temperature: float,
        max_tokens: int,
    ):
        from langchain_google_genai import ChatGoogleGenerativeAI

        self.provider_name = "gemini"
        self.model = model
        self.client = ChatGoogleGenerativeAI(
            model=model,
            temperature=temperature,
            google_api_key=api_key,
            max_output_tokens=max_tokens,
        )

    # Dispatches prompt messages to Google Gemini GenAI service endpoint.
    # Sanitizes and extracts text contents from resulting AIMessage payload.
    # Returns standardized AIMessage containing output and metadata.
    def invoke(self, messages: List[BaseMessage], **kwargs: Any) -> AIMessage:
        result = self.client.invoke(messages, **kwargs)
        if isinstance(result, AIMessage):
            return result.model_copy(update={"content": _extract_text_content(result.content)})

        return AIMessage(
            content=_extract_text_content(getattr(result, "content", "")),
            usage_metadata=getattr(result, "usage_metadata", None),
            response_metadata={"provider": self.provider_name, "model": self.model},
        )


# Dataclass defining static configuration metadata for an LLM provider.
# Encapsulates endpoint URL, environment key names, models, and client kinds.
# Specifies default models and candidate lists for failover routing.
@dataclass
class ProviderConfig:
    name: str
    display_name: str
    env_key: str
    base_url: str
    default_model: str
    model_candidates: List[str]
    client_kind: str = "openai_compatible"
    extra_headers: Dict[str, str] = field(default_factory=dict)

    @property
    def has_endpoint(self) -> bool:
        return self.client_kind == "gemini" or bool(self.base_url)


# Registry mapping provider identifier strings to ProviderConfig definitions.
# Contains connection details and model catalogs for all supported providers.
# Powers dynamic client factory resolution and multi-tier failover chains.
PROVIDER_CONFIGS: Dict[str, ProviderConfig] = {
    "gnani": ProviderConfig(
        name="gnani",
        display_name="Gnani AI (Evon 30B Reasoning Model)",
        env_key="GNANI_REASONING_API_KEY",
        base_url=settings.GNANI_API_BASE_URL,
        default_model=f"gnani/{settings.GNANI_MODEL}",
        model_candidates=[f"gnani/{settings.GNANI_MODEL}"],
        extra_headers={
            "X-Caller": "FinWise-FinanceOS",
            "X-Challenge": "GreatIndianAIInternshipChallenge",
        },
    ),
    "gemini": ProviderConfig(
        name="gemini",
        display_name="Google Gemini",
        env_key="GEMINI_API_KEY",
        base_url="",
        default_model="gemini/gemini-3.5-flash-lite",
        model_candidates=[
            "gemini/gemini-3.5-flash-lite",
        ],
        client_kind="gemini",
    ),
    "openrouter": ProviderConfig(
        name="openrouter",
        display_name="OpenRouter",
        env_key="OPENROUTER_API_KEY",
        base_url="https://openrouter.ai/api/v1",
        default_model="openrouter/openrouter/free",
        model_candidates=[
            "openrouter/openrouter/free",
        ],
        extra_headers={
            "HTTP-Referer": "https://finwise.app",
            "X-Title": "FinWise AI",
        },
    ),
    "groq": ProviderConfig(
        name="groq",
        display_name="Groq",
        env_key="GROQ_API_KEY",
        base_url="https://api.groq.com/openai/v1",
        default_model="groq/openai/gpt-oss-20b",
        model_candidates=[
            "groq/openai/gpt-oss-20b",
            "groq/llama-3.3-70b-versatile",
            "groq/llama-3.1-8b-instant",
        ],
    ),
    "openai": ProviderConfig(
        name="openai",
        display_name="OpenAI",
        env_key="OPENAI_API_KEY",
        base_url="https://api.openai.com/v1",
        default_model="openai/gpt-4o-mini",
        model_candidates=[
            "openai/gpt-4o-mini",
            "openai/gpt-4.1-mini",
            "openai/gpt-4.1-nano",
        ],
    ),
    "deepseek": ProviderConfig(
        name="deepseek",
        display_name="DeepSeek",
        env_key="DEEPSEEK_API_KEY",
        base_url="https://api.deepseek.com/v1",
        default_model="deepseek/deepseek-chat",
        model_candidates=[
            "deepseek/deepseek-chat",
            "deepseek/deepseek-reasoner",
        ],
    ),
    "grok": ProviderConfig(
        name="grok",
        display_name="xAI Grok",
        env_key="XAI_API_KEY",
        base_url="https://api.x.ai/v1",
        default_model="grok/grok-3-mini-fast",
        model_candidates=[
            "grok/grok-3-mini-fast",
            "grok/grok-3-fast",
            "grok/grok-2",
        ],
    ),
    "together": ProviderConfig(
        name="together",
        display_name="Together AI",
        env_key="TOGETHER_API_KEY",
        base_url="https://api.together.xyz/v1",
        default_model="together/meta-llama/Llama-3.3-70B-Instruct-Turbo",
        model_candidates=[
            "together/meta-llama/Llama-3.3-70B-Instruct-Turbo",
            "together/Qwen/Qwen2.5-72B-Instruct-Turbo",
            "together/deepseek-ai/DeepSeek-R1",
        ],
    ),
    "mistral": ProviderConfig(
        name="mistral",
        display_name="Mistral AI",
        env_key="MISTRAL_API_KEY",
        base_url="https://api.mistral.ai/v1",
        default_model="mistral/mistral-small-latest",
        model_candidates=[
            "mistral/mistral-small-latest",
            "mistral/mistral-large-latest",
            "mistral/open-mistral-nemo",
        ],
    ),
    "fireworks": ProviderConfig(
        name="fireworks",
        display_name="Fireworks AI",
        env_key="FIREWORKS_API_KEY",
        base_url="https://api.fireworks.ai/inference/v1",
        default_model="fireworks/accounts/fireworks/models/gpt-oss-120b",
        model_candidates=["fireworks/accounts/fireworks/models/gpt-oss-120b"],
    ),
}


# Resolves primary active provider name based on environment configuration.
# Checks LLM_PROVIDER variable or scans providers with configured API keys.
# Defaults to gemini provider if no explicit selection or keys are detected.
def _resolve_provider_name() -> str:
    provider = os.getenv("LLM_PROVIDER", "").strip().lower()
    if provider and provider in PROVIDER_CONFIGS:
        return provider

    for name in DEFAULT_PROVIDER_PRIORITY:
        config = PROVIDER_CONFIGS[name]
        if config.has_endpoint and os.getenv(config.env_key, "").strip():
            return name

    return "gemini"


# Builds prioritized list of candidate providers for sequential failover.
# Merges preferred provider with configured priority order and key status.
# Returns deduplicated provider names ready for fallback execution.
def resolve_provider_chain(provider_name: Optional[str] = None) -> List[str]:
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
        config = PROVIDER_CONFIGS[name]
        if config.has_endpoint and (os.getenv(config.env_key, "").strip() or name == preferred):
            chain.append(name)

    return chain or [preferred]


# Factory function instantiating configured chat client for target provider.
# Resolves API credentials, model names, temperature, and client adapters.
# Returns ready BaseProviderChatClient adapter initialized for inference.
def create_chat_model(
    *,
    provider_name: Optional[str] = None,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    temperature: float = 0.1,
    max_tokens: int = 4096,
) -> BaseProviderChatClient:
    primary = _resolve_provider_name()
    name = provider_name or primary
    config = PROVIDER_CONFIGS.get(name)
    if not config:
        raise ValueError(f"Unknown LLM provider: '{name}'")
    if not config.has_endpoint:
        raise ValueError(f"Reasoning endpoint for provider '{config.display_name}' is not configured. Set GNANI_REASONING_URL.")

    resolved_api_key = str(api_key or os.getenv(config.env_key, "")).strip()
    if not resolved_api_key:
        raise ValueError(
            f"API key for provider '{config.display_name}' is not configured. Set {config.env_key}."
        )

    configured_model = os.getenv("LLM_MODEL", "").strip() if name == primary else ""
    model_name = _normalize_model_name(name, model or configured_model or config.default_model)

    logger.info(
        "Creating LLM client: provider=%s model=%s temperature=%.2f max_tokens=%d",
        config.display_name,
        model_name,
        temperature,
        max_tokens,
    )

    if config.client_kind == "gemini":
        return GeminiChatClient(
            api_key=resolved_api_key,
            model=model_name,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    return OpenAICompatibleChatClient(
        provider_name=name,
        api_key=resolved_api_key,
        base_url=config.base_url,
        model=model_name,
        temperature=temperature,
        max_tokens=max_tokens,
        extra_headers=config.extra_headers,
    )


# Looks up ProviderConfig metadata definition for specified provider name.
# Resolves active provider name if parameter is omitted by caller.
# Returns ProviderConfig object or raises ValueError if name is unknown.
def get_provider_config(provider_name: Optional[str] = None) -> ProviderConfig:
    name = provider_name or _resolve_provider_name()
    config = PROVIDER_CONFIGS.get(name)
    if not config:
        raise ValueError(f"Unknown provider: {name}")
    return config


# Compiles status and configuration summary for all registered providers.
# Details credential availability, active state, and candidate models.
# Returns list of provider diagnostic dictionaries for administration.
def list_providers() -> List[Dict[str, Any]]:
    active = _resolve_provider_name()
    provider_chain = resolve_provider_chain(active)
    result: List[Dict[str, Any]] = []
    for name, config in PROVIDER_CONFIGS.items():
        configured = config.has_endpoint and bool(os.getenv(config.env_key, "").strip())
        result.append(
            {
                "name": name,
                "display_name": config.display_name,
                "configured": configured,
                "active": name == active,
                "in_failover_chain": name in provider_chain,
                "default_model": config.default_model,
                "model_candidates": config.model_candidates,
                "env_key": config.env_key,
            }
        )
    return result
