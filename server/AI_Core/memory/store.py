"""
memory/store.py - User Memory Store (MongoDB or SQLite via StateStore)
=========================================================================

Provides ``MemoryStore``, a persistent key-value store for user-level
memories (preferences, facts, inferred traits).  Memories are scoped by
``org_id`` + ``user_id``.  Persistence is delegated to a ``StateStore``
(``memory/state_store.py``): MongoDB with an ``{orgId, userId}``-prefixed text
index in production, SQLite FTS5 for local dev and tests.

Features (SQLite backend details)
---------------------------------
- **Upsert** -- insert or update memories by ``(org_id, user_id, key)``
  with automatic deduplication.
- **Full-text search** -- uses FTS5 ``bm25()`` ranking for relevance-
  based retrieval.  Falls back to ``LIKE`` if FTS5 is unavailable.
- **Thread-safe** -- all operations are guarded by a ``threading.Lock``.
- **WAL mode** -- enables concurrent reads during writes for better
  performance under concurrent FastAPI requests.

Schema
------
The ``memories`` table stores: ``org_id``, ``user_id``, ``key``,
``value``, ``confidence`` (0-1), ``source`` ("explicit"/"inferred"),
``created_at``, ``updated_at``.

The ``memories_fts`` virtual table mirrors ``key`` and ``value`` for
full-text search, kept in sync via INSERT/UPDATE/DELETE triggers.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, List, Optional

from .state_store import (  # noqa: F401  (re-exported for backwards compatibility)
    SqliteStateStore,
    StateStore,
    _escape_like,
    build_fts_match_query,
    get_state_store,
)

logger = logging.getLogger(__name__)


# Generates current UTC timestamp formatted as ISO 8601 string.
# Uses datetime timezone aware UTC now method for timestamping.
# Returns string representation of timestamp for record tracking.
def _utc_now_iso() -> str:
    """Return the current UTC time as an ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


# Encapsulates an individual user memory entry data model.
# Stores key value pairs along with confidence metric and source.
# Provides immutable dataclass representation for user context.
@dataclass(frozen=True)
class MemoryRecord:
    """A single memory entry with key, value, confidence, and source."""
    key: str
    value: str
    confidence: float
    source: str
    updated_at: str


# Represents scored and ranked memory entry retrieved from search.
# Enriches base memory attributes with relevance and reciprocal rank scores.
# Provides immutable structure for prioritizing retrieved user facts.
@dataclass(frozen=True)
class RankedMemoryRecord:
    """A ranked memory entry with relevance score and rank."""
    key: str
    value: str
    confidence: float
    source: str
    updated_at: str
    score: float
    rank: int = 1
    rrf_score: float = 0.0


# Fuses multiple ranked search result candidate lists using RRF algorithm.
# Combines weighted candidate ranks across distinct retrieval channels.
# Returns unified ranked results sorted by fused score descending.
def reciprocal_rank_fusion(
    ranked_lists: Iterable[Iterable[dict]],
    k: int = 60,
    weights: dict[str, float] | None = None,
) -> List[dict]:
    """Fuse multiple ranked lists of candidate dicts using Reciprocal Rank Fusion (RRF).

    Each candidate dict must include an 'id' and optionally a 'source_type'.
    RRF score formula: sum( weight / (k + rank_in_source) )
    Returns fused items sorted by rrf_score descending with normalized score in [0, 100].
    """
    weights = weights or {}
    fused: dict[str, dict] = {}
    rrf_scores: dict[str, float] = {}

    for source_list in ranked_lists:
        for rank_idx, item in enumerate(source_list, start=1):
            item_id = str(item.get("id") or item.get("key") or "")
            if not item_id:
                continue

            source_type = str(item.get("source_type") or "default")
            w = float(weights.get(source_type, 1.0))
            score_delta = w / (float(k) + float(rank_idx))

            rrf_scores[item_id] = rrf_scores.get(item_id, 0.0) + score_delta
            if item_id not in fused:
                fused[item_id] = dict(item)

    if not fused:
        return []

    max_rrf = max(rrf_scores.values()) if rrf_scores else 1.0
    if max_rrf <= 0:
        max_rrf = 1.0

    sorted_ids = sorted(fused.keys(), key=lambda i: rrf_scores.get(i, 0.0), reverse=True)
    results: List[dict] = []

    for global_rank, item_id in enumerate(sorted_ids, start=1):
        item = fused[item_id]
        raw_rrf = rrf_scores[item_id]
        normalized_score = round(min(100.0, (raw_rrf / max_rrf) * 100.0), 1)

        result_copy = dict(item)
        result_copy["rrf_score"] = round(raw_rrf, 6)
        result_copy["normalized_score"] = normalized_score
        result_copy["unified_rank"] = global_rank
        results.append(result_copy)

    return results


# Constructs a typed MemoryRecord instance from dictionary row representation.
# Maps dictionary keys and casts primitive data types safely.
# Returns immutable MemoryRecord object ready for consumer usage.
def _record(row: dict) -> MemoryRecord:
    return MemoryRecord(
        key=str(row["key"]),
        value=str(row["value"]),
        confidence=float(row["confidence"]),
        source=str(row["source"]),
        updated_at=str(row["updated_at"]),
    )


