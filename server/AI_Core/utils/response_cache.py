r"""
response_cache.py - Intelligent Response Caching for Deterministic Agents
=========================================================================

Caches deterministic agent outputs (income analysis, budget plan, debt optimization)
by profile hash to avoid redundant computation.

Features:
- TTL-based invalidation (default 5 minutes)
- Manual cache bust on profile update
- LRU eviction when cache is full
- Thread-safe for concurrent FastAPI requests
- Cache hit/miss metrics for Prometheus

MINDMAP FLOW
------------
::

    ResponseCache System
    ├── 1. Profile Normalization & Hashing
    │   ├── Deterministic Extraction of Financial Profile Fields
    │   ├── Stable JSON Key Sorting
    │   └── SHA-256 Hash Digest Generation (hash_profile)
    ├── 2. Thread-Safe Key-Value Store
    │   ├── Key Format: "<agent_name>:<profile_hash>"
    │   ├── Storage Primitive: collections.OrderedDict
    │   ├── Thread Lock Mutex (_lock)
    │   └── Capacity Bound (max_size=256)
    ├── 3. Read Operations (get)
    │   ├── Key Presence Check
    │   ├── Expiration Verification (time.time() - timestamp > ttl)
    │   ├── Lazy Eviction on Expiration
    │   ├── LRU Order Bump (move_to_end)
    │   ├── Deepcopy Protection against Mutation
    │   └── Prometheus Hit/Miss Counter Recording
    ├── 4. Write Operations (set)
    │   ├── LRU Eviction of Oldest Item when Full (popitem(last=False))
    │   ├── Deepcopy Storage with Current Timestamp
    │   └── Thread-Safe Atomic Insertion
    └── 5. Invalidation & Maintenance
        ├── Pattern-based Invalidation (invalidate)
        ├── Full Flush (clear)
        └── Health & Cache Size Statistics (stats)

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |                  Agent Invocation Request                     |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |               hash_profile(user_profile)                      |
    |  - Extract income, expenses, debts, goals, savings            |
    |  - Sort keys & compute SHA-256 profile hash                   |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |         agent_cache.get("budget_planner:<hash>")              |
    +-------------------------------+-------------------------------+
                                    |
                         [Is Cache Key in Cache?]
                                /          \
                              YES           NO
                              /              \
                             v                v
                 [Has Entry Expired (TTL)?]   (Cache Miss: Compute Agent)
                    /              \                  |
                  YES               NO                |
                  /                  \                |
                 v                    v               |
           (Lazy Evict)         +-------------+       |
           (Cache Miss)         | Record Hit  |       |
                 \              | Return Copy |       |
                  \             +------+------+       |
                   \                   |              |
                    v                  |              |
           +-----------------+         |              |
           | Run Agent Logic |         |              |
           | to Generate Res |         |              |
           +--------+--------+         |              |
                    |                  |              |
                    v                  |              |
           +-----------------+         |              |
           | agent_cache.    |         |              |
           | set(key, result)|         |              |
           +--------+--------+         |              |
                    |                  |              |
                    v                  v              v
           +------------------------------------------+
           |       Deliver Final Agent Result         |
           +------------------------------------------+

Usage::

    from utils.response_cache import agent_cache

    # Try cache first
    cache_key = agent_cache.make_key("budget_planner", profile_hash)
    cached = agent_cache.get(cache_key)
    if cached:
        return cached

    # Compute and cache
    result = await compute_budget(profile)
    agent_cache.set(cache_key, result)
    return result
"""

import hashlib
import json
import os
import threading
import time
from collections import OrderedDict
from copy import deepcopy
from typing import Any, Dict, Optional

from utils.redis_optional import RedisOptional
from utils.request_metrics import record_cache_hit


