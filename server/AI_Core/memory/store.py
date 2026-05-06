"""
memory/store.py - SQLite-Backed Memory Store
=============================================

Provides ``MemoryStore``, a persistent key-value store for user-level
memories (preferences, facts, inferred traits).  Memories are scoped by
``org_id`` + ``user_id`` and support full-text search via SQLite FTS5.

Features
--------
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

import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List


def _utc_now_iso() -> str:
    """Return the current UTC time as an ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class MemoryRecord:
    """A single memory entry with key, value, confidence, and source."""
    key: str
    value: str
    confidence: float
    source: str
    updated_at: str


class MemoryStore:
    def __init__(self, db_path: str):
        self.db_path = str(db_path)
        self._lock = threading.Lock()
        self._has_fts = False
        self._ensure_ready()

    @property
    def has_fts(self) -> bool:
        return self._has_fts

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10, isolation_level=None)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_ready(self) -> None:
        path = Path(self.db_path)
        if path.parent and not path.parent.exists():
            path.parent.mkdir(parents=True, exist_ok=True)

        with self._lock:
            conn = self._connect()
            try:
                conn.execute("PRAGMA journal_mode=WAL;")
            except Exception:
                # Best-effort; WAL may be unsupported on some filesystems.
                pass

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS memories (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  org_id TEXT NOT NULL,
                  user_id TEXT NOT NULL,
                  key TEXT NOT NULL,
                  value TEXT NOT NULL,
                  confidence REAL NOT NULL DEFAULT 0.5,
                  source TEXT NOT NULL DEFAULT 'explicit',
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                """
            )

            conn.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS memories_uniq
                ON memories(org_id, user_id, key);
                """
            )

            self._has_fts = self._ensure_fts(conn)
            conn.close()

    def _ensure_fts(self, conn: sqlite3.Connection) -> bool:
        try:
            conn.execute(
                """
                CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
                USING fts5(key, value, content='memories', content_rowid='id');
                """
            )

            conn.execute(
                """
                CREATE TRIGGER IF NOT EXISTS memories_ai
                AFTER INSERT ON memories BEGIN
                  INSERT INTO memories_fts(rowid, key, value) VALUES (new.id, new.key, new.value);
                END;
                """
            )
            conn.execute(
                """
                CREATE TRIGGER IF NOT EXISTS memories_ad
                AFTER DELETE ON memories BEGIN
                  INSERT INTO memories_fts(memories_fts, rowid, key, value)
                  VALUES('delete', old.id, old.key, old.value);
                END;
                """
            )
            conn.execute(
                """
                CREATE TRIGGER IF NOT EXISTS memories_au
                AFTER UPDATE ON memories BEGIN
                  INSERT INTO memories_fts(memories_fts, rowid, key, value)
                  VALUES('delete', old.id, old.key, old.value);
                  INSERT INTO memories_fts(rowid, key, value) VALUES (new.id, new.key, new.value);
                END;
                """
            )

            return True
        except Exception:
            return False

    def upsert_many(
        self,
        *,
        org_id: str,
        user_id: str,
        records: Iterable[tuple[str, str, float, str]],
    ) -> int:
        now = _utc_now_iso()
        rows = [
            (org_id, user_id, key, value, float(confidence), source, now, now)
            for (key, value, confidence, source) in records
            if str(key).strip() and str(value).strip()
        ]
        if not rows:
            return 0

        with self._lock:
            conn = self._connect()
            try:
                conn.executemany(
                    """
                    INSERT INTO memories(org_id, user_id, key, value, confidence, source, created_at, updated_at)
                    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(org_id, user_id, key) DO UPDATE SET
                      value=excluded.value,
                      confidence=excluded.confidence,
                      source=excluded.source,
                      updated_at=excluded.updated_at;
                    """,
                    rows,
                )
                return len(rows)
            finally:
                conn.close()

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

        with self._lock:
            conn = self._connect()
            try:
                if self._has_fts:
                    # FTS5 bm25: lower is better.
                    rows = conn.execute(
                        """
                        SELECT m.key, m.value, m.confidence, m.source, m.updated_at
                        FROM memories_fts
                        JOIN memories m ON m.id = memories_fts.rowid
                        WHERE memories_fts MATCH ?
                          AND m.org_id = ?
                          AND m.user_id = ?
                        ORDER BY bm25(memories_fts) ASC, m.updated_at DESC
                        LIMIT ?;
                        """,
                        (q, org_id, user_id, limit),
                    ).fetchall()
                else:
                    like = f"%{q}%"
                    rows = conn.execute(
                        """
                        SELECT key, value, confidence, source, updated_at
                        FROM memories
                        WHERE org_id = ?
                          AND user_id = ?
                          AND (key LIKE ? OR value LIKE ?)
                        ORDER BY updated_at DESC
                        LIMIT ?;
                        """,
                        (org_id, user_id, like, like, limit),
                    ).fetchall()

                return [
                    MemoryRecord(
                        key=str(row["key"]),
                        value=str(row["value"]),
                        confidence=float(row["confidence"]),
                        source=str(row["source"]),
                        updated_at=str(row["updated_at"]),
                    )
                    for row in rows
                ]
            finally:
                conn.close()

