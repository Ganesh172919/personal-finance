"""
llm_wrapper.py - Multi-Provider LLM Abstraction with Failover
=============================================================

This module provides ``RateLimitedLLM``, a **resilient LLM client** that
abstracts away the complexity of talking to multiple LLM providers (Gemini,
OpenRouter, Groq, OpenAI, DeepSeek, Together, Mistral, etc.) behind a single
``invoke()`` method.

Core capabilities
-----------------
1. **Provider failover** -- If the preferred provider fails, the client
   automatically tries the next provider in the fallback chain.
2. **Model failover** -- Within a provider, if the preferred model fails
   (e.g. 404 Not Found), the next model candidate is tried.
3. **Key rotation** -- For providers with multiple API keys, the client uses
   a ``KeyPool`` to rotate keys and avoid rate limits.
4. **Circuit breaking** -- Models in cooldown or circuit-open state are
   skipped to avoid wasting time on known-broken endpoints.
5. **Rate limiting** -- A decorator-based rate limiter throttles outbound
   requests to stay within provider quotas.
6. **Telemetry** -- Every call records provider, model, key, latency, token
   usage, and cost for observability.
7. **Secure error handling** -- API keys are redacted from error messages
   before logging.

Architecture
------------
``RateLimitedLLM`` is instantiated per agent (via ``create_llm()``).  Each
instance holds:
- A preferred provider and model
- A fallback chain of providers
- Cached LangChain client instances (keyed by provider:model:key)
- Per-provider ``KeyPool`` instances
- A ``ModelHealthTracker`` for success/failure rates

The ``invoke()`` method iterates over providers and models, trying each
combination until one succeeds or all are exhausted.  The ``invoke_with_fallback()``` wrapper adds a deterministic fallback response when all
LLM attempts fail.

Key classes
-----------
- ``RateLimitedLLM`` -- the main client class
- ``AIProviderError`` (and subclasses) -- structured error types
- ``create_llm()`` -- factory function used by agents
- ``AGENT_TASK_CONFIG`` -- per-agent provider/model/capability mapping
- ``FALLBACK_RESPONSES`` -- deterministic responses when LLM is unavailable
"""

from __future__ import annotations

import logging
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from config import settings
from utils.key_pool import KeyPool, get_key_pool
from utils.model_catalog import (
    CostTier,
    ModelCapability,
    ModelEntry,
    get_best_model_for_task,
    get_fallback_chain as catalog_get_fallback_chain,
    get_model_by_id,
    get_models_for_task,
)
from utils.model_health import ModelHealthStatus, get_model_health_tracker
from utils.provider_registry import (
    PROVIDER_CONFIGS,
    _resolve_provider_name,
    create_chat_model,
    resolve_provider_chain,
)
from utils.rate_limiter import RateLimitError, get_rate_limiter_status, with_rate_limit_and_retry
from utils.request_metrics import get_request_id, record_llm_call, record_llm_usage

logger = logging.getLogger(__name__)
_LAST_ROUTE_SNAPSHOT: Dict[str, Any] = {}


class AIProviderError(Exception):
    """Base exception for all LLM provider errors.

    Carries structured metadata (status_code, model, key_id, provider) so
    that the failover logic can make informed decisions about whether to
    retry with a different key, model, or provider.
    """

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        model: Optional[str] = None,
        key_id: Optional[str] = None,
        provider: Optional[str] = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.model = model
        self.key_id = key_id
        self.provider = provider


class QuotaExceededError(AIProviderError):
    """HTTP 429 -- rate limit or quota exceeded.

    Triggers key rotation (try next API key) or provider failover.
    """
    pass


class AccessDeniedError(AIProviderError):
    """HTTP 403 -- API key is invalid or access is denied.

    Triggers key rotation (try next API key) or provider failover.
    """
    pass


class ModelNotFoundError(AIProviderError):
    """HTTP 404 -- the requested model does not exist on this provider.

    Triggers model failover (try next model candidate within the same provider).
    """
    pass


