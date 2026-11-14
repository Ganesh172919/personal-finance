"""
llm_cache.py - LLM response cache with in-flight request coalescing
===================================================================

Free-tier LLM capacity is the scarcest resource in the stack, so identical
prompts must never pay twice.  This module sits in front of
``RateLimitedLLM`` and provides:

* **Deterministic-prompt cache** - keyed on
  ``sha256(scope | model class | prompt-template version | temperature | rendered messages)``.
  Only low-temperature calls (``<= LLM_CACHE_MAX_TEMPERATURE``, default 0.2) are
  cached; creative/high-temperature calls always go upstream.
* **Tenant scoping** - the cache scope (org id) is part of the key via a
  ``ContextVar`` set by the API layer, so an org can never read another org's
  entry even in the (impossible) event of a hash collision on prompt text.
* **Redis with local LRU fallback** - Redis is shared across workers/replicas;
  every Redis failure degrades silently to the in-process LRU and trips a short
  circuit so a dead Redis never adds latency.
* **Coalescing** - concurrent identical misses share one upstream call; the
  followers wait for the leader and reuse its result.

Cached values are plain JSON (content + metadata), never pickled objects.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
from collections import OrderedDict
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Callable, Dict, Iterable, Optional

from utils.prometheus_metrics import LLM_CACHE_TOTAL

logger = logging.getLogger(__name__)

_scope_ctx: ContextVar[str] = ContextVar("llm_cache_scope", default="anon")


# Binds tenant organization scope for cache partitioning in current context.
# Sets thread-local ContextVar to supplied org ID or defaults to anon.
# Guarantees complete cross-tenant isolation of cached prompt completions.
def set_cache_scope(org_id: Optional[str]) -> None:
    """Bind the cache scope (org id) for the current request context."""
    _scope_ctx.set((org_id or "").strip() or "anon")


# Context manager binding tenant cache scope for duration of a block.
# Automatically sets thread-scoped ContextVar on enter and resets on exit.
# Yields execution control allowing scoped downstream LLM invocations.
@contextmanager
def cache_scope(org_id: Optional[str]):
    token = _scope_ctx.set((org_id or "").strip() or "anon")
    try:
        yield
    finally:
        _scope_ctx.reset(token)


# Retrieves currently active tenant organization scope from ContextVar.
# Reads active string identifier used for prefixing cache keys.
# Returns string representing current tenant scope or anon fallback.
def get_cache_scope() -> str:
    return _scope_ctx.get()


# Parses string representation into boolean evaluating standard true values.
# Inspects lowercase string against set of common truthy identifiers.
# Returns boolean value with fallback to default if input is empty.
def _truthy(value: Optional[str], default: bool) -> bool:
    if value is None or not value.strip():
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


# Parses floating point number from environment variable safely.
# Returns specified fallback default float if parsing raises ValueError.
# Used for resolving timing, TTL, and temperature configuration thresholds.
def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, "") or default)
    except ValueError:
        return default


# Parses integer number from environment variable with safe error handling.
# Handles float-string representations and returns default on failure.
# Returns integer configuration value for cache capacity and thresholds.
def _env_int(name: str, default: int) -> int:
    try:
        return int(float(os.getenv(name, "") or default))
    except ValueError:
        return default


# Synchronization object coordinating concurrent in-flight upstream calls.
# Holds threading Event, shared response payload, and failure flag.
# Enables follower threads to await leader completion during coalescing.
class _Inflight:
    __slots__ = ("event", "payload", "failed")

    # Initializes in-flight synchronization container with new Event.
    # Prepares empty payload reference and initializes failed boolean to false.
    # Configures coordination state before registering in inflight registry.
    def __init__(self) -> None:
        self.event = threading.Event()
        self.payload: Optional[Dict[str, Any]] = None
        self.failed = False


# Multi-tiered response cache with in-flight request deduplication.
# Combines local LRU cache and optional Redis with silent fallback.
# Prevents duplicate upstream model calls for deterministic prompts.
class LLMCache:
    # Initializes LLMCache instance with capacity limits and TTL durations.
    # Configures local LRU order dictionary and optional Redis connection.
    # Sets up internal thread synchronization lock and performance counters.
    def __init__(
        self,
        *,
        max_entries: Optional[int] = None,
        ttl_seconds: Optional[float] = None,
        redis_url: Optional[str] = None,
        coalesce_wait_seconds: Optional[float] = None,
    ) -> None:
        self.max_entries = max_entries or _env_int("LLM_CACHE_MAX_ENTRIES", 512)
        self.ttl_seconds = ttl_seconds or _env_float("LLM_CACHE_TTL_SECONDS", 900.0)
        self.coalesce_wait_seconds = (
            coalesce_wait_seconds
            if coalesce_wait_seconds is not None
            else _env_float("LLM_CACHE_COALESCE_WAIT_SECONDS", 45.0)
        )
        self._lru: "OrderedDict[str, tuple[float, str]]" = OrderedDict()
        self._lock = threading.Lock()
        self._inflight: Dict[str, _Inflight] = {}
        self._redis_url = redis_url if redis_url is not None else (
            os.getenv("LLM_CACHE_REDIS_URL") or os.getenv("REDIS_URL") or ""
        )
        self._redis: Any = None
        self._redis_down_until = 0.0
        self.hits = 0
        self.misses = 0
        self.coalesced = 0

    # -- policy ---------------------------------------------------------------
    # Evaluates whether the LLM caching subsystem is globally activated.
    # Reads the configured environment variable flag with default fallback.
    # Returns boolean indicating if caching operations should be performed.
    @staticmethod
    def enabled() -> bool:
        return _truthy(os.getenv("LLM_CACHE_ENABLED"), True)

    # Assesses if a model request is eligible for caching based on temperature.
    # Compares candidate temperature against the configured maximum threshold.
    # Returns true only for low-temperature or deterministic model calls.
    @staticmethod
    def cacheable(temperature: float) -> bool:
        return float(temperature) <= _env_float("LLM_CACHE_MAX_TEMPERATURE", 0.2)

    # -- keying ---------------------------------------------------------------
    # Computes deterministic SHA256 cache key from model request parameters.
    # Serializes cache scope, model class, template version, and message contents.
    # Produces consistent namespaced hex string identifier for lookup.
    @staticmethod
    def make_key(
        *,
        model_class: str,
        template_version: str,
        messages: Iterable[Any],
        temperature: float,
        scope: Optional[str] = None,
    ) -> str:
        rendered = [
            [type(m).__name__, m.content if isinstance(getattr(m, "content", None), str) else json.dumps(getattr(m, "content", ""), sort_keys=True, default=str)]
            for m in messages
        ]
        material = json.dumps(
            [scope or get_cache_scope(), model_class, template_version, round(float(temperature), 3), rendered],
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return "llm:v1:" + hashlib.sha256(material.encode("utf-8")).hexdigest()

    # -- redis (optional) -----------------------------------------------------
    # Retrieves an active Redis client connection with circuit breaking check.
    # Instantiates client lazily using configured Redis URL and socket timeouts.
    # Returns client instance or none if down or not configured.
    def _get_redis(self) -> Any:
        if not self._redis_url or time.monotonic() < self._redis_down_until:
            return None
        if self._redis is None:
            try:
                import redis  # type: ignore

                self._redis = redis.Redis.from_url(
                    self._redis_url, socket_timeout=0.25, socket_connect_timeout=0.25, decode_responses=True
                )
            except Exception as exc:  # redis not installed / bad URL
                self._trip_redis(exc)
                return None
        return self._redis

    # Activates temporary circuit breaker cooldown when Redis operations fail.
    # Sets future cooldown timestamp and clears existing client reference.
    # Logs warning telemetry event detailing Redis unavailability error.
    def _trip_redis(self, exc: Exception) -> None:
        self._redis = None
        self._redis_down_until = time.monotonic() + 30.0
        logger.warning("llm_cache_redis_unavailable", extra={"event": "llm_cache_redis_unavailable", "error": str(exc)[:200]})

    # -- storage --------------------------------------------------------------
    # Queries cached response payload by key across local and remote tiers.
    # Checks local LRU memory cache before falling back to Redis client.
    # Returns parsed JSON response dictionary or none on cache miss.
    def get(self, key: str) -> Optional[Dict[str, Any]]:
        now = time.monotonic()
        with self._lock:
            entry = self._lru.get(key)
            if entry is not None:
                expires, raw = entry
                if expires > now:
                    self._lru.move_to_end(key)
                    return json.loads(raw)
                del self._lru[key]
        client = self._get_redis()
        if client is not None:
            try:
                raw = client.get(key)
                if raw:
                    self._lru_put(key, raw)
                    return json.loads(raw)
            except Exception as exc:
                self._trip_redis(exc)
        return None

    # Inserts serialized response into local LRU cache with computed TTL.
    # Updates element position and evicts least recently used items on overflow.
    # Executes under thread synchronization lock for concurrency safety.
    def _lru_put(self, key: str, raw: str) -> None:
        with self._lock:
            self._lru[key] = (time.monotonic() + self.ttl_seconds, raw)
            self._lru.move_to_end(key)
            while len(self._lru) > self.max_entries:
                self._lru.popitem(last=False)

    # Stores response payload into both local memory and remote Redis caches.
    # Serializes payload to JSON and sets TTL expiration on remote entry.
    # Gracefully trips Redis circuit breaker if remote write encounters error.
    def set(self, key: str, payload: Dict[str, Any]) -> None:
        raw = json.dumps(payload, ensure_ascii=False, default=str)
        self._lru_put(key, raw)
        client = self._get_redis()
        if client is not None:
            try:
                client.set(key, raw, ex=max(1, int(self.ttl_seconds)))
            except Exception as exc:
                self._trip_redis(exc)

    # Flushes all entries from local LRU cache and active in-flight tracking.
    # Acquires internal thread synchronization lock to reset cache state.
    # Clears memory structures without modifying external Redis storage.
    def clear(self) -> None:
        with self._lock:
            self._lru.clear()
            self._inflight.clear()

    # -- coalescing -----------------------------------------------------------
    # Coordinates cached lookup with single-flight request deduplication.
    # Returns cached result on hit or coalesces concurrent requests to compute leader.
    # Updates performance metrics and returns payload with outcome classification.
    def get_or_compute(
        self,
        key: str,
        compute: Callable[[], Dict[str, Any]],
    ) -> tuple[Dict[str, Any], str]:
        """Return ``(payload, outcome)`` where outcome is hit | miss | coalesced.

        ``compute`` runs at most once per key at a time.  If the leader fails,
        followers fall back to computing for themselves (never cache an error).
        """
        cached = self.get(key)
        if cached is not None:
            self.hits += 1
            LLM_CACHE_TOTAL.labels("hit").inc()
            return cached, "hit"

        with self._lock:
            flight = self._inflight.get(key)
            leader = flight is None
            if leader:
                flight = _Inflight()
                self._inflight[key] = flight

        if not leader:
            assert flight is not None
            if flight.event.wait(self.coalesce_wait_seconds) and not flight.failed and flight.payload is not None:
                self.coalesced += 1
                LLM_CACHE_TOTAL.labels("coalesced").inc()
                return flight.payload, "coalesced"
            # Leader failed or timed out: do our own call, uncached.
            self.misses += 1
            LLM_CACHE_TOTAL.labels("miss").inc()
            return compute(), "miss"

        assert flight is not None
        try:
            payload = compute()
            flight.payload = payload
            if payload.get("content"):  # never cache an empty completion
                self.set(key, payload)
            self.misses += 1
            LLM_CACHE_TOTAL.labels("miss").inc()
            return payload, "miss"
        except BaseException:
            flight.failed = True
            raise
        finally:
            flight.event.set()
            with self._lock:
                self._inflight.pop(key, None)

    # Gathers real-time performance statistics and operational state of cache.
    # Calculates hit rate and counts total entries, hits, misses, and coalescences.
    # Returns dictionary containing cache status and Redis availability.
    def stats(self) -> Dict[str, Any]:
        total = self.hits + self.misses + self.coalesced
        return {
            "enabled": self.enabled(),
            "entries": len(self._lru),
            "hits": self.hits,
            "misses": self.misses,
            "coalesced": self.coalesced,
            "hit_rate": round((self.hits + self.coalesced) / total, 4) if total else 0.0,
            "redis": bool(self._redis_url) and time.monotonic() >= self._redis_down_until,
        }


_cache: Optional[LLMCache] = None
_cache_lock = threading.Lock()


# Retrieves or initializes global singleton LLMCache instance.
# Implements thread-safe double-checked locking initialization pattern.
# Returns shared LLMCache instance for application-wide reuse.
def get_llm_cache() -> LLMCache:
    global _cache
    if _cache is None:
        with _cache_lock:
            if _cache is None:
                _cache = LLMCache()
    return _cache


# Overwrites or resets global LLMCache singleton instance reference.
# Thread-safely updates internal cache pointer for testing isolation.
# Cleans up active cache state between isolated test executions.
def reset_llm_cache(cache: Optional[LLMCache] = None) -> None:
    """Replace the singleton (tests)."""
    global _cache
    with _cache_lock:
        _cache = cache
