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

MINDMAP FLOW
------------
::

    RateLimitedLLM Resilient Client
    ├── 1. Provider & Model Configuration
    │   ├── AGENT_TASK_CONFIG (per-agent provider & capability preferences)
    │   ├── Provider Priority Chain (Gemini -> OpenRouter -> Groq -> OpenAI -> Local)
    │   └── Model Candidates Selection via model_catalog
    ├── 2. Key Management & Rotation
    │   ├── Multi-Key KeyPool Instances per Provider
    │   ├── Round-robin Key Selection
    │   └── Rate-limit / Quota-exhausted Key Cooldowns
    ├── 3. Health & Circuit Breaking
    │   ├── ModelHealthTracker Health Scores (0.0 - 1.0)
    │   ├── Circuit Breakers (Trip on consecutive 5xx / 429 errors)
    │   └── Exponential Backoff & Cooldown Expiration Check
    ├── 4. Execution & Failover Loop (invoke)
    │   ├── In-Memory Client Cache (provider:model:key)
    │   ├── Outbound Rate Limiting Verification
    │   ├── LLM Inference Call with Timeout
    │   ├── Token Usage & Latency Extraction
    │   └── Failure Retry across Models, Keys, and Providers
    └── 5. Deterministic Resilience (invoke_with_fallback)
        ├── All Providers Exhausted -> Catch AIProviderError
        ├── Return Pre-configured Domain Fallback Template
        └── Tag fallback_used = True for Observability

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |              Agent Invokes llm.invoke(messages)               |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |             Iterate Providers in Fallback Chain               |
    |         (e.g., Primary -> Secondary -> Tertiary)              |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |      Check Circuit Breaker & Health Score for Provider        |
    +-------------------------------+-------------------------------+
                                    |
                         [Is Provider Healthy?]
                                /          \
                              YES           NO
                              /              \
                             v                v
    +-------------------------------+   +-----------------------------+
    | Select Active API Key from    |   | Advance to Next Provider    |
    | KeyPool (least-recently used) |   +-----------------------------+
    +---------------+---------------+
                    |
                    v
    +---------------------------------------------------------------+
    |       Attempt Inference: client.invoke(messages, timeout)     |
    +-------------------------------+-------------------------------+
                    |
            [Call Succeeded?]
                /        \
              YES         NO (HTTP 429, 500, Timeout, Invalid Key)
              /            \
             v              v
    +----------------+   +------------------------------------------+
    | Record Metrics |   | Trip Circuit / Mark Key in Cooldown      |
    | & Return Resp  |   | Redact Secret Keys from Error String     |
    +----------------+   | Try Next Model or Next Provider in Chain |
                         +--------------------+---------------------+
                                              |
                                  [All Providers Failed?]
                                         /       \
                                       YES        NO -> Loop to Next
                                       /
                                      v
                         +------------------------------------------+
                         | Return Deterministic Fallback Template   |
                         | (Zero Service Outage to User)            |
                         +------------------------------------------+

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
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from config import settings
from utils.key_pool import KeyPool, get_key_pool
from utils.llm_cache import get_llm_cache
from utils.model_catalog import (
    CostTier,
    ModelCapability,
    ModelEntry,
    get_best_model_for_task,
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
from utils.request_metrics import get_request_id, record_llm_cache_hit, record_llm_call, record_llm_usage

logger = logging.getLogger(__name__)
_LAST_ROUTE_SNAPSHOT: Dict[str, Any] = {}

# ---------------------------------------------------------------------------
# Mock LLM mode (CI / load tests)
# ---------------------------------------------------------------------------
# ``LLM_PROVIDER=mock`` short-circuits every LLM call with a canned, digit-free
# AIMessage: no network, no API keys, no rate limiting, no cache. The optional
# ``LLM_MOCK_LATENCY_MS`` adds a fixed sleep so load tests can model LLM
# latency. The number-safety guard still runs on the output (it has no digits).
MOCK_PROVIDER_NAME = "mock"
MOCK_RESPONSE_TEXT = (
    "This is a deterministic mock LLM response used for automated testing. "
    "It contains no figures and makes no financial claims."
)


# Checks whether mock LLM mode is enabled via environment configuration.
# Inspects LLM_PROVIDER variable dynamically on each invocation.
# Returns true if execution should bypass external network providers.
def mock_llm_enabled() -> bool:
    """True when ``LLM_PROVIDER=mock`` (read per call so tests can toggle it)."""
    return os.getenv("LLM_PROVIDER", "").strip().lower() == MOCK_PROVIDER_NAME


# Generates a deterministic canned AIMessage for automated test runs.
# Simulates optional latency delay specified via environment configuration.
# Sets route snapshot and returns digit-free response payload.
def _mock_llm_response() -> AIMessage:
    try:
        delay_ms = max(0.0, min(float(os.getenv("LLM_MOCK_LATENCY_MS", "0") or 0), 30000.0))
    except ValueError:
        delay_ms = 0.0
    if delay_ms:
        time.sleep(delay_ms / 1000.0)
    _set_route_snapshot(
        {
            "preferred_provider": MOCK_PROVIDER_NAME,
            "active_provider": MOCK_PROVIDER_NAME,
            "active_model": "mock-llm",
            "fallback_path": [],
            "recovered_failures": [],
            "mock": True,
        }
    )
    return AIMessage(
        content=MOCK_RESPONSE_TEXT,
        response_metadata={"provider": MOCK_PROVIDER_NAME, "mock": True},
    )


# Captures LLM invocation telemetry for self-improvement and learning loops.
# Forwards execution latency and model metadata to registry context.
# Swallows all exceptions to prevent learning hooks from failing LLM calls.
def _learning_record_llm_call(task_class: str, provider: str, model: str, latency_ms: float, response: Any) -> None:
    """Self-improvement run capture hook; must never affect the LLM call."""
    try:
        from registry.context import record_llm_call

        record_llm_call(task_class=task_class, provider=provider, model=model, latency_ms=latency_ms, response=response)
    except Exception:  # pragma: no cover
        pass


# Logs fallback activation event into the self-improvement tracking context.
# Records deterministic template usage when upstream providers fail.
# Safely ignores exceptions to avoid blocking request fallback responses.
def _learning_record_fallback() -> None:
    try:
        from registry.context import record_fallback

        record_fallback()
    except Exception:  # pragma: no cover
        pass


# Atomically updates the global snapshot of the most recent route execution.
# Creates a fresh dictionary clone to ensure thread-safe immutable updates.
# Provides execution metadata consumed by operational status endpoints.
def _set_route_snapshot(snapshot: Dict[str, Any]) -> None:
    """Publish the last route atomically (rebind, never clear-then-update)."""
    global _LAST_ROUTE_SNAPSHOT
    _LAST_ROUTE_SNAPSHOT = dict(snapshot)


# Descriptor providing thread-local attribute storage with global read fallback.
# Isolates concurrent request routing attributes across worker threads.
# Prevents cross-request leakage while exposing telemetry to external readers.
class _PerThreadAttr:
    """Instance attribute whose value is private to the calling thread.

    ``RateLimitedLLM`` instances are shared by every request (agents are built
    once), so routing state written during a call (active provider/model, the
    fallback path, recovered failures) must not leak between concurrent
    requests.  Reads from a thread that has not written fall back to the most
    recent value written by any thread (used for status/telemetry endpoints).
    """

    # Stores the target attribute name and derives shared fallback key.
    # Invoked automatically upon class creation when descriptor is assigned.
    # Configures internal attribute names for thread-local and shared scopes.
    def __set_name__(self, owner: type, name: str) -> None:
        self._name = name
        self._shared = "_shared_" + name

    # Retrieves attribute value from calling thread storage or shared state.
    # Returns descriptor instance when accessed directly on owner class.
    # Falls back to most recent shared value if current thread has not set it.
    def __get__(self, obj: Any, objtype: Optional[type] = None) -> Any:
        if obj is None:
            return self
        local = obj._tls.__dict__
        if self._name in local:
            return local[self._name]
        return obj.__dict__.get(self._shared)

    # Assigns attribute value in thread-local storage and shared class mirror.
    # Updates thread-private dictionary to maintain per-request isolation.
    # Synchronizes shared attribute so external observers see latest state.
    def __set__(self, obj: Any, value: Any) -> None:
        obj._tls.__dict__[self._name] = value
        obj.__dict__[self._shared] = value


# Base exception class representing errors encountered during provider calls.
# Encapsulates HTTP status codes, model identifiers, and provider metadata.
# Enables intelligent failover decisions based on structured error details.
class AIProviderError(Exception):
    """Base exception for all LLM provider errors.

    Carries structured metadata (status_code, model, key_id, provider) so
    that the failover logic can make informed decisions about whether to
    retry with a different key, model, or provider.
    """

    # Initializes AIProviderError with message and structured error context.
    # Records HTTP status code, failing model name, key ID, and provider name.
    # Passes formatted error message to underlying Exception superclass.
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


# Exception raised when a provider returns HTTP 429 rate limit or quota exhausted.
# Signals exhaustion of current key limits or temporary rate cap saturation.
# Directs invocation loop to rotate API keys or switch to alternate providers.
class QuotaExceededError(AIProviderError):
    """HTTP 429 -- rate limit or quota exceeded.

    Triggers key rotation (try next API key) or provider failover.
    """
    pass


# Exception raised when provider returns HTTP 403 authorization failure.
# Indicates invalid credentials or restricted model access permissions.
# Directs failover workflow to mark key cooldown and try alternate keys.
class AccessDeniedError(AIProviderError):
    """HTTP 403 -- API key is invalid or access is denied.

    Triggers key rotation (try next API key) or provider failover.
    """
    pass


# Exception raised when provider returns HTTP 404 model not found error.
# Indicates that the requested model identifier is unavailable or deprecated.
# Directs retry loop to failover to subsequent model candidate within provider.
class ModelNotFoundError(AIProviderError):
    """HTTP 404 -- the requested model does not exist on this provider.

    Triggers model failover (try next model candidate within the same provider).
    """
    pass


# Ensures model identifier string includes standard provider prefix.
# Checks whether candidate model string already contains provider prefix.
# Formats and returns consistent provider/model name specification.
def _normalize_model_id(provider_name: str, model: str) -> str:
    """Ensure a model ID has the ``provider/model`` prefix format.

    LangChain model IDs are typically ``"provider/model-name"``.  This
    function adds the prefix if missing.
    """
    cleaned = str(model or "").strip()
    if cleaned.startswith(f"{provider_name}/"):
        return cleaned
    return f"{provider_name}/{cleaned}"


# Extracts base model name by stripping leading provider namespace prefix.
# Splits identifier on forward slash delimiter to isolate model identifier.
# Returns clean model name suitable for provider-specific API calls.
def _raw_model_name(model_id: str) -> str:
    """Extract the model name without the provider prefix.

    E.g. ``"gemini/gemini-2.5-flash"`` -> ``"gemini-2.5-flash"``.
    """
    return str(model_id or "").split("/", 1)[1] if "/" in str(model_id or "") else str(model_id or "")


# Cleanses text strings by stripping null bytes and collapsing whitespace.
# Removes invalid control characters that could corrupt downstream processors.
# Returns sanitized string with trimmed leading and trailing whitespace.
def _sanitize_text(value: Any) -> str:
    """Clean text by removing null bytes and normalising whitespace.

    LLM outputs sometimes contain null bytes or unusual whitespace that
    can cause issues downstream.  This function strips them.
    """
    text = str(value or "")
    text = text.replace("\x00", "")
    text = re.sub(r"[^\S\r\n\t]+", " ", text)
    return text.strip()


# Sanitizes text contents across an entire sequence of chat messages.
# Preserves LangChain message subclasses while cleaning underlying text.
# Returns new message list preventing mutation of original input objects.
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


# Resilient LLM client wrapper supporting multi-provider and model failover.
# Orchestrates key rotation, rate limiting, and circuit breaking across models.
# Ensures zero-downtime execution with fallback template responses.
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

    # Per-call routing state: isolated per thread (see ``_PerThreadAttr``).
    active_provider = _PerThreadAttr()
    active_model = _PerThreadAttr()
    active_key_id = _PerThreadAttr()
    _fallback_path = _PerThreadAttr()
    _recovered_failures = _PerThreadAttr()
    _last_latency_ms = _PerThreadAttr()
    _last_error = _PerThreadAttr()

    # Initializes RateLimitedLLM with model candidates, limits, and telemetry.
    # Configures per-provider key pools, health trackers, and thread-local state.
    # Sets default active provider and candidate fallback chains for routing.
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
        self._tls = threading.local()

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

    # Accesses currently active provider name from thread-local state.
    # Reflects the provider successfully used in latest or ongoing invocation.
    # Returns lowercase provider identifier string for external inspection.
    @property
    def provider_name(self) -> str:
        return self.active_provider

    # Looks up provider configuration specification from provider registry.
    # Maps provider name string to its registered ProviderConfig metadata.
    # Returns ProviderConfig instance or none if provider name is unknown.
    def _provider_config(self, provider_name: str):
        return PROVIDER_CONFIGS.get(provider_name)

    # Retrieves or lazily creates a KeyPool instance for a specific provider.
    # Caches KeyPool instances in dictionary to preserve rotation state across calls.
    # Returns KeyPool manager instance managing API keys for target provider.
    def _get_key_pool(self, provider_name: str) -> KeyPool:
        if provider_name not in self._key_pools:
            self._key_pools[provider_name] = get_key_pool(provider_name)
        return self._key_pools[provider_name]

    # Resolves an active, healthy API key for the requested provider.
    # Queries provider KeyPool or falls back to single configured environment key.
    # Returns tuple of api key string and optional key tracking identifier.
    def _get_api_key(self, provider_name: str) -> Tuple[str, Optional[str]]:
        provider_config = self._provider_config(provider_name)
        if not provider_config or not provider_config.has_endpoint:
            return "", None

        if self._api_key and provider_name == self.preferred_provider:
            return self._api_key, None

        pool = self._get_key_pool(provider_name)
        key_entry = pool.get_healthy_key()
        if key_entry:
            return key_entry.key, key_entry.key_id

        # Configured keys in cooldown must not be retried as an untracked
        # single environment key, which would bypass the rotation policy.
        if pool.get_all_keys():
            return "", None

        single_key = os.getenv(provider_config.env_key, "").strip()
        return single_key, None

    # Constructs default ModelEntry metadata for models missing from catalog.
    # Assigns fallback rank and associates configured task capability.
    # Returns synthetic ModelEntry configured for failover candidate evaluation.
    def _fallback_model_entry(self, provider_name: str, model_id: str, rank: int) -> ModelEntry:
        return ModelEntry(
            model_id=model_id,
            provider=provider_name,
            display_name=_raw_model_name(model_id),
            capabilities={self._task_capability or ModelCapability.ANALYSIS},
            fallback_rank=rank,
            enabled=True,
        )

    # Queries catalog for models supporting capability on specified provider.
    # Filters models according to maximum cost tier and provider boundaries.
    # Returns ordered list containing up to eight compatible ModelEntry candidates.
    def _catalog_candidates_for_provider(self, provider_name: str) -> List[ModelEntry]:
        capability = self._task_capability or ModelCapability.ANALYSIS
        candidates = get_models_for_task(
            capability,
            max_cost_tier=self._max_cost_tier,
            providers=[provider_name],
        )
        return list(candidates[:8])

    # Aggregates prioritized list of model candidates for provider failover.
    # Combines preferred models, defaults, and health-scored catalog entries.
    # Applies bandit ordering if enabled and returns bounded list of candidates.
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
            if entry.retired:
                continue
            if normalized not in seen_model_ids:
                ordered_entries.append(entry)
                seen_model_ids.add(normalized)

        catalog_entries = [entry for entry in self._catalog_candidates_for_provider(provider_name) if entry.model_id not in seen_model_ids]
        catalog_entries.sort(key=lambda entry: (-self._model_health.get_score(entry.model_id), entry.fallback_rank))
        catalog_entries = self._model_health.bandit_order(catalog_entries, self._task_class_name())  # no-op unless LLM_BANDIT_ENABLED
        ordered_entries.extend(catalog_entries)

        return ordered_entries[:8]

    # Instantiates or retrieves cached LangChain chat model client instance.
    # Keys client cache by provider name, model identifier, and API key hash.
    # Returns ready-to-use BaseChatModel client for inference execution.
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

    # Parses HTTP status code integer from raw upstream exception object.
    # Inspects exception attributes and scans error text for known status codes.
    # Returns numeric HTTP status code integer or none if undetectable.
    def _extract_status_code(self, error: Exception) -> Optional[int]:
        status = getattr(error, "status_code", None)
        if isinstance(status, int) and 400 <= status <= 599:
            return status
        message = str(error).lower()
        if "permission_denied" in message or " 403 " in message or "[403]" in message:
            return 403
        if "not found" in message or " 404 " in message or "[404]" in message:
            return 404
        if "resource_exhausted" in message or "too many requests" in message or " 429 " in message or "[429]" in message:
            return 429

        match = re.search(r"\b(401|402|403|404|429|500|502|503)\b", message)
        return int(match.group(1)) if match else None

    # Redacts sensitive API keys and authorization secrets from message strings.
    # Uses regular expressions to mask key patterns before persisting or logging.
    # Returns safe error or log text preventing credential leakage.
    def _redact_message(self, text: str) -> str:
        redacted = re.sub(r"sk-[A-Za-z0-9_-]{8,}", "sk-***REDACTED***", text)
        redacted = re.sub(r"(?i)(api[_-]?key['\"=: ]+)([A-Za-z0-9._-]+)", r"\1***REDACTED***", redacted)
        return redacted

    # Transforms generic upstream exceptions into specialized AIProviderError instances.
    # Categorizes errors by HTTP status code into quota, access, or not-found types.
    # Increments Prometheus error metrics and redacts credential strings.
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
            try:
                from utils.prometheus_metrics import LLM_PROVIDER_429_TOTAL

                LLM_PROVIDER_429_TOTAL.labels(str(provider_name)[:32]).inc()
            except Exception:  # pragma: no cover - metrics must never break failover
                pass
            error_cls = QuotaExceededError
        elif status_code in {401, 402, 403}:
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

    # Emits structured log output announcing an outbound model invocation attempt.
    # Includes request tracing identifier, provider name, target model, and timeout.
    # Provides operational observability into upstream request dispatching.
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

    # Calculates and records token consumption and monetary cost for LLM calls.
    # Extracts input, output, and total token counters from response metadata.
    # Multiplies token counts by catalog unit prices and reports to metrics.
    def _record_usage(self, model_id: str, response: Any) -> None:
        usage_metadata = getattr(response, "usage_metadata", None) or {}
        prompt_tokens = int(usage_metadata.get("input_tokens", usage_metadata.get("prompt_tokens", 0)) or 0)
        completion_tokens = int(usage_metadata.get("output_tokens", usage_metadata.get("completion_tokens", 0)) or 0)
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

    # Extracts string name representation of current configured task capability.
    # Handles enum instances and raw string values for capability identification.
    # Returns capability value string used for routing and bandit optimization.
    def _task_class_name(self) -> str:
        capability = self._task_capability
        return str(getattr(capability, "value", capability) or "")

    # Generates composite cache key fragment representing model execution context.
    # Concatenates preferred provider, model identifier, fallbacks, and max tokens.
    # Returns delimiter-separated string identifying model generation parameters.
    def _cache_model_class(self) -> str:
        return "|".join(
            [
                str(self.preferred_provider),
                str(self.preferred_model_id or ""),
                ",".join(self.provider_candidates),
                str(self.max_tokens),
            ]
        )

    # High-level invocation entry point coordinating response caching and coalescing.
    # Serves cached completions for deterministic prompts or executes model call.
    # Rebuilds AIMessage instances on cache hits without consuming provider quota.
    def invoke(self, messages: List[BaseMessage], fallback_response: Optional[str] = None,
               *, max_attempts: Optional[int] = None) -> Any:
        """Cache- and coalescing-aware entry point; see ``_invoke_uncached``.

        Low-temperature calls are served from ``LLMCache`` (Redis with local
        LRU fallback) and identical in-flight prompts share one upstream call.
        A hit costs no rate-limit token, no provider call and no tokens.
        """
        if max_attempts is not None and (type(max_attempts) is not int or max_attempts < 1):
            raise ValueError("max_attempts must be a positive integer")

        if mock_llm_enabled():
            return _mock_llm_response()

        cache = get_llm_cache()
        if not (cache.enabled() and cache.cacheable(self.temperature)):
            return self._invoke_uncached(messages, fallback_response, max_attempts=max_attempts)

        key = cache.make_key(
            model_class=self._cache_model_class(),
            template_version=os.getenv("LLM_PROMPT_TEMPLATE_VERSION", "v1"),
            messages=_sanitize_messages(messages),
            temperature=self.temperature,
        )
        box: Dict[str, Any] = {}

        def compute() -> Dict[str, Any]:
            response = self._invoke_uncached(messages, fallback_response, max_attempts=max_attempts)
            box["response"] = response
            return {
                "content": _sanitize_text(getattr(response, "content", "")),
                "provider": self.active_provider,
                "model": self.active_model,
            }

        payload, outcome = cache.get_or_compute(key, compute)
        if outcome == "miss" and "response" in box:
            return box["response"]

        # Hit or coalesced: rebuild a response without touching any provider.
        record_llm_cache_hit()
        self.active_provider = payload.get("provider") or self.active_provider
        self.active_model = payload.get("model") or self.active_model
        self._fallback_path = []
        self._recovered_failures = []
        _set_route_snapshot({**self.get_route_metadata(), "cache_hit": True})
        return AIMessage(
            content=payload.get("content", ""),
            response_metadata={"provider": payload.get("provider"), "cache_hit": True, "cache_outcome": outcome},
        )

    # Dispatches LLM invocation with multi-tier provider, key, and model failover.
    # Iterates across candidate providers, rotating keys and models on failure.
    # Enforces rate limiting, retries transient faults, and tracks health scores.
    @with_rate_limit_and_retry
    def _invoke_uncached(self, messages: List[BaseMessage], fallback_response: Optional[str] = None,
                         *, max_attempts: Optional[int] = None) -> Any:
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
        ``max_attempts`` opts into a per-call cap across keys, models, and
        providers. Bounded invocations do not restart through outer retries.

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
        if max_attempts is not None and (type(max_attempts) is not int or max_attempts < 1):
            raise ValueError("max_attempts must be a positive integer")

        sanitized_messages = _sanitize_messages(messages)
        self._fallback_path = []
        self._recovered_failures = []
        last_error: Optional[AIProviderError] = None
        attempts = 0  # Local to this invocation; never shared between requests.
        deadline = time.monotonic() + settings.LLM_INTERACTIVE_BUDGET_SECONDS if max_attempts is not None else None

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

                    remaining = deadline - time.monotonic() if deadline is not None else None
                    if max_attempts is not None and (attempts >= max_attempts or remaining <= 0):
                        # A terminal message prevents the outer transient-error
                        # retry decorator from restarting the failover budget.
                        raise AIProviderError("LLM attempt budget exhausted.")
                    attempts += 1
                    start_time = time.perf_counter()
                    self._call_count += 1
                    record_llm_call()
                    self._fallback_path.append(model_entry.model_id)
                    self._log_invoke_attempt(provider_name, model_entry.model_id, key_id)

                    try:
                        client = self._client_for_model(provider_name, model_entry.model_id, api_key)
                        timeout = settings.LLM_TIMEOUT_SECONDS
                        if remaining is not None:
                            timeout = min(timeout, remaining)
                        response = client.invoke(sanitized_messages, timeout=timeout)
                        if not _sanitize_text(getattr(response, "content", "")).strip():
                            raise AIProviderError("Provider returned an empty text response.")
                        latency_ms = (time.perf_counter() - start_time) * 1000.0
                        self._last_latency_ms = latency_ms
                        self.active_provider = provider_name
                        self.active_model = model_entry.model_id
                        self.active_key_id = key_id

                        if key_id:
                            pool.record_success(key_id, latency_ms)
                        self._model_health.record_success(model_entry.model_id, latency_ms)
                        self._record_usage(model_entry.model_id, response)
                        _learning_record_llm_call(self._task_class_name(), provider_name, model_entry.model_id, latency_ms, response)

                        response_text = _sanitize_text(getattr(response, "content", ""))

                        # Compute token usage for structured logging
                        usage_metadata = getattr(response, "usage_metadata", None) or {}
                        token_in = int(usage_metadata.get("input_tokens", usage_metadata.get("prompt_tokens", 0)) or 0)
                        token_out = int(usage_metadata.get("output_tokens", usage_metadata.get("completion_tokens", 0)) or 0)

                        # Compute cost for structured logging
                        model_entry_info = get_model_by_id(model_entry.model_id)
                        cost_usd = 0.0
                        if model_entry_info:
                            cost_usd = (
                                (token_in / 1000.0) * float(model_entry_info.cost_input_per_1k)
                                + (token_out / 1000.0) * float(model_entry_info.cost_output_per_1k)
                            )

                        logger.info(
                            "LLM response OK: provider=%s model=%s key=%s length=%d latency_ms=%.0f",
                            provider_name,
                            _raw_model_name(model_entry.model_id),
                            key_id or "default",
                            len(response_text),
                            latency_ms,
                        )

                        # Structured LLM call log
                        logger.info(
                            "llm_call_success",
                            extra={
                                "event": "llm_call",
                                "provider": provider_name,
                                "model": _raw_model_name(model_entry.model_id),
                                "key_id": key_id or "default",
                                "token_in": token_in,
                                "token_out": token_out,
                                "latency_ms": round(latency_ms, 2),
                                "cost_usd": round(cost_usd, 6),
                            },
                        )

                        # Record model-level telemetry
                        try:
                            from utils.agent_telemetry import record_model_usage
                            record_model_usage(
                                model_entry.model_id,
                                input_tokens=token_in,
                                output_tokens=token_out,
                                cost_usd=cost_usd,
                            )
                        except Exception:
                            pass
                        _set_route_snapshot(self.get_route_metadata())
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

                        # Structured LLM call error log
                        logger.warning(
                            "llm_call_failed",
                            extra={
                                "event": "llm_call_error",
                                "provider": provider_name,
                                "model": _raw_model_name(model_entry.model_id),
                                "key_id": key_id or "default",
                                "status_code": status_code,
                                "latency_ms": round(latency_ms, 2),
                                "error": self._redact_message(str(exc))[:300],
                            },
                        )

                        # Record model-level telemetry for error
                        try:
                            from utils.agent_telemetry import record_model_usage
                            record_model_usage(model_entry.model_id, error=True)
                        except Exception:
                            pass

                        # Log circuit breaker state change if model enters cooldown/open
                        new_health_status = self._model_health.get_status(model_entry.model_id)
                        if new_health_status in {ModelHealthStatus.COOLDOWN, ModelHealthStatus.CIRCUIT_OPEN}:
                            logger.warning(
                                "circuit_breaker_state_change",
                                extra={
                                    "event": "circuit_breaker",
                                    "model": _raw_model_name(model_entry.model_id),
                                    "provider": provider_name,
                                    "new_state": new_health_status.value if hasattr(new_health_status, "value") else str(new_health_status),
                                    "status_code": status_code,
                                },
                            )

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
                            logger.warning(
                                "fallback_event",
                                extra={
                                    "event": "fallback",
                                    "type": "model_failover",
                                    "provider": provider_name,
                                    "key_id": key_id or "default",
                                    "failed_model": _raw_model_name(model_entry.model_id),
                                    "fallback_model": _raw_model_name(model_candidates[model_index + 1].model_id),
                                    "reason": "model_not_found",
                                },
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
                            logger.warning(
                                "key_pool_rotation",
                                extra={
                                    "event": "key_pool_rotation",
                                    "provider": provider_name,
                                    "key_id": key_id or "default",
                                    "model": _raw_model_name(model_entry.model_id),
                                    "reason": "rate_limited",
                                    "latency_ms": round(latency_ms, 2),
                                },
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
                            logger.warning(
                                "key_pool_rotation",
                                extra={
                                    "event": "key_pool_rotation",
                                    "provider": provider_name,
                                    "key_id": key_id or "default",
                                    "model": _raw_model_name(model_entry.model_id),
                                    "reason": "access_denied",
                                },
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
                            logger.warning(
                                "fallback_event",
                                extra={
                                    "event": "fallback",
                                    "type": "provider_failover",
                                    "from_provider": provider_name,
                                    "to_provider": next_provider,
                                    "failed_model": _raw_model_name(model_entry.model_id),
                                    "reason": self._redact_message(str(provider_error))[:200],
                                },
                            )
                        break

                if not isinstance(last_error, (QuotaExceededError, AccessDeniedError)):
                    break

        if max_attempts is not None and last_error:
            raise AIProviderError("Bounded LLM invocation ended without a response.")
        if last_error:
            logger.error(
                "ALL %d LLM providers failed. Fallback path: %s. Last error: %s",
                len(self.provider_candidates),
                " -> ".join(self._fallback_path),
                last_error,
            )
            raise last_error

        raise AccessDeniedError("No configured LLM providers are available.", status_code=403)

    # Executes LLM invocation with safe deterministic fallback on any failure.
    # Returns pre-configured domain responses when upstream providers fail.
    # Yields tuple containing AIMessage and boolean flag indicating fallback usage.
    def invoke_with_fallback(self, messages: List[BaseMessage], fallback_response: str,
                             *, max_attempts: Optional[int] = None) -> Tuple[Any, bool]:
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
        if mock_llm_enabled():
            return _mock_llm_response(), False

        # Fast path: if no API keys are configured at all, skip LLM entirely.
        if not any(self._get_api_key(provider_name)[0] for provider_name in self.provider_candidates):
            logger.info("LLM disabled (no provider API keys configured). Returning deterministic fallback response.")
            _set_route_snapshot(
                {
                    "active_provider": "deterministic_fallback",
                    "active_model": "deterministic_fallback",
                    "fallback_path": [],
                    "recovered_failures": [],
                }
            )
            return self._create_fallback_response(fallback_response), True

        try:
            if max_attempts is not None:
                return self.invoke(messages, max_attempts=max_attempts), False
            return self.invoke(messages), False
        except (QuotaExceededError, AccessDeniedError, ModelNotFoundError, RateLimitError, AIProviderError) as exc:
            logger.warning("LLM fallback activated due to upstream error: %s", exc)
            _set_route_snapshot(self.get_route_metadata())
            return self._create_fallback_response(fallback_response), True
        except Exception as exc:
            logger.error("Unexpected LLM error, using fallback: %s", self._redact_message(str(exc)))
            _set_route_snapshot(self.get_route_metadata())
            return self._create_fallback_response(fallback_response), True

    # Constructs deterministic AIMessage instance tagged with fallback metadata.
    # Records fallback occurrence in registry learning context for telemetry.
    # Returns formatted AIMessage preventing user-facing exception exposure.
    def _create_fallback_response(self, content: str):
        _learning_record_fallback()
        return AIMessage(content=content, response_metadata={"provider": "deterministic_fallback"})

    # Compiles active routing snapshot containing provider and model details.
    # Details active API key, candidate chain, fallback path, and failure trace.
    # Returns dictionary of runtime routing metadata for diagnostics.
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

    # Collects comprehensive health, rate limiter, and key pool statistics.
    # Computes success rates, total invocations, and error counts across runs.
    # Returns nested dictionary containing operational observability metrics.
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
# Task configuration mapping agent roles to preferred providers and models.
# Defines optimal capabilities, cost tiers, and routing priorities per agent.
# Powers dynamic model resolution across specialized sub-agent workflows.
AGENT_TASK_CONFIG: Dict[str, Dict[str, Any]] = {
    "master": {
        "provider": "gemini",
        "model": "gemini/gemini-3.5-flash-lite",
        "capability": ModelCapability.ROUTING,
        "description": "Fast routing and orchestration",
    },
    "educator": {
        "provider": "openrouter",
        "model": PROVIDER_CONFIGS["openrouter"].default_model,
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
        "model": "gemini/gemini-3.5-flash-lite",
        "capability": ModelCapability.ANALYSIS,
        "description": "Budget and financial planning",
    },
    "advisor": {
        "provider": "openrouter",
        "model": PROVIDER_CONFIGS["openrouter"].default_model,
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
        "model": "gemini/gemini-3.5-flash-lite",
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

# Compact dictionary mapping agent identifiers to provider and model pairs.
# Extracted from AGENT_TASK_CONFIG for fast provider and model lookups.
# Used across routing and diagnostic layers for quick configuration queries.
AGENT_PROVIDER_MAP: Dict[str, Dict[str, str]] = {
    name: {"provider": config["provider"], "model": config["model"]} for name, config in AGENT_TASK_CONFIG.items()
}


# Factory function constructing configured RateLimitedLLM client for agents.
# Resolves provider, model candidate, and capability settings dynamically.
# Returns ready RateLimitedLLM instance configured with failover chains.
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
    2. ``LLM_PROVIDER`` / ``LLM_MODEL`` environment overrides
    3. ``AGENT_TASK_CONFIG`` (per-agent defaults)
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

    configured_provider = os.getenv("LLM_PROVIDER", "").strip().lower()
    if configured_provider not in PROVIDER_CONFIGS:
        configured_provider = None
    provider_name = provider or configured_provider or task_config.get("provider") or _resolve_provider_name()
    capability = task_capability or task_config.get("capability")
    # A global model belongs to the configured provider. Do not send its name
    # to a different provider selected explicitly by a caller.
    configured_model = os.getenv("LLM_MODEL", "").strip()
    provider_overridden = bool(provider or configured_provider)
    model_id = configured_model if configured_model and (not provider or provider == (configured_provider or _resolve_provider_name())) else None
    if not model_id and not provider_overridden:
        model_id = task_config.get("model")

    if capability and not model_id and not provider_overridden:
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
# Static repository of deterministic domain fallback response templates.
# Returns safe generic financial guidance without hallucinated numbers.
# Safeguards service availability when all external AI providers fail.
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


# Fetches deterministic fallback response string matching specified domain type.
# Queries fallback repository with default fallback to synthesis text.
# Returns pre-defined canned response ensuring reliable user experience.
def get_fallback_response(response_type: str) -> str:
    """Get a deterministic fallback response by type.

    Falls back to the ``synthesis`` response if the type is unknown.
    """
    return FALLBACK_RESPONSES.get(response_type, FALLBACK_RESPONSES["synthesis"])


# Retrieves copy of the most recent LLM routing execution metadata snapshot.
# Exposes active provider, model, latency, and status for telemetry endpoints.
# Returns immutable dictionary clone of the latest execution routing state.
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