def _normalize_model_id(provider_name: str, model: str) -> str:
    """Ensure a model ID has the ``provider/model`` prefix format.

    LangChain model IDs are typically ``"provider/model-name"``.  This
    function adds the prefix if missing.
    """
    cleaned = str(model or "").strip()
    if cleaned.startswith(f"{provider_name}/"):
        return cleaned
    return f"{provider_name}/{cleaned}"


def _raw_model_name(model_id: str) -> str:
    """Extract the model name without the provider prefix.

    E.g. ``"gemini/gemini-2.5-flash"`` -> ``"gemini-2.5-flash"``.
    """
    return str(model_id or "").split("/", 1)[1] if "/" in str(model_id or "") else str(model_id or "")


def _sanitize_text(value: Any) -> str:
    """Clean text by removing null bytes and normalising whitespace.

    LLM outputs sometimes contain null bytes or unusual whitespace that
    can cause issues downstream.  This function strips them.
    """
    text = str(value or "")
    text = text.replace("\x00", "")
    text = re.sub(r"[^\S\r\n\t]+", " ", text)
    return text.strip()


def _sanitize_messages(messages: List[BaseMessage]) -> List[BaseMessage]:
    """Sanitize the content of every message in a list.

    Creates new message instances with cleaned content to avoid mutating the
    originals.
    """
    sanitized: List[BaseMessage] = []
    for message in messages:
        content = _sanitize_text(getattr(message, "content", ""))
        if isinstance(message, SystemMessage):
            sanitized.append(SystemMessage(content=content))
        elif isinstance(message, HumanMessage):
            sanitized.append(HumanMessage(content=content))
        elif isinstance(message, AIMessage):
            sanitized.append(AIMessage(content=content))
        else:
            sanitized.append(message)
    return sanitized


