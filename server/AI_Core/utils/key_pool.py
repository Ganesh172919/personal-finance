"""
key_pool.py - Multi-Key API Key Pool with Health Tracking and Circuit Breaking
==============================================================================

This module implements ``KeyPool``, a **thread-safe pool of API keys** for a
single LLM provider.  It provides intelligent key rotation, per-key health
scoring, cooldown management, and circuit breaking.

Problem it solves
-----------------
LLM providers impose rate limits per API key.  When a key hits a 429 (rate
limit) or 403 (access denied), the system needs to **immediately switch** to
another key instead of waiting.  ``KeyPool`` manages this automatically.

Key features
------------
1. **Key discovery** -- automatically discovers keys from environment
   variables in three formats:
   - ``PROVIDER_API_KEY`` (single key)
   - ``PROVIDER_API_KEY_1``, ``PROVIDER_API_KEY_2``, ... (numbered)
   - ``PROVIDER_API_KEYS=key1,key2,key3`` (comma-separated array)

2. **Rotation strategies** -- three strategies for selecting the next key:
   - ``round_robin``     -- cycle through keys in order
   - ``least_used``      -- prefer keys with fewest total requests
   - ``health_weighted`` -- score by success rate, latency, and recency

3. **Health tracking** -- per-key metrics: success rate, average latency,
   error counts by type (429, 403, 404, 5xx), consecutive failures.

4. **Cooldown** -- after a 429, a key is cooled down for a configurable
   period (default 60s).  After 403, cooldown is 1 hour.

5. **Circuit breaker** -- after N consecutive failures (default 5), the key's
   circuit is "opened" and it is excluded for a recovery period (default 5
   min).  After recovery, one "half-open" test request is allowed.

Usage
-----
    from utils.key_pool import KeyPool, get_key_pool

    pool = get_key_pool("openrouter")
    key_entry = pool.get_healthy_key()
    # Use key_entry.key for API calls
    # On success: pool.record_success(key_entry.key_id)
    # On failure: pool.record_failure(key_entry.key_id, status_code=429)
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class KeyStatus(Enum):
    """Status of an API key in the pool.

    - ``HEALTHY``      -- success rate above threshold, no cooldown
    - ``DEGRADED``     -- success rate below threshold but still usable
    - ``COOLDOWN``     -- temporarily excluded after a rate-limit or error
    - ``CIRCUIT_OPEN`` -- excluded after consecutive failures (circuit breaker)
    - ``DISABLED``     -- manually disabled (not auto-selected)
    """

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    COOLDOWN = "cooldown"
    CIRCUIT_OPEN = "circuit_open"
    DISABLED = "disabled"


@dataclass
class KeyHealth:
    """Health metrics for a single API key.

    Tracks cumulative request counts, error breakdowns by HTTP status code,
    latency statistics, and circuit breaker state.  These metrics drive the
    key selection logic in ``KeyPool.get_healthy_key()``.
    """

    # --- Request counters ---
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0

    # --- Error code counters (categorised by HTTP status) ---
    errors_429: int = 0  # Rate limited -- triggers cooldown
    errors_403: int = 0  # Access denied / invalid key -- triggers long cooldown
    errors_404: int = 0  # Model not found -- no cooldown (model issue, not key)
    errors_5xx: int = 0  # Server errors -- short cooldown
    errors_other: int = 0

    # --- Timing metrics ---
    total_latency_ms: float = 0.0
    last_request_at: float = 0.0
    last_success_at: float = 0.0
    last_failure_at: float = 0.0

    # --- Circuit breaker state ---
    consecutive_failures: int = 0          # Resets on success
    circuit_opened_at: Optional[float] = None  # Timestamp when circuit opened
    cooldown_until: Optional[float] = None     # Timestamp when cooldown expires

    @property
    def success_rate(self) -> float:
        """Success rate as a percentage (0-100)."""
        if self.total_requests == 0:
            return 100.0
        return (self.successful_requests / self.total_requests) * 100

    @property
    def avg_latency_ms(self) -> float:
        """Average latency in milliseconds."""
        if self.successful_requests == 0:
            return 0.0
        return self.total_latency_ms / self.successful_requests

    @property
    def error_rate_429(self) -> float:
        """Rate limit error rate as percentage."""
        if self.total_requests == 0:
            return 0.0
        return (self.errors_429 / self.total_requests) * 100

    def to_dict(self) -> Dict[str, Any]:
        """Export health metrics as dictionary."""
        return {
            "total_requests": self.total_requests,
            "successful_requests": self.successful_requests,
            "failed_requests": self.failed_requests,
            "success_rate": round(self.success_rate, 2),
            "avg_latency_ms": round(self.avg_latency_ms, 2),
            "errors": {
                "429": self.errors_429,
                "403": self.errors_403,
                "404": self.errors_404,
                "5xx": self.errors_5xx,
                "other": self.errors_other,
            },
            "consecutive_failures": self.consecutive_failures,
            "last_success_at": self.last_success_at,
            "last_failure_at": self.last_failure_at,
            "cooldown_until": self.cooldown_until,
            "circuit_opened_at": self.circuit_opened_at,
        }


@dataclass
class KeyEntry:
    """A single API key entry in the pool."""

    key_id: str  # Unique identifier (e.g., "openrouter_1")
    key: str  # Actual API key value (sensitive)
    provider: str
    index: int  # 0-indexed position for round-robin
    enabled: bool = True
    health: KeyHealth = field(default_factory=KeyHealth)

    def get_status(self, config: "KeyPoolConfig") -> KeyStatus:
        """Determine current status based on health metrics."""
        if not self.enabled:
            return KeyStatus.DISABLED

        now = time.time()

        # Check cooldown
        if self.health.cooldown_until and now < self.health.cooldown_until:
            return KeyStatus.COOLDOWN

        # Check circuit breaker
        if self.health.circuit_opened_at:
            if now < self.health.circuit_opened_at + config.circuit_recovery_seconds:
                return KeyStatus.CIRCUIT_OPEN
            # Circuit half-open: allow one request to test

        # Check degraded (high error rate)
        if self.health.total_requests >= config.min_requests_for_health:
            if self.health.success_rate < config.degraded_threshold_percent:
                return KeyStatus.DEGRADED

        return KeyStatus.HEALTHY

    def to_safe_dict(self) -> Dict[str, Any]:
        """Export key entry without exposing the actual key."""
        fingerprint = hashlib.sha256(self.key.encode("utf-8")).hexdigest()[:12]
        return {
            "key_id": self.key_id,
            "provider": self.provider,
            "index": self.index,
            "enabled": self.enabled,
            "key_fingerprint": fingerprint,
        }


@dataclass
class KeyPoolConfig:
    """Configuration for key pool behavior.

    All values have sensible defaults but can be overridden per-pool.
    """

    # --- Rotation strategy ---
    # "round_robin"     -- cycle through keys in index order
    # "least_used"      -- prefer the key with fewest total requests
    # "health_weighted" -- composite score of success rate, latency, recency
    rotation_strategy: str = "round_robin"

    # --- Circuit breaker settings ---
    circuit_failure_threshold: int = 5      # Consecutive failures to open circuit
    circuit_recovery_seconds: float = 300.0  # 5 minutes before half-open test

    # --- Cooldown settings (per error type) ---
    cooldown_429_seconds: float = 60.0     # 1 minute after rate limit
    cooldown_403_seconds: float = 3600.0   # 1 hour for access denied (likely bad key)
    cooldown_5xx_seconds: float = 30.0     # 30 seconds for transient server errors

    # --- Health thresholds ---
    min_requests_for_health: int = 10       # Need at least N requests before judging
    degraded_threshold_percent: float = 70.0  # Below this success rate = degraded

    # --- Scoring weights (for health_weighted rotation) ---
    weight_success_rate: float = 0.4  # How much success rate matters
    weight_latency: float = 0.3       # How much latency matters
    weight_recency: float = 0.3       # How much time-since-last-use matters


class KeyPool:
    """Multi-key pool for a single provider with health tracking and rotation.

    Thread-safe implementation supporting concurrent access.  Each provider
    (e.g. "openrouter", "gemini") gets its own ``KeyPool`` instance.

    Lifecycle:
    1. ``initialize()`` discovers keys from environment variables.
    2. ``get_healthy_key()`` returns the next key to use.
    3. ``record_success()`` / ``record_failure()`` update health metrics.
    4. ``get_stats()`` returns a diagnostic snapshot.
    """

    def __init__(
        self,
        provider: str,
        config: Optional[KeyPoolConfig] = None,
    ):
        self.provider = provider
        self.config = config or KeyPoolConfig()
        self._keys: List[KeyEntry] = []
        self._lock = threading.RLock()  # Reentrant lock for thread safety
        self._round_robin_index = 0
        self._initialized = False

    def _discover_keys(self) -> List[Tuple[str, str]]:
        """Discover API keys from environment variables.

        Supports three formats (checked in order):
        1. ``PROVIDER_API_KEYS=key1,key2,key3`` or JSON array
        2. ``PROVIDER_API_KEY_1``, ``PROVIDER_API_KEY_2``, ... (numbered, up to 20)
        3. ``PROVIDER_API_KEY`` (single key fallback)

        Deduplication ensures the same key value is not added twice even if
        it appears in multiple formats.

        Returns
        -------
        list[tuple[str, str]]
            List of ``(key_id, key_value)`` tuples.
        """
        provider_upper = self.provider.upper()
        discovered: List[Tuple[str, str]] = []

        # Map provider names to their environment variable prefixes.
        env_prefixes = {
            "openrouter": "OPENROUTER_API_KEY",
            "gemini": "GEMINI_API_KEY",
            "groq": "GROQ_API_KEY",
            "grok": "XAI_API_KEY",
            "together": "TOGETHER_API_KEY",
            "mistral": "MISTRAL_API_KEY",
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "cohere": "COHERE_API_KEY",
            "deepseek": "DEEPSEEK_API_KEY",
        }

        prefix = env_prefixes.get(self.provider.lower(), f"{provider_upper}_API_KEY")

        # 1. Check for array format:
        #    - PROVIDER_API_KEYS=key1,key2,key3
        #    - PROVIDER_API_KEYS=["key1","key2","key3"]
        array_key = os.getenv(f"{prefix}S", "").strip()
        if array_key:
            keys: List[str]
            if array_key.startswith("["):
                try:
                    parsed = json.loads(array_key)
                    keys = [str(item).strip() for item in parsed if str(item).strip()]
                except json.JSONDecodeError:
                    keys = [k.strip() for k in array_key.split(",") if k.strip()]
            else:
                keys = [k.strip() for k in array_key.split(",") if k.strip()]

            for i, key in enumerate(keys):
                discovered.append((f"{self.provider}_{i + 1}", key))

        # 2. Check for numbered keys: PROVIDER_API_KEY_1, PROVIDER_API_KEY_2, etc.
        for i in range(1, 21):  # Support up to 20 keys per provider
            env_var = f"{prefix}_{i}"
            key_value = os.getenv(env_var, "").strip()
            if key_value:
                key_id = f"{self.provider}_{i}"
                # Avoid duplicates from array format
                if not any(k == key_value for _, k in discovered):
                    discovered.append((key_id, key_value))

        # 3. Fall back to single key: PROVIDER_API_KEY
        single_key = os.getenv(prefix, "").strip()
        if single_key and not any(k == single_key for _, k in discovered):
            discovered.append((f"{self.provider}_0", single_key))

        return discovered

    def initialize(self) -> int:
        """
        Initialize the key pool by discovering keys from environment.

        Returns the number of keys discovered.
        """
        with self._lock:
            if self._initialized:
                return len(self._keys)

            discovered = self._discover_keys()
            self._keys = []

            for i, (key_id, key_value) in enumerate(discovered):
                entry = KeyEntry(
                    key_id=key_id,
                    key=key_value,
                    provider=self.provider,
                    index=i,
                    enabled=True,
                )
                self._keys.append(entry)

            self._initialized = True

            if self._keys:
                logger.info(
                    "KeyPool initialized: provider=%s keys=%d",
                    self.provider,
                    len(self._keys),
                )
            else:
                logger.warning(
                    "KeyPool initialized with no keys: provider=%s",
                    self.provider,
                )

            return len(self._keys)

    def get_healthy_key(self) -> Optional[KeyEntry]:
        """Get the next healthy key based on the configured rotation strategy.

        Selection logic:
        1. Filter keys to those with ``HEALTHY`` or ``DEGRADED`` status.
        2. If no healthy keys remain, check for keys whose circuit breaker
           has expired (half-open state) and allow one test request.
        3. If still no keys, return ``None``.
        4. Otherwise, apply the configured rotation strategy.

        Returns
        -------
        KeyEntry or None
            The selected key entry, or None if all keys are unavailable.
        """
        with self._lock:
            if not self._initialized:
                self.initialize()

            if not self._keys:
                return None

            # Filter to keys that are healthy or degraded (still usable).
            healthy_keys = [
                k for k in self._keys if k.get_status(self.config) in (KeyStatus.HEALTHY, KeyStatus.DEGRADED)
            ]

            if not healthy_keys:
                # All keys are in cooldown or circuit-open.
                # Try to find one whose circuit breaker recovery period has
                # expired -- allow a "half-open" test request.
                now = time.time()
                for key in self._keys:
                    if key.health.circuit_opened_at:
                        recovery_time = key.health.circuit_opened_at + self.config.circuit_recovery_seconds
                        if now >= recovery_time:
                            return key  # Half-open test

                # No keys available at all.
                return None

            # Apply the configured rotation strategy.
            if self.config.rotation_strategy == "round_robin":
                return self._select_round_robin(healthy_keys)
            elif self.config.rotation_strategy == "least_used":
                return self._select_least_used(healthy_keys)
            elif self.config.rotation_strategy == "health_weighted":
                return self._select_health_weighted(healthy_keys)
            else:
                return self._select_round_robin(healthy_keys)

    def _select_round_robin(self, keys: List[KeyEntry]) -> KeyEntry:
        """Select the next key using round-robin (simplest strategy).

        Cycles through keys by their index, wrapping around when the end is
        reached.  Ensures even distribution of requests across keys.
        """
        if not keys:
            return None

        indices = sorted([k.index for k in keys])

        # Find the next index >= current round-robin position.
        for idx in indices:
            if idx >= self._round_robin_index:
                self._round_robin_index = idx + 1
                return next(k for k in keys if k.index == idx)

        # Wrap around to the first key.
        self._round_robin_index = indices[0] + 1
        return next(k for k in keys if k.index == indices[0])

    def _select_least_used(self, keys: List[KeyEntry]) -> KeyEntry:
        """Select the key with the fewest total requests.

        Simple load-balancing strategy that ensures no single key is
        disproportionately used.
        """
        return min(keys, key=lambda k: k.health.total_requests)

    def _select_health_weighted(self, keys: List[KeyEntry]) -> KeyEntry:
        """Select the key with the highest weighted health score.

        The score is a weighted combination of:
        - **Success rate** (0-1) -- higher is better
        - **Latency score** (0-1) -- lower latency is better (inverse)
        - **Recency score** (0-1) -- prefer keys not used recently

        Weights are configurable via ``KeyPoolConfig``.
        """
        now = time.time()

        def score(k: KeyEntry) -> float:
            h = k.health
            # Success rate score (0-1)
            sr = h.success_rate / 100.0

            # Latency score: inverse normalisation.  1s latency = 0.5 score.
            avg_lat = h.avg_latency_ms
            lat_score = 1.0 / (1.0 + avg_lat / 1000.0)

            # Recency score: prefer keys not used recently (full score after 1 min).
            time_since = now - h.last_request_at if h.last_request_at else 3600.0
            rec_score = min(1.0, time_since / 60.0)

            return (
                self.config.weight_success_rate * sr
                + self.config.weight_latency * lat_score
                + self.config.weight_recency * rec_score
            )

        return max(keys, key=score)

    def record_success(
        self,
        key_id: str,
        latency_ms: float = 0.0,
    ) -> None:
        """Record a successful request for a key.

        Updates health metrics, resets consecutive failures, and clears the
        circuit breaker if it was open (the key has recovered).
        """
        with self._lock:
            key = self._find_key(key_id)
            if not key:
                return

            now = time.time()
            key.health.total_requests += 1
            key.health.successful_requests += 1
            key.health.total_latency_ms += latency_ms
            key.health.last_request_at = now
            key.health.last_success_at = now
            # Reset consecutive failures on success.
            key.health.consecutive_failures = 0

            # Clear circuit breaker on success -- the key has recovered.
            if key.health.circuit_opened_at:
                logger.info(
                    "Circuit closed for key %s after successful request",
                    key_id,
                )
                key.health.circuit_opened_at = None

    def record_failure(
        self,
        key_id: str,
        status_code: Optional[int] = None,
        error_message: Optional[str] = None,
    ) -> None:
        """Record a failed request for a key.

        Categorises the error by HTTP status code and applies the appropriate
        cooldown period.  If consecutive failures exceed the threshold, the
        circuit breaker is opened.
        """
        with self._lock:
            key = self._find_key(key_id)
            if not key:
                return

            now = time.time()
            key.health.total_requests += 1
            key.health.failed_requests += 1
            key.health.last_request_at = now
            key.health.last_failure_at = now
            key.health.consecutive_failures += 1

            # --- Categorise error and apply cooldown ---
            if status_code == 429:
                # Rate limited -- short cooldown, try other keys.
                key.health.errors_429 += 1
                key.health.cooldown_until = now + self.config.cooldown_429_seconds
                logger.warning(
                    "Key %s rate limited, cooling down for %.0fs",
                    key_id,
                    self.config.cooldown_429_seconds,
                )
            elif status_code == 403:
                # Access denied -- long cooldown (key may be revoked).
                key.health.errors_403 += 1
                key.health.cooldown_until = now + self.config.cooldown_403_seconds
                logger.warning(
                    "Key %s access denied, cooling down for %.0fs",
                    key_id,
                    self.config.cooldown_403_seconds,
                )
            elif status_code == 404:
                # Model not found -- no cooldown (it's a model issue, not key).
                key.health.errors_404 += 1
            elif status_code and 500 <= status_code < 600:
                # Server error -- short cooldown (transient).
                key.health.errors_5xx += 1
                key.health.cooldown_until = now + self.config.cooldown_5xx_seconds
            else:
                key.health.errors_other += 1

            # --- Circuit breaker check ---
            # If consecutive failures exceed the threshold, open the circuit
            # to stop sending requests to this key for a recovery period.
            if key.health.consecutive_failures >= self.config.circuit_failure_threshold:
                if not key.health.circuit_opened_at:
                    key.health.circuit_opened_at = now
                    logger.warning(
                        "Circuit opened for key %s after %d consecutive failures",
                        key_id,
                        key.health.consecutive_failures,
                    )

    def _find_key(self, key_id: str) -> Optional[KeyEntry]:
        """Find a key by ID."""
        for key in self._keys:
            if key.key_id == key_id:
                return key
        return None

    def get_all_keys(self) -> List[KeyEntry]:
        """Get all keys in the pool (for status/monitoring)."""
        with self._lock:
            if not self._initialized:
                self.initialize()
            return list(self._keys)

    def get_stats(self) -> Dict[str, Any]:
        """Get pool statistics."""
        with self._lock:
            if not self._initialized:
                self.initialize()

            keys = self._keys
            healthy = sum(1 for k in keys if k.get_status(self.config) == KeyStatus.HEALTHY)
            degraded = sum(1 for k in keys if k.get_status(self.config) == KeyStatus.DEGRADED)
            cooldown = sum(1 for k in keys if k.get_status(self.config) == KeyStatus.COOLDOWN)
            circuit_open = sum(1 for k in keys if k.get_status(self.config) == KeyStatus.CIRCUIT_OPEN)
            disabled = sum(1 for k in keys if k.get_status(self.config) == KeyStatus.DISABLED)

            total_requests = sum(k.health.total_requests for k in keys)
            total_success = sum(k.health.successful_requests for k in keys)

            return {
                "provider": self.provider,
                "total_keys": len(keys),
                "healthy_keys": healthy,
                "degraded_keys": degraded,
                "cooldown_keys": cooldown,
                "circuit_open_keys": circuit_open,
                "disabled_keys": disabled,
                "available_keys": healthy + degraded,
                "total_requests": total_requests,
                "total_success": total_success,
                "overall_success_rate": (
                    round(total_success / total_requests * 100, 2) if total_requests > 0 else 100.0
                ),
                "rotation_strategy": self.config.rotation_strategy,
                "keys": [
                    {
                        **k.to_safe_dict(),
                        "status": k.get_status(self.config).value,
                        "health": k.health.to_dict(),
                    }
                    for k in keys
                ],
            }

    def reset_all(self) -> None:
        """Reset all key health metrics (for testing)."""
        with self._lock:
            for key in self._keys:
                key.health = KeyHealth()
            self._round_robin_index = 0


# Global key pool registry
_key_pools: Dict[str, KeyPool] = {}
_pools_lock = threading.Lock()


def get_key_pool(provider: str, config: Optional[KeyPoolConfig] = None) -> KeyPool:
    """
    Get or create a key pool for a provider.

    Thread-safe singleton per provider.
    """
    with _pools_lock:
        if provider not in _key_pools:
            pool = KeyPool(provider, config)
            pool.initialize()
            _key_pools[provider] = pool
        return _key_pools[provider]


def get_all_key_pools() -> Dict[str, KeyPool]:
    """Get all initialized key pools."""
    with _pools_lock:
        return dict(_key_pools)


def reset_all_key_pools() -> None:
    """Reset all key pools (for testing)."""
    with _pools_lock:
        _key_pools.clear()


# ============================================================================
# END-OF-FILE SUMMARY -- utils/key_pool.py
# ============================================================================
# Key takeaways:
#
# 1. ``KeyPool`` manages **multiple API keys per provider** with automatic
#    rotation, health tracking, and circuit breaking.  It is the foundation
#    of the system's resilience to rate limits and key failures.
#
# 2. Keys are **discovered from environment variables** in three formats:
#    single key, numbered keys, and comma-separated arrays.  This makes it
#    easy to add keys without code changes.
#
# 3. Three **rotation strategies** are supported: round-robin (default),
#    least-used, and health-weighted.  The health-weighted strategy considers
#    success rate, latency, and recency.
#
# 4. The **circuit breaker** pattern prevents repeated requests to a failing
#    key.  After N consecutive failures, the key is excluded for a recovery
#    period.  After recovery, a single "half-open" test request is allowed.
#
# 5. **Cooldowns** are error-specific: 429 gets 60s, 403 gets 1 hour, 5xx
#    gets 30s.  404 does not trigger cooldown (it's a model issue, not a key
#    issue).
#
# 6. The module is **thread-safe** -- all public methods acquire a reentrant
#    lock before accessing shared state.
#
# 7. ``get_key_pool()`` is a **singleton factory** -- each provider gets one
#    ``KeyPool`` instance that is reused across the application.
# ============================================================================