# Manages user-level memory persistence facade over underlying StateStore.
# Supports scoping memories per organization and user with deduplication.
# Provides full-text search, ranked lexical retrieval, and batch upserts.
class MemoryStore:
    """Per-user memory facade over a ``StateStore``.

    ``MemoryStore(db_path=...)`` pins a local SQLite file (dev/tests).  With no
    arguments the backend is chosen by ``AI_CORE_STATE_BACKEND`` (see
    ``memory.state_store.resolve_backend``).  Pass ``store=`` to inject one.
    """

    # Initializes memory store facade wrapping designated backend store.
    # Resolves state store instance from explicit parameter or defaults.
    # Sets database path attribute if available on backend instance.
    def __init__(self, db_path: Optional[str] = None, *, store: Optional[StateStore] = None):
        if store is None:
            store = SqliteStateStore(str(db_path)) if db_path else get_state_store("memory")
        self._store = store
        self.db_path = getattr(store, "db_path", None)

    # Exposes reference to underlying state store implementation instance.
    # Provides access to lower-level persistence and indexing operations.
    # Returns configured StateStore backend powering current memory store.
    @property
    def store(self) -> StateStore:
        return self._store

    # Identifies active persistence storage backend used by memory store.
    # Delegates query to underlying state store backend attribute.
    # Returns string identifier such as sqlite or mongo backend.
    @property
    def backend(self) -> str:
        return self._store.backend

    # Indicates whether text search capability is available on backend.
    # Inspects text search support flags of underlying state store.
    # Returns boolean flag confirming full-text search availability.
    @property
    def has_fts(self) -> bool:
        return bool(self._store.has_text_search)

    # Reports count of failed text search queries encountered by backend.
    # Queries error counter tracking FTS5 or Mongo text index errors.
    # Returns total count of text search exceptions as integer.
    @property
    def fts_error_count(self) -> int:
        """Failed text-search queries (FTS5 on SQLite, ``$text`` on Mongo)."""
        return int(self._store.text_search_errors)

    # Performs batch upsert of memory key-value entries for user.
    # Passes organization, user identifier, and record tuples to store.
    # Returns number of memory records successfully inserted or updated.
    def upsert_many(
        self,
        *,
        org_id: str,
        user_id: str,
        records: Iterable[tuple[str, str, float, str]],
    ) -> int:
        return self._store.upsert_memories(org_id, user_id, records)

    # Executes text search query across user memories within scope.
    # Sanitizes search terms and limits returned record collection size.
    # Returns list of matched MemoryRecord instances matching query.
    def search(
        self,
        *,
        org_id: str,
        user_id: str,
        query: str,
        limit: int = 8,
    ) -> List[MemoryRecord]:
        q = str(query or "").strip()
        if not q:
            return []
        limit = max(1, min(50, int(limit)))
        return [_record(row) for row in self._store.search_memories(org_id, user_id, q, limit)]

    # Retrieves all stored memories for specified organization and user.
    # Restricts output length within bounded upper limit constraint.
    # Returns list of MemoryRecord objects ordered chronologically.
    def get_all(
        self,
        *,
        org_id: str,
        user_id: str,
        limit: int = 100,
    ) -> List[MemoryRecord]:
        """Fetch all stored memories for a specific org and user."""
        limit = max(1, min(500, int(limit)))
        return [_record(row) for row in self._store.list_memories(org_id, user_id, limit)]

    # Performs lexical scoring and confidence-weighted ranking over memories.
    # Evaluates exact phrase matches and token overlaps against query terms.
    # Returns ordered list of RankedMemoryRecord objects sorted by relevance.
    def search_ranked(
        self,
        *,
        org_id: str,
        user_id: str,
        query: str,
        limit: int = 8,
        min_confidence: float = 0.0,
    ) -> List[RankedMemoryRecord]:
        """Rank user memories against query with lexical scoring, exact phrase bonus, and confidence weighting."""
        q = str(query or "").strip().lower()
        if not q:
            return []

        limit = max(1, min(50, int(limit)))
        all_records = self.get_all(org_id=org_id, user_id=user_id, limit=200)

        # Extract meaningful query terms
        terms = [t for t in q.replace("-", " ").replace("_", " ").split() if len(t) >= 2]
        scored_candidates: List[tuple[MemoryRecord, float]] = []

        for rec in all_records:
            if rec.confidence < min_confidence:
                continue

            k_lower = rec.key.lower()
            v_lower = rec.value.lower()

            score = 0.0
            # Exact phrase match in key or value
            if q in k_lower:
                score += 20.0
            elif q in v_lower:
                score += 15.0

            # Token overlap scoring
            for term in terms:
                if term in k_lower:
                    score += 6.0
                if term in v_lower:
                    score += 4.0

            # Confidence weighting factor (0.7 + 0.3 * confidence)
            score *= (0.7 + 0.3 * max(0.0, min(1.0, rec.confidence)))

            if score > 0.0:
                scored_candidates.append((rec, round(score, 2)))

        # Sort descending by score
        scored_candidates.sort(key=lambda pair: pair[1], reverse=True)
        top_candidates = scored_candidates[:limit]

        ranked: List[RankedMemoryRecord] = []
        for rank, (rec, score) in enumerate(top_candidates, start=1):
            rrf = round(1.0 / (60.0 + rank), 6)
            ranked.append(
                RankedMemoryRecord(
                    key=rec.key,
                    value=rec.value,
                    confidence=rec.confidence,
                    source=rec.source,
                    updated_at=rec.updated_at,
                    score=score,
                    rank=rank,
                    rrf_score=rrf,
                )
            )

        return ranked