class RateLimitedLLM:
    """Resilient LLM client with provider/model/key failover.

    This class wraps LangChain's chat model interface and adds:
    - Automatic provider failover (Gemini -> OpenRouter -> Groq -> ...)
    - Automatic model failover within a provider
    - API key rotation via ``KeyPool``
    - Circuit breaking via ``ModelHealthTracker``
    - Rate limiting via a decorator
    - Telemetry (latency, token usage, cost)

    Instances are created per agent via ``create_llm()``.
    """

    def __init__(
        self,
        model: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: int = 1024,
        api_key: Optional[str] = None,
        model_candidates: Optional[List[str]] = None,
        provider: Optional[str] = None,
        task_capability: Optional[ModelCapability] = None,
        max_cost_tier: Optional[CostTier] = None,
    ):
        # --- Provider chain ---
        # The preferred provider is tried first.  If it fails, the fallback
        # chain (resolved by ``resolve_provider_chain``) is tried in order.
        self.preferred_provider = provider or _resolve_provider_name()
        self.provider_candidates = resolve_provider_chain(self.preferred_provider)

        # --- Model candidates ---
        # The preferred model is tried first.  Additional candidates come
        # from the provider config and the model catalog.
        self.preferred_model_id = _normalize_model_id(self.preferred_provider, model) if model else None
        self.preferred_model_candidates = [
            _normalize_model_id(self.preferred_provider, candidate) for candidate in (model_candidates or [])
        ]

        self.temperature = temperature
        self.max_tokens = max_tokens
        self._api_key = api_key
        self._task_capability = task_capability
        self._max_cost_tier = max_cost_tier

        # --- Client cache ---
        # LangChain chat model instances are cached by "provider:model:key_hash"
        # to avoid recreating them on every call.
        self._llm_clients: Dict[str, Any] = {}

        # --- Key pools (per provider) ---
        self._key_pools: Dict[str, KeyPool] = {}

        # --- Model health tracker ---
        self._model_health = get_model_health_tracker()

        # --- Active state (updated after each successful call) ---
        self.active_provider = self.preferred_provider
        self.active_model = self.preferred_model_id or ""
        self.active_key_id: Optional[str] = None

        # --- Telemetry counters ---
        self._call_count = 0
        self._error_count = 0
        self._last_error: Optional[str] = None
        self._last_latency_ms: float = 0.0
        self._fallback_path: List[str] = []          # Models tried in order
        self._recovered_failures: List[Dict[str, Any]] = []  # Failover events

    @property
    def provider_name(self) -> str:
        return self.active_provider

    def _provider_config(self, provider_name: str):
        return PROVIDER_CONFIGS.get(provider_name)

    def _get_key_pool(self, provider_name: str) -> KeyPool:
        if provider_name not in self._key_pools:
            self._key_pools[provider_name] = get_key_pool(provider_name)
        return self._key_pools[provider_name]

    def _get_api_key(self, provider_name: str) -> Tuple[str, Optional[str]]:
        provider_config = self._provider_config(provider_name)
        if not provider_config:
            return "", None

        if self._api_key and provider_name == self.preferred_provider:
            return self._api_key, None

        pool = self._get_key_pool(provider_name)
        key_entry = pool.get_healthy_key()
        if key_entry:
            return key_entry.key, key_entry.key_id

        single_key = os.getenv(provider_config.env_key, "").strip()
        return single_key, None

    def _fallback_model_entry(self, provider_name: str, model_id: str, rank: int) -> ModelEntry:
        return ModelEntry(
            model_id=model_id,
            provider=provider_name,
            display_name=_raw_model_name(model_id),
            capabilities={self._task_capability or ModelCapability.ANALYSIS},
            fallback_rank=rank,
            enabled=True,
        )

    def _catalog_candidates_for_provider(self, provider_name: str) -> List[ModelEntry]:
        capability = self._task_capability or ModelCapability.ANALYSIS
        candidates = get_models_for_task(
            capability,
            max_cost_tier=self._max_cost_tier,
            providers=[provider_name],
        )
        return list(candidates[:8])

    def _model_candidates_for_provider(self, provider_name: str) -> List[ModelEntry]:
        provider_config = self._provider_config(provider_name)
        ordered_entries: List[ModelEntry] = []
        seen_model_ids = set()

        preferred_models: List[str] = []
        if provider_name == self.preferred_provider:
            if self.preferred_model_id:
                preferred_models.append(self.preferred_model_id)
            preferred_models.extend(self.preferred_model_candidates)

        if provider_config:
            preferred_models.append(provider_config.default_model)
            preferred_models.extend(provider_config.model_candidates)

        for index, model_id in enumerate(preferred_models):
            normalized = _normalize_model_id(provider_name, model_id)
            entry = get_model_by_id(normalized) or self._fallback_model_entry(provider_name, normalized, 100 + index)
            if normalized not in seen_model_ids:
                ordered_entries.append(entry)
                seen_model_ids.add(normalized)

        catalog_entries = [entry for entry in self._catalog_candidates_for_provider(provider_name) if entry.model_id not in seen_model_ids]
        catalog_entries.sort(key=lambda entry: (-self._model_health.get_score(entry.model_id), entry.fallback_rank))
        ordered_entries.extend(catalog_entries)

        return ordered_entries[:8]

    def _client_for_model(self, provider_name: str, model_id: str, api_key: str):
        key_hash = hash(api_key) if api_key else 0
        cache_key = f"{provider_name}:{model_id}:{key_hash}"
        if cache_key not in self._llm_clients:
            self._llm_clients[cache_key] = create_chat_model(
                provider_name=provider_name,
                model=model_id,
                api_key=api_key,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )
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

    def _redact_message(self, text: str) -> str:
        redacted = re.sub(r"sk-[A-Za-z0-9_-]{8,}", "sk-***REDACTED***", text)
        redacted = re.sub(r"(?i)(api[_-]?key['\"=: ]+)([A-Za-z0-9._-]+)", r"\1***REDACTED***", redacted)
        return redacted

    def _to_provider_error(
        self,
        provider_name: str,
        raw_error: Exception,
        status_code: Optional[int],
        model_id: str,
        key_id: Optional[str] = None,
    ) -> AIProviderError:
        message = self._redact_message(str(raw_error))
        raw_model = _raw_model_name(model_id)
        formatted = f"[{provider_name}] Model '{raw_model}' failed: {message}"
        if key_id:
            formatted = f"[{provider_name}/{key_id}] Model '{raw_model}' failed: {message}"

        error_cls: type[AIProviderError]
        if status_code == 429:
            error_cls = QuotaExceededError
        elif status_code == 403:
            error_cls = AccessDeniedError
        elif status_code == 404:
            error_cls = ModelNotFoundError
        else:
            error_cls = AIProviderError

        return error_cls(
            formatted,
            status_code=status_code,
            model=raw_model,
            key_id=key_id,
            provider=provider_name,
        )

    def _log_invoke_attempt(self, provider_name: str, model_id: str, key_id: Optional[str]) -> None:
        request_id = get_request_id()
        raw_model = _raw_model_name(model_id)
        key_info = f" key={key_id}" if key_id else ""
        message = "LLM invoke provider=%s model=%s%s timeoutSeconds=%s"
        args = (provider_name, raw_model, key_info, getattr(settings, "LLM_TIMEOUT_SECONDS", None))

        if request_id:
            logger.info("[requestId=%s] " + message, request_id, *args)
        else:
            logger.info(message, *args)

    def _record_usage(self, model_id: str, response: Any) -> None:
        usage_metadata = getattr(response, "usage_metadata", None) or {}
        prompt_tokens = int(usage_metadata.get("prompt_tokens", 0) or 0)
        completion_tokens = int(usage_metadata.get("completion_tokens", 0) or 0)
        total_tokens = int(usage_metadata.get("total_tokens", prompt_tokens + completion_tokens) or 0)

        model_entry = get_model_by_id(model_id)
        cost_usd = None
        if model_entry:
            cost_usd = (
                (prompt_tokens / 1000.0) * float(model_entry.cost_input_per_1k)
                + (completion_tokens / 1000.0) * float(model_entry.cost_output_per_1k)
            )

        record_llm_usage(
            model=model_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            cost_usd=cost_usd,
        )

    @with_rate_limit_and_retry
    def invoke(self, messages: List[BaseMessage], fallback_response: Optional[str] = None) -> Any:
        """Send messages to the LLM with full failover logic.

        The failover strategy is a **three-level nested loop**:

        1. **Outer loop** -- iterate over providers (e.g. Gemini, OpenRouter, Groq)
        2. **Middle loop** -- iterate over API keys for the current provider
           (via ``KeyPool``)
        3. **Inner loop** -- iterate over model candidates for the current
           provider (e.g. gemini-2.5-flash, gemini-2.5-pro)

        At each level, specific error types trigger the appropriate failover:
        - ``ModelNotFoundError`` (404) -> try next model (inner loop ``continue``)
        - ``QuotaExceededError`` (429) -> try next key (middle loop ``break``)
        - ``AccessDeniedError`` (403) -> try next key (middle loop ``break``)
        - Other errors -> try next provider (outer loop ``break``)

        The ``@with_rate_limit_and_retry`` decorator adds token-bucket rate
        limiting and automatic retry with exponential backoff.

        Returns
        -------
        AIMessage
            The LLM's response.

        Raises
        ------
        AIProviderError
            If all providers/models/keys are exhausted.
        """
        del fallback_response  # unused; fallback is handled by invoke_with_fallback

        sanitized_messages = _sanitize_messages(messages)
        self._fallback_path = []
        self._recovered_failures = []
        last_error: Optional[AIProviderError] = None

        # --- Outer loop: providers ---
        for provider_index, provider_name in enumerate(self.provider_candidates):
            model_candidates = self._model_candidates_for_provider(provider_name)
            pool = self._get_key_pool(provider_name)
            tried_key_ids = set()
            max_key_attempts = len(pool.get_all_keys()) or 1

            # --- Middle loop: API keys ---
            for _ in range(max_key_attempts):
                api_key, key_id = self._get_api_key(provider_name)
                if not api_key:
                    last_error = AccessDeniedError(
                        f"{provider_name} is not configured; skipping provider.",
                        status_code=403,
                        provider=provider_name,
                    )
                    break

                # Skip keys we already tried in this provider cycle.
                if key_id and key_id in tried_key_ids:
                    continue
                if key_id:
                    tried_key_ids.add(key_id)

                # --- Inner loop: model candidates ---
                for model_index, model_entry in enumerate(model_candidates):
                    # Skip models in cooldown or circuit-open state (unless
                    # it's the last candidate -- give it a chance to recover).
                    status = self._model_health.get_status(model_entry.model_id)
                    if status in {ModelHealthStatus.COOLDOWN, ModelHealthStatus.CIRCUIT_OPEN} and model_index < len(model_candidates) - 1:
                        continue

                    start_time = time.perf_counter()
                    self._call_count += 1
                    record_llm_call()
                    self._fallback_path.append(model_entry.model_id)
                    self._log_invoke_attempt(provider_name, model_entry.model_id, key_id)

                    try:
                        client = self._client_for_model(provider_name, model_entry.model_id, api_key)
                        response = client.invoke(
                            sanitized_messages,
                            timeout=getattr(settings, "LLM_TIMEOUT_SECONDS", None),
                        )
                        latency_ms = (time.perf_counter() - start_time) * 1000.0
                        self._last_latency_ms = latency_ms
                        self.active_provider = provider_name
                        self.active_model = model_entry.model_id
                        self.active_key_id = key_id

                        if key_id:
                            pool.record_success(key_id, latency_ms)
                        self._model_health.record_success(model_entry.model_id, latency_ms)
                        self._record_usage(model_entry.model_id, response)

                        response_text = _sanitize_text(getattr(response, "content", ""))
                        logger.info(
                            "LLM response OK: provider=%s model=%s key=%s length=%d latency_ms=%.0f",
                            provider_name,
                            _raw_model_name(model_entry.model_id),
                            key_id or "default",
                            len(response_text),
                            latency_ms,
                        )
                        _LAST_ROUTE_SNAPSHOT.clear()
                        _LAST_ROUTE_SNAPSHOT.update(self.get_route_metadata())
                        return response
                    except Exception as exc:
                        latency_ms = (time.perf_counter() - start_time) * 1000.0
                        status_code = self._extract_status_code(exc)
                        provider_error = self._to_provider_error(
                            provider_name,
                            exc,
                            status_code,
                            model_entry.model_id,
                            key_id,
                        )
                        last_error = provider_error
                        self._error_count += 1
                        self._last_error = str(provider_error)

                        self._model_health.record_failure(model_entry.model_id, status_code)
                        if key_id:
                            pool.record_failure(key_id, status_code)

                        if isinstance(provider_error, ModelNotFoundError) and model_index < len(model_candidates) - 1:
                            self._recovered_failures.append(
                                {
                                    "type": "model_failover",
                                    "provider": provider_name,
                                    "from_model": model_entry.model_id,
                                    "to_model": model_candidates[model_index + 1].model_id,
                                }
                            )
                            logger.warning(
                                "Model failover triggered: provider=%s key=%s unavailable_model=%s next_model=%s",
                                provider_name,
                                key_id or "default",
                                _raw_model_name(model_entry.model_id),
                                _raw_model_name(model_candidates[model_index + 1].model_id),
                            )
                            continue

                        if isinstance(provider_error, QuotaExceededError):
                            self._recovered_failures.append(
                                {
                                    "type": "key_failover",
                                    "provider": provider_name,
                                    "key_id": key_id,
                                    "reason": "rate_limited",
                                    "latency_ms": round(latency_ms, 2),
                                }
                            )
                            logger.warning(
                                "Key rate limited: provider=%s key=%s model=%s - trying next key",
                                provider_name,
                                key_id or "default",
                                _raw_model_name(model_entry.model_id),
                            )
                            break

                        if isinstance(provider_error, AccessDeniedError):
                            self._recovered_failures.append(
                                {
                                    "type": "key_failover",
                                    "provider": provider_name,
                                    "key_id": key_id,
                                    "reason": "access_denied",
                                }
                            )
                            logger.warning(
                                "Key access denied: provider=%s key=%s model=%s - trying next key",
                                provider_name,
                                key_id or "default",
                                _raw_model_name(model_entry.model_id),
                            )
                            break

                        if provider_index < len(self.provider_candidates) - 1:
                            next_provider = self.provider_candidates[provider_index + 1]
                            self._recovered_failures.append(
                                {
                                    "type": "provider_failover",
                                    "from_provider": provider_name,
                                    "to_provider": next_provider,
                                    "model": model_entry.model_id,
                                }
                            )
                            logger.warning(
                                "Provider failover triggered: provider=%s model=%s next_provider=%s error=%s",
                                provider_name,
                                _raw_model_name(model_entry.model_id),
                                next_provider,
                                provider_error,
                            )
                        break

                if not isinstance(last_error, (QuotaExceededError, AccessDeniedError)):
                    break

        if last_error:
            logger.error(
                "ALL %d LLM providers failed. Fallback path: %s. Last error: %s",
                len(self.provider_candidates),
                " -> ".join(self._fallback_path),
                last_error,
            )
            raise last_error

        raise AccessDeniedError("No configured LLM providers are available.", status_code=403)

    def invoke_with_fallback(self, messages: List[BaseMessage], fallback_response: str) -> Tuple[Any, bool]:
        """Invoke the LLM with a deterministic fallback if all attempts fail.

        This is the **preferred entry point** for agent code.  It wraps
        ``invoke()`` and catches all LLM-related exceptions, returning a
        deterministic fallback response instead of raising.

        Returns
        -------
        tuple[AIMessage, bool]
            The response and a flag indicating whether the fallback was used
            (``True`` = LLM was unavailable, deterministic response returned).
        """
        # Fast path: if no API keys are configured at all, skip LLM entirely.
        if not any(self._get_api_key(provider_name)[0] for provider_name in self.provider_candidates):
            logger.info("LLM disabled (no provider API keys configured). Returning deterministic fallback response.")
            _LAST_ROUTE_SNAPSHOT.clear()
            _LAST_ROUTE_SNAPSHOT.update(
                {
                    "active_provider": "deterministic_fallback",
                    "active_model": "deterministic_fallback",
                    "fallback_path": [],
                    "recovered_failures": [],
                }
            )
            return self._create_fallback_response(fallback_response), True

        try:
            return self.invoke(messages), False
        except (QuotaExceededError, AccessDeniedError, ModelNotFoundError, RateLimitError, AIProviderError) as exc:
            logger.warning("LLM fallback activated due to upstream error: %s", exc)
            _LAST_ROUTE_SNAPSHOT.clear()
            _LAST_ROUTE_SNAPSHOT.update(self.get_route_metadata())
            return self._create_fallback_response(fallback_response), True
        except Exception as exc:
            logger.error("Unexpected LLM error, using fallback: %s", self._redact_message(str(exc)))
            _LAST_ROUTE_SNAPSHOT.clear()
            _LAST_ROUTE_SNAPSHOT.update(self.get_route_metadata())
            return self._create_fallback_response(fallback_response), True

    def _create_fallback_response(self, content: str):
        return AIMessage(content=content, response_metadata={"provider": "deterministic_fallback"})

    def get_route_metadata(self) -> Dict[str, Any]:
        return {
            "preferred_provider": self.preferred_provider,
            "active_provider": self.active_provider,
            "active_model": self.active_model,
            "active_key_id": self.active_key_id,
            "provider_candidates": list(self.provider_candidates),
            "fallback_path": list(self._fallback_path),
            "recovered_failures": list(self._recovered_failures),
            "last_latency_ms": round(self._last_latency_ms, 2),
            "last_error": self._last_error,
        }

    def get_stats(self) -> Dict[str, Any]:
        key_pool_stats = {}
        for provider in self.provider_candidates:
            key_pool_stats[provider] = self._get_key_pool(provider).get_stats()

        return {
            **self.get_route_metadata(),
            "total_calls": self._call_count,
            "error_count": self._error_count,
            "success_rate": ((self._call_count - self._error_count) / self._call_count * 100.0) if self._call_count else 100.0,
            "rate_limiter_status": get_rate_limiter_status(),
            "key_pools": key_pool_stats,
            "model_health": self._model_health.get_stats(),
        }


