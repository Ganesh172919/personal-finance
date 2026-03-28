"""
LLM wrapper with multi-provider support, model failover, rate limiting,
and graceful fallback handling.

Supports: Gemini, OpenRouter, Groq, Grok (xAI), Together AI, Mistral.
Provider selection is controlled by LLM_PROVIDER env var or auto-detected.
"""

import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage

from config import settings
from utils.provider_registry import (
    PROVIDER_CONFIGS,
    _resolve_provider_name,
    create_chat_model,
    resolve_provider_chain,
)
from utils.rate_limiter import RateLimitError, get_rate_limiter_status, with_rate_limit_and_retry
from utils.request_metrics import get_request_id, record_llm_call, record_llm_usage

logger = logging.getLogger(__name__)


class AIProviderError(Exception):
    """Base provider exception with optional upstream status code."""

    def __init__(self, message: str, status_code: Optional[int] = None, model: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.model = model


class QuotaExceededError(AIProviderError):
    """Upstream quota exceeded / rate limited (HTTP 429)."""


class AccessDeniedError(AIProviderError):
    """Upstream access denied (HTTP 403)."""


class ModelNotFoundError(AIProviderError):
    """Configured model not found (HTTP 404)."""


class RateLimitedLLM:
    """
    A wrapper around any LangChain BaseChatModel that provides:
    - Multi-provider support (Gemini, OpenRouter, Groq, Grok, Together, Mistral)
    - Automatic rate limiting
    - Model failover on model-not-found errors
    - Cross-provider failover when a provider is unavailable or quota-bound
    - Graceful fallback support for quota/access issues
    - Request-level LLM call counting
    """

    def __init__(
        self,
        model: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: int = 1024,
        api_key: Optional[str] = None,
        model_candidates: Optional[List[str]] = None,
        provider: Optional[str] = None,
    ):
        self.preferred_provider = provider or _resolve_provider_name()
        self.provider_candidates = resolve_provider_chain(self.preferred_provider)
        self.active_provider = self.provider_candidates[0] if self.provider_candidates else self.preferred_provider
        self.preferred_model = model
        self.preferred_model_candidates = model_candidates or []
        self.active_model = ""
        self.temperature = temperature
        self.max_tokens = max_tokens
        self._api_key = api_key
        self._llm_clients: Dict[str, BaseChatModel] = {}

        self._call_count = 0
        self._error_count = 0
        self._last_error: Optional[str] = None

        initial_candidates = self._model_candidates_for_provider(self.active_provider)
        self.active_model = initial_candidates[0] if initial_candidates else ""

    @property
    def provider_name(self) -> str:
        return self.active_provider

    def _provider_config(self, provider_name: str):
        return PROVIDER_CONFIGS.get(provider_name)

    def _get_api_key(self, provider_name: str) -> str:
        provider_config = self._provider_config(provider_name)
        if not provider_config:
            return ""
        if self._api_key and provider_name == self.preferred_provider:
            return self._api_key
        return os.getenv(provider_config.env_key, "").strip()

    def _model_candidates_for_provider(self, provider_name: str) -> List[str]:
        provider_config = self._provider_config(provider_name)

        if provider_config:
            if provider_name == self.preferred_provider:
                configured_candidates = self.preferred_model_candidates or provider_config.model_candidates
                primary = self.preferred_model or provider_config.default_model
            else:
                configured_candidates = provider_config.model_candidates
                primary = provider_config.default_model
        else:
            configured_candidates = self.preferred_model_candidates or settings.MODEL_CANDIDATES
            primary = self.preferred_model or settings.MODEL_NAME

        deduped: List[str] = []
        for candidate in [primary, *configured_candidates]:
            if candidate and candidate not in deduped:
                deduped.append(candidate)
        return deduped

    def _client_for_model(self, provider_name: str, model_name: str) -> BaseChatModel:
        cache_key = f"{provider_name}:{model_name}"
        if cache_key not in self._llm_clients:
            provider_config = self._provider_config(provider_name)
            env_key = provider_config.env_key if provider_config else "GEMINI_API_KEY"
            original_val = os.environ.get(env_key, "")
            override_api_key = self._api_key if provider_name == self.preferred_provider else None

            if override_api_key:
                os.environ[env_key] = override_api_key

            try:
                self._llm_clients[cache_key] = create_chat_model(
                    provider_name=provider_name,
                    model=model_name,
                    temperature=self.temperature,
                    max_tokens=self.max_tokens,
                )
            finally:
                if override_api_key:
                    os.environ[env_key] = original_val

        return self._llm_clients[cache_key]

    def _extract_status_code(self, error: Exception) -> Optional[int]:
        message = str(error).lower()

        if "permission_denied" in message or " 403 " in message or "[403]" in message:
            return 403
        if "not found" in message or " 404 " in message or "[404]" in message:
            return 404
        if "resource_exhausted" in message or "too many requests" in message or " 429 " in message or "[429]" in message:
            return 429

        match = re.search(r"\b(403|404|429|500|502|503)\b", message)
        return int(match.group(1)) if match else None

    def _to_provider_error(
        self, provider_name: str, raw_error: Exception, status_code: Optional[int], model_name: str
    ) -> AIProviderError:
        message = f"[{provider_name}] Model '{model_name}' failed: {raw_error}"

        if status_code == 429:
            return QuotaExceededError(message, status_code=status_code, model=model_name)
        if status_code == 403:
            return AccessDeniedError(message, status_code=status_code, model=model_name)
        if status_code == 404:
            return ModelNotFoundError(message, status_code=status_code, model=model_name)

        return AIProviderError(message, status_code=status_code, model=model_name)

    def _log_invoke_attempt(self, provider_name: str, model_name: str) -> None:
        timeout_seconds = getattr(settings, "LLM_TIMEOUT_SECONDS", None)
        request_id = get_request_id()

        if request_id:
            logger.info(
                "[requestId=%s] LLM invoke provider=%s model=%s timeoutSeconds=%s",
                request_id,
                provider_name,
                model_name,
                timeout_seconds,
            )
        else:
            logger.info(
                "LLM invoke provider=%s model=%s timeoutSeconds=%s",
                provider_name,
                model_name,
                timeout_seconds,
            )

    @with_rate_limit_and_retry
    def invoke(
        self,
        messages: List[BaseMessage],
        fallback_response: Optional[str] = None,
    ) -> Any:
        del fallback_response

        last_error: Optional[AIProviderError] = None

        for provider_index, provider_name in enumerate(self.provider_candidates):
            api_key = self._get_api_key(provider_name)
            model_candidates = self._model_candidates_for_provider(provider_name)

            if not api_key:
                last_error = AccessDeniedError(
                    f"{provider_name} is not configured; skipping provider.",
                    status_code=403,
                    model=model_candidates[0] if model_candidates else None,
                )
                self._error_count += 1
                self._last_error = str(last_error)
                continue

            for model_index, model_name in enumerate(model_candidates):
                try:
                    self._call_count += 1
                    record_llm_call()
                    self._log_invoke_attempt(provider_name, model_name)

                    client = self._client_for_model(provider_name, model_name)
                    timeout_seconds = getattr(settings, "LLM_TIMEOUT_SECONDS", None)

                    invoke_kwargs: Dict[str, Any] = {}
                    if timeout_seconds is not None:
                        invoke_kwargs["timeout"] = timeout_seconds
                    # NOTE: max_retries is a constructor param, NOT an invoke
                    # param.  Passing it here caused every provider to crash
                    # with "got an unexpected keyword argument 'max_retries'".
                    # Our own @with_rate_limit_and_retry decorator already
                    # handles retries, so this is not needed.

                    response = client.invoke(messages, **invoke_kwargs)

                    usage_metadata = getattr(response, "usage_metadata", None)
                    if usage_metadata is not None:
                        try:
                            prompt_tokens = None
                            completion_tokens = None
                            total_tokens = None

                            if isinstance(usage_metadata, dict):
                                prompt_tokens = (
                                    usage_metadata.get("prompt_token_count")
                                    or usage_metadata.get("input_token_count")
                                    or usage_metadata.get("prompt_tokens")
                                )
                                completion_tokens = (
                                    usage_metadata.get("candidates_token_count")
                                    or usage_metadata.get("output_token_count")
                                    or usage_metadata.get("completion_tokens")
                                )
                                total_tokens = usage_metadata.get("total_token_count") or usage_metadata.get("total_tokens")

                            record_llm_usage(
                                model=f"{provider_name}/{model_name}",
                                prompt_tokens=int(prompt_tokens or 0) if prompt_tokens is not None else None,
                                completion_tokens=int(completion_tokens or 0) if completion_tokens is not None else None,
                                total_tokens=int(total_tokens or 0) if total_tokens is not None else None,
                            )
                        except Exception:
                            pass

                    self.active_provider = provider_name
                    self.active_model = model_name

                    # Log successful response for debugging
                    response_text = getattr(response, "content", None) or str(response)
                    logger.info(
                        "LLM response OK: provider=%s model=%s length=%d preview=%s",
                        provider_name,
                        model_name,
                        len(response_text),
                        response_text[:120].replace("\n", " ") + ("..." if len(response_text) > 120 else ""),
                    )
                    return response

                except Exception as exc:
                    status_code = self._extract_status_code(exc)
                    provider_error = self._to_provider_error(provider_name, exc, status_code, model_name)
                    last_error = provider_error
                    self._error_count += 1
                    self._last_error = str(provider_error)

                    if isinstance(provider_error, ModelNotFoundError) and model_index < len(model_candidates) - 1:
                        next_model = model_candidates[model_index + 1]
                        logger.warning(
                            "Model failover triggered: provider=%s unavailable_model=%s next_model=%s",
                            provider_name,
                            model_name,
                            next_model,
                        )
                        continue

                    if provider_index < len(self.provider_candidates) - 1:
                        next_provider = self.provider_candidates[provider_index + 1]
                        logger.warning(
                            "Provider failover triggered: provider=%s model=%s next_provider=%s error=%s",
                            provider_name,
                            model_name,
                            next_provider,
                            provider_error,
                        )
                    break

        if last_error:
            logger.error(
                "ALL %d LLM providers failed. Last error: %s",
                len(self.provider_candidates),
                last_error,
            )
            raise last_error

        logger.error("No configured LLM providers are available.")
        raise AccessDeniedError("No configured LLM providers are available.", status_code=403)

    def invoke_with_fallback(
        self,
        messages: List[BaseMessage],
        fallback_response: str,
    ) -> Tuple[Any, bool]:
        if not any(self._get_api_key(provider_name) for provider_name in self.provider_candidates):
            logger.info("LLM disabled (no provider API keys configured). Returning deterministic fallback response.")
            return self._create_fallback_response(fallback_response), True

        try:
            response = self.invoke(messages)
            return response, False
        except (QuotaExceededError, AccessDeniedError, ModelNotFoundError, RateLimitError, AIProviderError) as exc:
            logger.warning("LLM fallback activated due to upstream error: %s", exc)
            return self._create_fallback_response(fallback_response), True
        except Exception as exc:
            logger.error("Unexpected LLM error, using fallback: %s", exc)
            return self._create_fallback_response(fallback_response), True

    def _create_fallback_response(self, content: str):
        class FallbackResponse:
            def __init__(self, text: str):
                self.content = text

        return FallbackResponse(content)

    def get_stats(self) -> Dict[str, Any]:
        return {
            "preferred_provider": self.preferred_provider,
            "active_provider": self.active_provider,
            "provider_candidates": self.provider_candidates,
            "active_model": self.active_model,
            "model_candidates": self._model_candidates_for_provider(self.active_provider),
            "total_calls": self._call_count,
            "error_count": self._error_count,
            "success_rate": (
                (self._call_count - self._error_count) / self._call_count * 100 if self._call_count > 0 else 100
            ),
            "last_error": self._last_error,
            "rate_limiter_status": get_rate_limiter_status(),
        }


# ─── Per-Agent Provider/Model Routing ────────────────────
# Maps agent roles to specific providers and models so that the multi-agent
# system distributes load across free-tier quotas instead of hammering one.
AGENT_PROVIDER_MAP: Dict[str, Dict[str, str]] = {
    "master":    {"provider": "gemini",     "model": "gemini-2.5-flash"},
    "educator":  {"provider": "openrouter", "model": "meta-llama/llama-3.3-70b-instruct:free"},
    "analyzer":  {"provider": "groq",       "model": "llama-3.3-70b-versatile"},
    "planner":   {"provider": "gemini",     "model": "gemini-2.5-flash"},
    "advisor":   {"provider": "openrouter", "model": "qwen/qwen3-235b-a22b:free"},
    "optimizer": {"provider": "groq",       "model": "llama-3.1-8b-instant"},
}


def create_llm(agent_type: str = "default", provider: Optional[str] = None) -> RateLimitedLLM:
    config = settings.get_agent_config(agent_type)

    # Check the per-agent routing map first, then fall back to env / auto-detect.
    agent_map = AGENT_PROVIDER_MAP.get(agent_type, {})
    provider_name = provider or agent_map.get("provider") or _resolve_provider_name()
    provider_config = PROVIDER_CONFIGS.get(provider_name)

    model = agent_map.get("model") or (provider_config.default_model if provider_config else settings.MODEL_NAME)
    candidates = provider_config.model_candidates if provider_config else settings.MODEL_CANDIDATES

    logger.info(
        "create_llm: agent_type=%s provider=%s model=%s",
        agent_type,
        provider_name,
        model,
    )

    return RateLimitedLLM(
        model=model,
        model_candidates=candidates,
        temperature=config.get("temperature", 0.1),
        max_tokens=config.get("max_tokens", 1024),
        provider=provider_name,
    )


FALLBACK_RESPONSES = {
    "analysis_type": "comprehensive",
    "financial_education": """
I apologize, but I'm currently experiencing high demand. Here's a quick explanation:

Financial literacy means understanding how to earn, save, invest, and protect money. Start with:
- Budgeting: track income and expenses
- Emergency fund: save 3-6 months of expenses
- Debt: prioritize high-interest debt
- Investing: diversify for long-term growth

Please retry in a moment for a deeper personalized explanation.
""",
    "budget_plan": """
I'm temporarily unable to generate a personalized budget. A practical baseline is:
- 50% needs
- 30% wants
- 20% savings/debt payoff

Please retry shortly for a customized plan.
""",
    "investment_advice": """
I'm temporarily unable to provide personalized investment advice.
General approach: maintain emergency savings, reduce high-interest debt,
then invest in a diversified portfolio aligned with your risk profile.
""",
    "debt_optimization": """
I'm temporarily unable to create a personalized debt strategy.
Use either:
- Avalanche (highest interest first) for minimum total interest
- Snowball (smallest balance first) for momentum
""",
    "synthesis": """
I couldn't generate a full AI narrative right now, but here is a safe action plan:
1. Stabilize monthly cash flow (spend less than income)
2. Build emergency savings (3-6 months)
3. Pay down high-interest debt first
4. Invest consistently in diversified assets aligned to your risk tolerance
""",
}


def get_fallback_response(response_type: str) -> str:
    return FALLBACK_RESPONSES.get(response_type, FALLBACK_RESPONSES["synthesis"])
