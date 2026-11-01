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
import threading
import time
from collections import OrderedDict
from copy import deepcopy
from typing import Any, Dict, Optional

from utils.request_metrics import record_cache_hit


class ResponseCache:
    """LRU cache with TTL for deterministic agent responses.

    Thread-safe implementation using a lock.
    """

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

    def clear(self) -> None:
        """Clear all cached entries."""
        with self._lock:
            self._cache.clear()

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


# Singleton instance
# TTL: 5 minutes, max 256 entries
agent_cache = ResponseCache(max_size=256, ttl_seconds=300)