# ---------------------------------------------------------------------------
# Per-Agent Task Configuration
# ---------------------------------------------------------------------------
# Maps each agent type to its preferred provider, model, and capability.
# This is the **primary configuration** for the multi-provider strategy:
# - Routing agents use fast, cheap models (Groq Llama 8B)
# - Analysis agents use mid-tier models (Gemini Flash, Groq Llama 70B)
# - Reasoning agents use larger models (Qwen 235B, Gemini Pro)
# - Free-tier models on OpenRouter are used where possible to reduce cost
# ---------------------------------------------------------------------------
AGENT_TASK_CONFIG: Dict[str, Dict[str, Any]] = {
    "master": {
        "provider": "gemini",
        "model": "gemini/gemini-2.5-flash",
        "capability": ModelCapability.ROUTING,
        "description": "Fast routing and orchestration",
    },
    "educator": {
        "provider": "openrouter",
        "model": "openrouter/meta-llama/llama-3.3-70b-instruct:free",
        "capability": ModelCapability.ANALYSIS,
        "description": "Educational explanations",
    },
    "analyzer": {
        "provider": "groq",
        "model": "groq/llama-3.3-70b-versatile",
        "capability": ModelCapability.ANALYSIS,
        "description": "Data analysis and insights",
    },
    "planner": {
        "provider": "gemini",
        "model": "gemini/gemini-2.5-flash",
        "capability": ModelCapability.ANALYSIS,
        "description": "Budget and financial planning",
    },
    "advisor": {
        "provider": "openrouter",
        "model": "openrouter/qwen/qwen3-235b-a22b:free",
        "capability": ModelCapability.REASONING,
        "description": "Investment advice with reasoning",
    },
    "optimizer": {
        "provider": "groq",
        "model": "groq/llama-3.1-8b-instant",
        "capability": ModelCapability.SUMMARIZATION,
        "description": "Fast debt optimization",
    },
    "synthesis": {
        "provider": "gemini",
        "model": "gemini/gemini-2.5-pro",
        "capability": ModelCapability.REASONING,
        "description": "Final synthesis and recommendations",
    },
    "routing": {
        "provider": "groq",
        "model": "groq/llama-3.1-8b-instant",
        "capability": ModelCapability.ROUTING,
        "description": "Intent classification and routing",
    },
}

