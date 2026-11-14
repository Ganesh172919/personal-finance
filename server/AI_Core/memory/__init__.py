"""
memory - Persistent user memory store and deterministic extraction
"""

from .extract import extract_memories
from .state_store import (
    MongoStateStore,
    SqliteStateStore,
    StateStore,
    get_state_store,
    resolve_backend,
)
from .store import MemoryRecord, MemoryStore, RankedMemoryRecord, reciprocal_rank_fusion

# Exports public memory interfaces, state store classes, and extraction helpers.
# Provides centralized access to SQLite and Mongo backend storage components.
# Exposes reciprocal rank fusion algorithms and memory ranking dataclasses.
__all__ = [
    "MemoryRecord",
    "MemoryStore",
    "MongoStateStore",
    "RankedMemoryRecord",
    "SqliteStateStore",
    "StateStore",
    "extract_memories",
    "get_state_store",
    "reciprocal_rank_fusion",
    "resolve_backend",
]

