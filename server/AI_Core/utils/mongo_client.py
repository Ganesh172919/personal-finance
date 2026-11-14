"""
mongo_client.py - Shared MongoDB handle for AI Core state, learning and registry
================================================================================

One lazily-created ``pymongo`` client per process.

* ``AI_CORE_MONGO_URI`` (falls back to ``MONGO_URI``) selects the server.
* ``AI_CORE_MONGO_DB`` selects the database (default ``finwise_ai_core``).
* When no URI is configured, or ``AI_CORE_STATE_BACKEND=memory``, an in-process
  ``mongomock`` database is returned so dev and tests never need a server.
  ``mongomock`` is a dev dependency; production must configure a real URI.

Use ``get_mongo_db()`` and never construct clients elsewhere.  Tests call
``reset_mongo_db()`` (or ``set_mongo_db(fake)``) for isolation.
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Any, Optional

logger = logging.getLogger(__name__)

_db: Any = None
_lock = threading.Lock()


# Evaluates whether MongoDB connection URI is configured in environment.
# Checks AI_CORE_MONGO_URI or fallback MONGO_URI configuration variables.
# Returns boolean true if non-empty MongoDB URI string is present.
def mongo_configured() -> bool:
    return bool((os.getenv("AI_CORE_MONGO_URI") or os.getenv("MONGO_URI") or "").strip())


# Instantiates MongoDB database connection client or in-memory mock fallback.
# Configures connection pool sizes, timeouts, and target database selection.
# Returns Database handle for persistent storage or mongomock instance for tests.
def _build_db() -> Any:
    uri = (os.getenv("AI_CORE_MONGO_URI") or os.getenv("MONGO_URI") or "").strip()
    name = (os.getenv("AI_CORE_MONGO_DB") or "finwise_ai_core").strip()
    backend = (os.getenv("AI_CORE_STATE_BACKEND") or "").strip().lower()
    if uri and backend != "memory":
        from pymongo import MongoClient

        client = MongoClient(
            uri,
            maxPoolSize=int(os.getenv("AI_CORE_MONGO_MAX_POOL", "20") or 20),
            serverSelectionTimeoutMS=int(os.getenv("AI_CORE_MONGO_SELECT_TIMEOUT_MS", "3000") or 3000),
            socketTimeoutMS=int(os.getenv("AI_CORE_MONGO_SOCKET_TIMEOUT_MS", "10000") or 10000),
            tz_aware=True,
            appname="finwise-ai-core",
        )
        return client[name]
    import mongomock  # dev/test only

    logger.warning("ai_core_mongo_in_memory", extra={"event": "ai_core_mongo_in_memory"})
    return mongomock.MongoClient(tz_aware=True)[name]


# Retrieves or lazily creates shared singleton MongoDB database client handle.
# Implements thread-safe double-checked locking initialization pattern.
# Returns database handle for AI Core persistence, state, and registry.
def get_mongo_db() -> Any:
    global _db
    if _db is None:
        with _lock:
            if _db is None:
                _db = _build_db()
    return _db


# Overrides global MongoDB database handle reference under synchronization lock.
# Allows mock or custom test database client injection during test setup.
# Synchronizes database handle update across concurrent execution threads.
def set_mongo_db(db: Any) -> None:
    global _db
    with _lock:
        _db = db


# Resets global MongoDB database handle pointer to none for testing cleanup.
# Clears active database client reference to ensure test isolation.
# Forces subsequent calls to re-initialize fresh database connection.
def reset_mongo_db() -> None:
    set_mongo_db(None)


# Checks database connectivity by executing a ping command on the active database.
# Verifies responsive server connection or returns true for in-memory mock.
# Returns boolean indicating whether MongoDB server is reachable and responsive.
def mongo_ping(timeout_ms: Optional[int] = None) -> bool:
    """True when the database answers (always True for the in-memory fake)."""
    try:
        db = get_mongo_db()
        db.command("ping")
        return True
    except Exception:
        return False