# Thread-safe in-memory LRU response cache with time-to-live expiration.
# Caches deterministic agent responses keyed by financial profile hash.
# Evicts least recently used items on capacity overflow and purges expired entries.
class ResponseCache:
    """LRU cache with TTL for deterministic agent responses.

    Thread-safe implementation using a lock.
    """

    # Initializes ResponseCache instance with maximum capacity and TTL duration.
    # Sets up internal thread synchronization lock and OrderedDict storage.
    # Validates configuration parameters and initializes hit and miss counters.
    def __init__(self, max_size: int = 256, ttl_seconds: int = 300):
        """Initialize the cache.

        Parameters
        ----------
        max_size : int
            Maximum number of entries before LRU eviction.
        ttl_seconds : int
            Time-to-live in seconds for each entry (default 5 minutes).
        """
        if max_size < 1 or ttl_seconds < 0:
            raise ValueError("Cache size must be positive and TTL must be non-negative")
        self._cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self._lock = threading.Lock()
        self._max_size = max_size
        self._ttl_seconds = ttl_seconds
        self._hits = 0
        self._misses = 0

    # Generates formatted cache key string from agent name and profile hash.
    # Combines agent identifier prefix with deterministic profile digest.
    # Returns standardized colon-separated string key for cache operations.
    def make_key(self, agent_name: str, profile_hash: str) -> str:
        """Create a cache key from agent name and profile hash.

        Parameters
        ----------
        agent_name : str
            The agent type (e.g., "budget_planner").
        profile_hash : str
            Hash of the user profile data.

        Returns
        -------
        str
            Cache key in the format "agent_name:profile_hash".
        """
        return f"{agent_name}:{profile_hash}"

    # Computes deterministic truncated SHA-256 hash of financial profile data.
    # Serializes profile dictionary with sorted keys for consistent hashing.
    # Returns sixteen-character hex digest representing user profile state.
    def hash_profile(self, profile_data: Dict[str, Any]) -> str:
        """Create a deterministic hash of profile data.

        Parameters
        ----------
        profile_data : dict
            User profile data to hash.

        Returns
        -------
        str
            SHA-256 hex digest of the serialized profile.
        """
        # Sort keys for deterministic serialization
        serialized = json.dumps(profile_data, sort_keys=True, default=str)
        return hashlib.sha256(serialized.encode()).hexdigest()[:16]

    # Queries cached agent result by key, verifying entry expiration status.
    # Lazily purges expired items and updates LRU order and hit statistics.
    # Returns deep copy of cached value or none if missing or expired.
    def get(self, key: str) -> Optional[Any]:
        """Retrieve a cached value if it exists and hasn't expired.

        Parameters
        ----------
        key : str
            Cache key.

        Returns
        -------
        Any or None
            The cached value, or None if not found or expired.
        """
        with self._lock:
            if key not in self._cache:
                self._misses += 1
                return None

            entry = self._cache[key]
            if time.monotonic() >= entry["expires_at"]:
                # Expired — remove and return None
                del self._cache[key]
                self._misses += 1
                return None

            # Move to end (most recently used)
            self._cache.move_to_end(key)
            self._hits += 1
            record_cache_hit()
            return deepcopy(entry["value"])

    # Stores agent response value in cache with computed expiration timestamp.
    # Evicts oldest entry if cache capacity limit has been reached.
    # Deepcopies stored value under mutex lock to prevent external mutation.
    def set(self, key: str, value: Any) -> None:
        """Store a value in the cache.

        Parameters
        ----------
        key : str
            Cache key.
        value : Any
            Value to cache (must be JSON-serializable for safety).
        """
        with self._lock:
            # Remove if already exists (to update position)
            if key in self._cache:
                del self._cache[key]

            # Evict oldest if at capacity
            while len(self._cache) >= self._max_size:
                self._cache.popitem(last=False)

            self._cache[key] = {
                "value": deepcopy(value),
                "expires_at": time.monotonic() + self._ttl_seconds,
            }

    # Removes a specific cached entry by its exact string identifier key.
    # Thread-safely purges matching key from internal cache dictionary.
    # Returns boolean true if entry existed and was successfully deleted.
    def invalidate(self, key: str) -> bool:
        """Remove a specific entry from the cache.

        Parameters
        ----------
        key : str
            Cache key to invalidate.

        Returns
        -------
        bool
            True if the entry existed and was removed.
        """
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    # Invalidates all cached entries whose keys begin with specified prefix.
    # Finds matching keys and removes them from cache under mutex lock.
    # Returns count of cached entries invalidated and evicted.
    def invalidate_pattern(self, pattern: str) -> int:
        """Remove all entries whose key starts with the given pattern.

        Parameters
        ----------
        pattern : str
            Prefix to match (e.g., "budget_planner:" to invalidate all budget caches).

        Returns
        -------
        int
            Number of entries removed.
        """
        with self._lock:
            keys_to_remove = [k for k in self._cache if k.startswith(pattern)]
            for key in keys_to_remove:
                del self._cache[key]
            return len(keys_to_remove)

    # Flushes all cached entries from the in-memory response cache.
    # Acquires internal thread synchronization lock to reset storage.
    # Restores cache to empty state without modifying statistics counters.
    def clear(self) -> None:
        """Clear all cached entries."""
        with self._lock:
            self._cache.clear()

    # Compiles comprehensive performance statistics for response cache.
    # Computes hit rate, miss rate, total queries, and current entry count.
    # Returns structured dictionary of cache telemetry metrics.
    def get_stats(self) -> Dict[str, Any]:
        """Return cache statistics.

        Returns
        -------
        dict
            Cache size, hit rate, miss rate, total requests.
        """
        with self._lock:
            total = self._hits + self._misses
            return {
                "size": len(self._cache),
                "max_size": self._max_size,
                "ttl_seconds": self._ttl_seconds,
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": round(self._hits / total * 100, 2) if total > 0 else 0.0,
                "miss_rate": round(self._misses / total * 100, 2) if total > 0 else 0.0,
                "total_requests": total,
            }


