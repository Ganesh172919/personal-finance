"""
LLM Wrapper with multi-provider support, model failover, rate limiting,
and graceful fallback handling.

Supports: Gemini, OpenRouter, Groq, Grok (xAI), Together AI, Mistral.
Provider selection is controlled by LLM_PROVIDER env var or auto-detected.
"""

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage

from config import settings
from utils.provider_registry import (
    create_chat_model,
    get_provider_config,
    list_providers,
    _resolve_provider_name,
    PROVIDER_CONFIGS,
)
from utils.rate_limiter import (
    RateLimitError,
    get_rate_limiter_status,
    with_rate_limit_and_retry,
)
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
    - Cross-provider failover when all models for a provider fail
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
        self._provider_name = provider or _resolve_provider_name()
        self._provider_config = PROVIDER_CONFIGS.get(self._provider_name)

        if self._provider_config:
            configured_candidates = model_candidates or self._provider_config.model_candidates
            primary = model or self._provider_config.default_model
        else:
            configured_candidates = model_candidates or settings.MODEL_CANDIDATES
            primary = model or settings.MODEL_NAME

        # Ensure primary model is first while preserving unique order
        deduped: List[str] = []
        for candidate in [primary, *configured_candidates]:
            if candidate and candidate not in deduped:
                deduped.append(candidate)

        self.model_candidates = deduped
        self.active_model = self.model_candidates[0]
        self.temperature = temperature
        self.max_tokens = max_tokens
        self._api_key = api_key  # Override; normally resolved from env

        self._llm_clients: Dict[str, BaseChatModel] = {}

        # Track call statistics
        self._call_count = 0
        self._error_count = 0
        self._last_error: Optional[str] = None

    @property
    def provider_name(self) -> str:
        return self._provider_name

    def _client_for_model(self, model_name: str) -> BaseChatModel:
        cache_key = f"{self._provider_name}:{model_name}"
        if cache_key not in self._llm_clients:
            import os
            # If an explicit api_key was passed, temporarily set the env var
            env_key = self._provider_config.env_key if self._provider_config else "GEMINI_API_KEY"
            original_val = os.environ.get(env_key, "")
            if self._api_key:
                os.environ[env_key] = self._api_key
            try:
                self._llm_clients[cache_key] = create_chat_model(
                    provider_name=self._provider_name,
                    model=model_name,
                    temperature=self.temperature,
                    max_tokens=self.max_tokens,
                )
            finally:
                if self._api_key and original_val is not None:
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

    def _to_provider_error(self, raw_error: Exception, status_code: Optional[int], model_name: str) -> AIProviderError:
        message = f"[{self._provider_name}] Model '{model_name}' failed: {raw_error}"

        if status_code == 429:
            return QuotaExceededError(message, status_code=status_code, model=model_name)
        if status_code == 403:
            return AccessDeniedError(message, status_code=status_code, model=model_name)
        if status_code == 404:
            return ModelNotFoundError(message, status_code=status_code, model=model_name)

        return AIProviderError(message, status_code=status_code, model=model_name)

    @with_rate_limit_and_retry
    def invoke(
        self,
        messages: List[BaseMessage],
        fallback_response: Optional[str] = None,
    ) -> Any:
        """
        Invoke the LLM with rate limiting and model failover.

        Args:
            messages: List of messages to send to the LLM
            fallback_response: Unused in invoke; kept for compatibility.

        Returns:
            LLM response object
        """
        # Check if any API key is configured
        import os
        env_key = self._provider_config.env_key if self._provider_config else "GEMINI_API_KEY"
        effective_key = self._api_key or os.getenv(env_key, "").strip()

        if not effective_key:
            raise AccessDeniedError(
                f"{env_key} is not configured; skipping upstream LLM call.",
                status_code=403,
                model=self.active_model,
            )

        last_error: Optional[AIProviderError] = None

        for idx, model_name in enumerate(self.model_candidates):
            try:
                self._call_count += 1
                record_llm_call()

                client = self._client_for_model(model_name)
                timeout_seconds = getattr(settings, "LLM_TIMEOUT_SECONDS", None)
                max_retries = getattr(settings, "LLM_MAX_RETRIES", None)
                request_id = get_request_id()

                if request_id:
                    logger.info(
                        "[requestId=%s] LLM invoke provider=%s model=%s timeoutSeconds=%s",
                        request_id,
                        self._provider_name,
                        model_name,
                        timeout_seconds,
                    )
                else:
                    logger.info(
                        "LLM invoke provider=%s model=%s timeoutSeconds=%s",
                        self._provider_name,
                        model_name,
                        timeout_seconds,
                    )

                invoke_kwargs: Dict[str, Any] = {}
                if timeout_seconds is not None:
                    invoke_kwargs["timeout"] = timeout_seconds
                if max_retries is not None:
                    invoke_kwargs["max_retries"] = max_retries

                response = client.invoke(messages, **invoke_kwargs)

                usage_metadata = getattr(response, "usage_metadata", None)
                if usage_metadata is not None:
                    logger.info("LLM usage_metadata=%s", usage_metadata)
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
                            total_tokens = (
                                usage_metadata.get("total_token_count")
                                or usage_metadata.get("total_tokens")
                            )

                        record_llm_usage(
                            model=f"{self._provider_name}/{model_name}",
                            prompt_tokens=int(prompt_tokens or 0) if prompt_tokens is not None else None,
                            completion_tokens=int(completion_tokens or 0) if completion_tokens is not None else None,
                            total_tokens=int(total_tokens or 0) if total_tokens is not None else None,
                        )
                    except Exception:
                        pass

                self.active_model = model_name
                return response

            except Exception as exc:
                status_code = self._extract_status_code(exc)
                provider_error = self._to_provider_error(exc, status_code, model_name)
                last_error = provider_error
                self._error_count += 1
                self._last_error = str(provider_error)

                # Fail over only on model-not-found when alternatives exist
                if isinstance(provider_error, ModelNotFoundError) and idx < len(self.model_candidates) - 1:
                    next_model = self.model_candidates[idx + 1]
                    logger.warning(
                        "Model failover triggered: '%s' unavailable (404). Switching to '%s'.",
                        model_name,
                        next_model,
                    )
                    continue

                raise provider_error

        if last_error:
            raise last_error

        raise AIProviderError("LLM invocation failed with no specific error")

    def invoke_with_fallback(
        self,
        messages: List[BaseMessage],
        fallback_response: str,
    ) -> Tuple[Any, bool]:
        """
        Invoke the LLM with a guaranteed fallback response.

        Returns:
            Tuple of (response_object, fallback_used)
        """
        import os
        env_key = self._provider_config.env_key if self._provider_config else "GEMINI_API_KEY"
        effective_key = self._api_key or os.getenv(env_key, "").strip()

        if not effective_key:
            logger.info("LLM disabled (missing %s). Returning deterministic fallback response.", env_key)
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
        """Create a minimal response object for fallback scenarios."""

        class FallbackResponse:
            def __init__(self, text: str):
                self.content = text

        return FallbackResponse(content)

    def get_stats(self) -> Dict[str, Any]:
        """Get call statistics for this LLM instance."""
        return {
            "provider": self._provider_name,
            "active_model": self.active_model,
            "model_candidates": self.model_candidates,
            "total_calls": self._call_count,
            "error_count": self._error_count,
            "success_rate": (
                (self._call_count - self._error_count) / self._call_count * 100 if self._call_count > 0 else 100
            ),
            "last_error": self._last_error,
            "rate_limiter_status": get_rate_limiter_status(),
        }


def create_llm(agent_type: str = "default", provider: Optional[str] = None) -> RateLimitedLLM:
    """
    Factory function to create a rate-limited LLM for a specific agent type.

    Args:
        agent_type: The agent type for configuration lookup.
        provider: Optional provider override (gemini, openrouter, groq, grok, together, mistral).
    """
    config = settings.get_agent_config(agent_type)

    provider_name = provider or _resolve_provider_name()
    provider_config = PROVIDER_CONFIGS.get(provider_name)

    model = provider_config.default_model if provider_config else settings.MODEL_NAME
    candidates = provider_config.model_candidates if provider_config else settings.MODEL_CANDIDATES

    return RateLimitedLLM(
        model=model,
        model_candidates=candidates,
        temperature=config.get("temperature", 0.1),
        max_tokens=config.get("max_tokens", 1024),
        provider=provider_name,
    )


# Fallback responses for different agent types
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
    """Get a fallback response for a specific type."""
    return FALLBACK_RESPONSES.get(response_type, FALLBACK_RESPONSES["synthesis"])