AGENT_PROVIDER_MAP: Dict[str, Dict[str, str]] = {
    name: {"provider": config["provider"], "model": config["model"]} for name, config in AGENT_TASK_CONFIG.items()
}


def create_llm(
    agent_type: str = "default",
    provider: Optional[str] = None,
    task_capability: Optional[ModelCapability] = None,
) -> RateLimitedLLM:
    """Factory function to create a ``RateLimitedLLM`` for a specific agent.

    This is the **primary entry point** used by all agents (e.g.
    ``self.llm = create_llm("master")``).

    The function resolves the provider, model, and capability from:
    1. Explicit arguments (highest priority)
    2. ``AGENT_TASK_CONFIG`` (per-agent defaults)
    3. ``settings`` (global fallbacks)
    4. Model catalog (best model for the capability)

    Parameters
    ----------
    agent_type : str
        The agent type key (e.g. "master", "educator", "analyzer").
    provider : str, optional
        Override the provider from the task config.
    task_capability : ModelCapability, optional
        Override the capability from the task config.

    Returns
    -------
    RateLimitedLLM
        A configured LLM client ready for ``invoke()`` calls.
    """
    config = settings.get_agent_config(agent_type)
    task_config = AGENT_TASK_CONFIG.get(agent_type, {})

    provider_name = provider or task_config.get("provider") or _resolve_provider_name()
    capability = task_capability or task_config.get("capability")
    model_id = task_config.get("model")

    if capability and not model_id:
        best_model = get_best_model_for_task(capability)
        if best_model:
            model_id = best_model.model_id
            provider_name = best_model.provider

    provider_config = PROVIDER_CONFIGS.get(provider_name)
    model_id = model_id or (provider_config.default_model if provider_config else settings.MODEL_NAME)
    candidates = provider_config.model_candidates if provider_config else settings.MODEL_CANDIDATES

    logger.info(
        "create_llm: agent_type=%s provider=%s model=%s capability=%s",
        agent_type,
        provider_name,
        model_id,
        capability.value if capability else "default",
    )

    return RateLimitedLLM(
        model=model_id,
        model_candidates=candidates,
        temperature=config.get("temperature", 0.1),
        max_tokens=config.get("max_tokens", 1024),
        provider=provider_name,
        task_capability=capability,
    )