# Multi-tiered response cache combining local LRU with remote Redis storage.
# Promotes remote Redis hits to local memory and writes JSON-safe values remotely.
# Namespaces remote keys by tenant scope and falls back safely on outages.
class RedisBackedResponseCache(ResponseCache):
    """``ResponseCache`` with an optional shared Redis tier (``REDIS_URL``).

    The local LRU is always the first tier and the source of truth when Redis
    is absent or failing.  Redis keys are namespaced by ``prefix`` and by the
    current tenant cache scope (``utils.llm_cache.get_cache_scope``) so one org
    can never read another org's entry.  Only values that survive a lossless
    JSON round trip are written to Redis; anything else stays local-only.
    """

    # Initializes Redis-backed response cache with prefix and Redis handle.
    # Delegates local LRU initialization to superclass with sizing parameters.
    # Sets up RedisOptional client wrapper configured with namespace prefix.
    def __init__(
        self,
        max_size: int = 256,
        ttl_seconds: int = 300,
        *,
        prefix: str = "agentcache",
        redis: Optional[RedisOptional] = None,
    ):
        super().__init__(max_size=max_size, ttl_seconds=ttl_seconds)
        self._prefix = prefix
        self._redis = redis if redis is not None else RedisOptional(label=prefix)

    # Formats fully-qualified namespaced Redis key incorporating tenant scope.
    # Prefixes key with cache label, version, tenant scope, and item key.
    # Returns tenant-isolated string key preventing cross-tenant data access.
    def _rkey(self, key: str) -> str:
        from utils.llm_cache import get_cache_scope

        return f"{self._prefix}:v1:{get_cache_scope()}:{key}"

    # Retrieves cached response across local memory and remote Redis tiers.
    # Falls back to Redis on local miss and promotes discovered values locally.
    # Returns deep copy of response payload or none if missing across tiers.
    def get(self, key: str) -> Optional[Any]:
        value = super().get(key)
        if value is not None:
            return value
        client = self._redis.client()
        if client is None:
            return None
        try:
            raw = client.get(self._rkey(key))
            if not raw:
                return None
            value = json.loads(raw)
        except Exception as exc:
            self._redis.trip(exc)
            return None
        # Promote into the local tier and reclassify the earlier local miss as a hit.
        super().set(key, value)
        with self._lock:
            self._misses = max(0, self._misses - 1)
            self._hits += 1
        record_cache_hit()
        return deepcopy(value)

    # Writes response payload into local LRU cache and remote Redis tier.
    # Verifies lossless JSON serializability before storing remote Redis entry.
    # Catches Redis operational exceptions and trips circuit breaker gracefully.
    def set(self, key: str, value: Any) -> None:
        super().set(key, value)
        client = self._redis.client()
        if client is None:
            return
        try:
            raw = json.dumps(value, ensure_ascii=False)
            if json.loads(raw) != value:  # tuples, non-str keys, NaN: keep local-only
                return
        except (TypeError, ValueError):
            return
        try:
            client.set(self._rkey(key), raw, ex=max(1, int(self._ttl_seconds)))
        except Exception as exc:
            self._redis.trip(exc)

    # Removes cached entry across both local LRU and remote Redis instances.
    # Deletes item from local cache before dispatching Redis deletion command.
    # Returns boolean true if item was removed from either cache tier.
    def invalidate(self, key: str) -> bool:
        removed = super().invalidate(key)
        client = self._redis.client()
        if client is not None:
            try:
                removed = bool(client.delete(self._rkey(key))) or removed
            except Exception as exc:
                self._redis.trip(exc)
        return removed

    # Deletes all entries matching key prefix across local and Redis tiers.
    # Executes local pattern eviction and cursor-based remote key scanning.
    # Returns total count of deleted entries across both cache tiers.
    def invalidate_pattern(self, pattern: str) -> int:
        count = super().invalidate_pattern(pattern)
        client = self._redis.client()
        if client is not None:
            try:
                keys = list(self._redis.scan_keys(client, self._rkey(pattern) + "*"))
                if keys:
                    client.delete(*keys)
                    count = max(count, len(keys))
            except Exception as exc:
                self._redis.trip(exc)
        return count

    # Clears all entries from local LRU cache and namespaced Redis storage.
    # Scans and deletes all remote keys matching namespace prefix pattern.
    # Gracefully trips Redis circuit breaker if remote clear encounters error.
    def clear(self) -> None:
        super().clear()
        client = self._redis.client()
        if client is not None:
            try:
                keys = list(self._redis.scan_keys(client, f"{self._prefix}:v1:*"))
                if keys:
                    client.delete(*keys)
            except Exception as exc:
                self._redis.trip(exc)

    # Retrieves performance metrics from superclass and appends Redis status.
    # Reports cache hit rate, size, and operational availability of Redis tier.
    # Returns dictionary containing combined local and remote cache diagnostics.
    def get_stats(self) -> Dict[str, Any]:
        stats = super().get_stats()
        stats["redis"] = self._redis.available
        return stats


# Factory function constructing response cache instance based on environment.
# Instantiates RedisBackedResponseCache if REDIS_URL is set, else local cache.
# Returns ready ResponseCache client configured with sizing parameters.
def make_response_cache(max_size: int = 256, ttl_seconds: int = 300, *, prefix: str = "agentcache") -> ResponseCache:
    """Return a Redis-backed cache when ``REDIS_URL`` is set, else the plain local one."""
    if (os.getenv("REDIS_URL") or "").strip():
        return RedisBackedResponseCache(max_size=max_size, ttl_seconds=ttl_seconds, prefix=prefix)
    return ResponseCache(max_size=max_size, ttl_seconds=ttl_seconds)


# Singleton instance
# TTL: 5 minutes, max 256 entries (Redis-shared when REDIS_URL is set)
# Global singleton response cache instance for deterministic AI agents.
# Configured with 5-minute TTL and 256 max entries with Redis backing.
# Shared across agents to cache deterministic calculation and analysis outputs.
agent_cache = make_response_cache(max_size=256, ttl_seconds=300, prefix="agentcache")
