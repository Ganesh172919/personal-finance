"""
Multi-Key Pool with Health Tracking, Rotation, and Circuit Breaker.

Supports multiple API keys per provider (e.g., OPENROUTER_API_KEY_1, OPENROUTER_API_KEY_2)
with intelligent rotation, per-key health scoring, cooldown management, and circuit breaking.

Usage:
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
    """Status of an API key in the pool."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    COOLDOWN = "cooldown"
    CIRCUIT_OPEN = "circuit_open"
    DISABLED = "disabled"


@dataclass
class KeyHealth:
    """Health metrics for a single API key."""

    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0

    # Error code counters
    errors_429: int = 0  # Rate limited
    errors_403: int = 0  # Access denied / invalid key
    errors_404: int = 0  # Model not found
    errors_5xx: int = 0  # Server errors
    errors_other: int = 0

    # Timing metrics
    total_latency_ms: float = 0.0
    last_request_at: float = 0.0
    last_success_at: float = 0.0
    last_failure_at: float = 0.0

    # Circuit breaker state
    consecutive_failures: int = 0
    circuit_opened_at: Optional[float] = None
    cooldown_until: Optional[float] = None

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
    """Configuration for key pool behavior."""

    # Rotation strategy
    rotation_strategy: str = "round_robin"  # round_robin, least_used, health_weighted

    # Circuit breaker settings
    circuit_failure_threshold: int = 5  # Consecutive failures to open circuit
    circuit_recovery_seconds: float = 300.0  # 5 minutes

    # Cooldown settings (for rate limits)
    cooldown_429_seconds: float = 60.0  # 1 minute cooldown after rate limit
    cooldown_403_seconds: float = 3600.0  # 1 hour cooldown for access denied
    cooldown_5xx_seconds: float = 30.0  # 30 second cooldown for server errors

    # Health thresholds
    min_requests_for_health: int = 10  # Min requests before judging health
    degraded_threshold_percent: float = 70.0  # Below this = degraded

    # Scoring weights for health-weighted rotation
    weight_success_rate: float = 0.4
    weight_latency: float = 0.3
    weight_recency: float = 0.3


class KeyPool:
    """
    Multi-key pool for a single provider with health tracking and rotation.

    Thread-safe implementation supporting concurrent access.
    """

    def __init__(
        self,
        provider: str,
        config: Optional[KeyPoolConfig] = None,
    ):
        self.provider = provider
        self.config = config or KeyPoolConfig()
        self._keys: List[KeyEntry] = []
        self._lock = threading.RLock()
        self._round_robin_index = 0
        self._initialized = False

    def _discover_keys(self) -> List[Tuple[str, str]]:
        """
        Discover API keys from environment variables.

        Supports formats:
        - PROVIDER_API_KEY (single key)
        - PROVIDER_API_KEY_1, PROVIDER_API_KEY_2, ... (numbered keys)
        - PROVIDER_API_KEYS (comma-separated array)

        Returns list of (key_id, key_value) tuples.
        """
        provider_upper = self.provider.upper()
        discovered: List[Tuple[str, str]] = []

        # Map provider names to env var prefixes
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
        """
        Get the next healthy key based on rotation strategy.

        Returns None if no healthy keys are available.
        """
        with self._lock:
            if not self._initialized:
                self.initialize()

            if not self._keys:
                return None

            healthy_keys = [
                k for k in self._keys if k.get_status(self.config) in (KeyStatus.HEALTHY, KeyStatus.DEGRADED)
            ]

            if not healthy_keys:
                # All keys are in cooldown/circuit open - try to find one in half-open
                now = time.time()
                for key in self._keys:
                    if key.health.circuit_opened_at:
                        recovery_time = key.health.circuit_opened_at + self.config.circuit_recovery_seconds
                        if now >= recovery_time:
                            # Allow half-open test
                            return key

                # No keys available at all
                return None

            if self.config.rotation_strategy == "round_robin":
                return self._select_round_robin(healthy_keys)
            elif self.config.rotation_strategy == "least_used":
                return self._select_least_used(healthy_keys)
            elif self.config.rotation_strategy == "health_weighted":
                return self._select_health_weighted(healthy_keys)
            else:
                return self._select_round_robin(healthy_keys)

    def _select_round_robin(self, keys: List[KeyEntry]) -> KeyEntry:
        """Select next key using round-robin."""
        if not keys:
            return None

        # Find the key with the next index
        indices = sorted([k.index for k in keys])

        # Find next index >= current round robin position
        for idx in indices:
            if idx >= self._round_robin_index:
                self._round_robin_index = idx + 1
                return next(k for k in keys if k.index == idx)

        # Wrap around
        self._round_robin_index = indices[0] + 1
        return next(k for k in keys if k.index == indices[0])

    def _select_least_used(self, keys: List[KeyEntry]) -> KeyEntry:
        """Select key with fewest total requests."""
        return min(keys, key=lambda k: k.health.total_requests)

    def _select_health_weighted(self, keys: List[KeyEntry]) -> KeyEntry:
        """Select key based on weighted health score."""
        now = time.time()

        def score(k: KeyEntry) -> float:
            h = k.health
            # Success rate score (0-1)
            sr = h.success_rate / 100.0

            # Latency score (inverse, normalized to 0-1)
            avg_lat = h.avg_latency_ms
            lat_score = 1.0 / (1.0 + avg_lat / 1000.0)  # 1s = 0.5 score

            # Recency score (prefer keys not used recently)
            time_since = now - h.last_request_at if h.last_request_at else 3600.0
            rec_score = min(1.0, time_since / 60.0)  # Full score after 1 min

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
        """Record a successful request for a key."""
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
            key.health.consecutive_failures = 0

            # Clear circuit breaker on success
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
        """Record a failed request for a key."""
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

            # Categorize error
            if status_code == 429:
                key.health.errors_429 += 1
                key.health.cooldown_until = now + self.config.cooldown_429_seconds
                logger.warning(
                    "Key %s rate limited, cooling down for %.0fs",
                    key_id,
                    self.config.cooldown_429_seconds,
                )
            elif status_code == 403:
                key.health.errors_403 += 1
                key.health.cooldown_until = now + self.config.cooldown_403_seconds
                logger.warning(
                    "Key %s access denied, cooling down for %.0fs",
                    key_id,
                    self.config.cooldown_403_seconds,
                )
            elif status_code == 404:
                key.health.errors_404 += 1
                # Don't cooldown for 404 - it's a model issue, not key issue
            elif status_code and 500 <= status_code < 600:
                key.health.errors_5xx += 1
                key.health.cooldown_until = now + self.config.cooldown_5xx_seconds
            else:
                key.health.errors_other += 1

            # Check circuit breaker
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