# ---------------------------------------------------------------------------
# Deterministic Fallback Responses
# ---------------------------------------------------------------------------
# When the LLM is completely unavailable (no API keys, all providers down,
# etc.), these responses are returned instead.  They are intentionally generic
# and safe -- no personalised numbers, no hallucinated data.
# ---------------------------------------------------------------------------
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
    """Get a deterministic fallback response by type.

    Falls back to the ``synthesis`` response if the type is unknown.
    """
    return FALLBACK_RESPONSES.get(response_type, FALLBACK_RESPONSES["synthesis"])


def get_last_route_snapshot() -> Dict[str, Any]:
    """Return the routing metadata from the most recent successful LLM call.

    Used by the ``/api/ai/status`` endpoint to report which provider/model/key
    was last used.
    """
    return dict(_LAST_ROUTE_SNAPSHOT)


# ============================================================================
# END-OF-FILE SUMMARY -- utils/llm_wrapper.py
# ============================================================================
# Key takeaways:
#
# 1. ``RateLimitedLLM`` is the **resilient LLM client** that every agent uses.
#    It abstracts away provider/model/key failover behind a simple ``invoke()``
#    interface.
#
# 2. The failover strategy is a **three-level nested loop**: providers -> keys
#    -> models.  Specific error types (429, 403, 404) trigger the appropriate
#    level of failover.
#
# 3. ``AGENT_TASK_CONFIG`` maps each agent type to its preferred provider and
#    model.  This is the **primary configuration** for the multi-provider
#    strategy.  Different agents use different providers based on their needs
#    (speed vs. reasoning quality vs. cost).
#
# 4. ``invoke_with_fallback()`` is the **preferred entry point** for agent
#    code.  It catches all LLM errors and returns a deterministic fallback
#    response instead of raising.
#
# 5. ``FALLBACK_RESPONSES`` provides generic, safe responses when the LLM is
#    completely unavailable.  They contain no personalised numbers.
#
# 6. The ``create_llm()`` factory function resolves the provider, model, and
#    capability from multiple sources (explicit args, task config, settings,
#    model catalog) with a clear priority order.
#
# 7. Security: API keys are redacted from all error messages and logs via
#    ``_redact_message()``.
# ============================================================================
