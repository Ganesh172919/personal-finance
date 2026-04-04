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

logger = logging.getLogger(__name__)

DEFAULT_PROVIDER_PRIORITY = [
    "gemini",
    "openrouter",
    "groq",
    "openai",
    "deepseek",
    "grok",
    "together",
    "mistral",
]


def _normalize_model_name(provider_name: str, model_name: str) -> str:
    cleaned = str(model_name or "").strip()
    prefix = f"{provider_name}/"
    if cleaned.startswith(prefix):
        return cleaned[len(prefix) :]
    return cleaned


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


class BaseProviderChatClient:
    def invoke(self, messages: List[BaseMessage], **kwargs: Any) -> AIMessage:
        raise NotImplementedError


class OpenAICompatibleChatClient(BaseProviderChatClient):
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
        self.client = OpenAI(api_key=api_key, base_url=base_url)

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
            "prompt_tokens": int(getattr(usage, "prompt_tokens", 0) or 0),
            "completion_tokens": int(getattr(usage, "completion_tokens", 0) or 0),
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


class GeminiChatClient(BaseProviderChatClient):
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

    def invoke(self, messages: List[BaseMessage], **kwargs: Any) -> AIMessage:
        result = self.client.invoke(messages, **kwargs)
        if isinstance(result, AIMessage):
            return result

        return AIMessage(
            content=_extract_text_content(getattr(result, "content", "")),
            usage_metadata=getattr(result, "usage_metadata", None),
            response_metadata={"provider": self.provider_name, "model": self.model},
        )


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


PROVIDER_CONFIGS: Dict[str, ProviderConfig] = {
    "gemini": ProviderConfig(
        name="gemini",
        display_name="Google Gemini",
        env_key="GEMINI_API_KEY",
        base_url="",
        default_model="gemini/gemini-2.5-flash",
        model_candidates=[
            "gemini/gemini-2.5-flash",
            "gemini/gemini-2.5-flash-lite",
            "gemini/gemini-1.5-flash",
        ],
        client_kind="gemini",
    ),
    "openrouter": ProviderConfig(
        name="openrouter",
        display_name="OpenRouter",
        env_key="OPENROUTER_API_KEY",
        base_url="https://openrouter.ai/api/v1",
        default_model="openrouter/meta-llama/llama-3.3-70b-instruct:free",
        model_candidates=[
            "openrouter/meta-llama/llama-3.3-70b-instruct:free",
            "openrouter/qwen/qwen3-235b-a22b:free",
            "openrouter/deepseek/deepseek-r1:free",
            "openrouter/mistralai/mistral-small-3.1-24b-instruct:free",
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
        default_model="groq/llama-3.3-70b-versatile",
        model_candidates=[
            "groq/llama-3.3-70b-versatile",
            "groq/llama-3.1-8b-instant",
            "groq/gemma2-9b-it",
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
}


def _resolve_provider_name() -> str:
    provider = os.getenv("LLM_PROVIDER", "").strip().lower()
    if provider and provider in PROVIDER_CONFIGS:
        return provider

    for name in DEFAULT_PROVIDER_PRIORITY:
        config = PROVIDER_CONFIGS[name]
        if os.getenv(config.env_key, "").strip():
            return name

    return "gemini"


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
        if os.getenv(config.env_key, "").strip() or name == preferred:
            chain.append(name)

    return chain or [preferred]


def create_chat_model(
    *,
    provider_name: Optional[str] = None,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    temperature: float = 0.1,
    max_tokens: int = 4096,
) -> BaseProviderChatClient:
    name = provider_name or _resolve_provider_name()
    config = PROVIDER_CONFIGS.get(name)
    if not config:
        raise ValueError(f"Unknown LLM provider: '{name}'")

    resolved_api_key = str(api_key or os.getenv(config.env_key, "")).strip()
    if not resolved_api_key:
        raise ValueError(
            f"API key for provider '{config.display_name}' is not configured. Set {config.env_key}."
        )

    model_name = _normalize_model_name(name, model or os.getenv("LLM_MODEL", "").strip() or config.default_model)

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


def get_provider_config(provider_name: Optional[str] = None) -> ProviderConfig:
    name = provider_name or _resolve_provider_name()
    config = PROVIDER_CONFIGS.get(name)
    if not config:
        raise ValueError(f"Unknown provider: {name}")
    return config


def list_providers() -> List[Dict[str, Any]]:
    active = _resolve_provider_name()
    provider_chain = resolve_provider_chain(active)
    result: List[Dict[str, Any]] = []
    for name, config in PROVIDER_CONFIGS.items():
        configured = bool(os.getenv(config.env_key, "").strip())
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
