"""
redis_optional.py - Optional Redis handle with a short-circuit breaker
======================================================================

Shared plumbing for caches that use Redis when ``REDIS_URL`` is set and
degrade silently to an in-process store otherwise (same policy as
``utils/llm_cache.py``):

* ``redis`` is imported lazily; a missing package or bad URL disables Redis.
* Every Redis failure trips a circuit for ``REDIS_CIRCUIT_SECONDS`` (default
  30s) during which callers skip Redis entirely, so a dead Redis never adds
  latency to a request.
* Socket timeouts are 250ms.

``client_factory`` lets tests inject a fake client without the ``redis``
package installed.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any, Callable, Iterator, Optional

logger = logging.getLogger(__name__)


# Parses floating-point value from environment variable with fallback value.
# Safely handles missing variables, empty strings, and value errors.
# Returns parsed float or designated default number.
def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, "") or default)
    except ValueError:
        return default


# Resilient Redis connection client equipped with circuit breaker protection.
# Gracefully degrades to local memory caches if Redis is unreachable or fails.
# Throttles repeated connection attempts during active outage cooldown periods.
class RedisOptional:
    """Lazily-created Redis client guarded by a circuit breaker."""

    # Initializes RedisOptional instance with connection URL and circuit policies.
    # Configures optional mock client factory, circuit breaker interval, and lock.
    # Establishes failure counter and sets initial operational readiness state.
    def __init__(
        self,
        url: Optional[str] = None,
        *,
        client_factory: Optional[Callable[[], Any]] = None,
        circuit_seconds: Optional[float] = None,
        label: str = "cache",
    ) -> None:
        self.url = url if url is not None else (os.getenv("REDIS_URL") or "")
        self._factory = client_factory
        self._client: Any = None
        self._down_until = 0.0
        self._lock = threading.Lock()
        self.circuit_seconds = circuit_seconds if circuit_seconds is not None else _env_float("REDIS_CIRCUIT_SECONDS", 30.0)
        self.label = label
        self.failures = 0

    # Evaluates whether a valid Redis URL or client factory has been supplied.
    # Checks presence of configured environment URL or testing client factory.
    # Returns true if Redis connection parameters are defined.
    @property
    def configured(self) -> bool:
        return bool(self.url) or self._factory is not None

    # Assesses whether Redis is currently configured and outside circuit cooldown.
    # Checks current monotonic timestamp against future cooldown expiration.
    # Returns boolean indicating if Redis client is safe to query.
    @property
    def available(self) -> bool:
        return self.configured and time.monotonic() >= self._down_until

    # Lazily initializes and returns active Redis client connection handle.
    # Returns none if unconfigured or circuit breaker is currently open.
    # Catches connection faults, trips circuit breaker, and logs warning event.
    def client(self) -> Any:
        """Return a client, or ``None`` when unconfigured / circuit open."""
        if not self.available:
            return None
        if self._client is None:
            with self._lock:
                if self._client is None:
                    try:
                        if self._factory is not None:
                            self._client = self._factory()
                        else:
                            import redis  # type: ignore

                            self._client = redis.Redis.from_url(
                                self.url, socket_timeout=0.25, socket_connect_timeout=0.25, decode_responses=True
                            )
                    except Exception as exc:  # redis not installed / bad URL
                        self.trip(exc)
                        return None
        return self._client

    # Trips circuit breaker cooldown upon detecting an operational Redis error.
    # Clears current client reference, increments failure count, and sets timer.
    # Emits structured warning log describing Redis unavailability event.
    def trip(self, exc: Exception) -> None:
        self._client = None
        self.failures += 1
        self._down_until = time.monotonic() + self.circuit_seconds
        logger.warning(
            "redis_optional_unavailable",
            extra={"event": "redis_optional_unavailable", "cache": self.label, "error": str(exc)[:200]},
        )

    # Iterates over Redis keys matching pattern using cursor-based scanning.
    # Decodes byte keys to UTF-8 strings for consistent string representation.
    # Yields matching string keys incrementally without blocking server thread.
    def scan_keys(self, client: Any, pattern: str, count: int = 200) -> Iterator[str]:
        for key in client.scan_iter(match=pattern, count=count):
            yield key.decode() if isinstance(key, bytes) else key
