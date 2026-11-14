"""
memory/state_store.py - Pluggable persistence for AI Core state
================================================================

AI Core keeps three kinds of durable state:

* **sessions** - one document per workflow session (``SessionState``)
* **checkpoints** - phase snapshots used to resume a session
* **memories** - per-user facts/preferences with lexical search

``StateStore`` is the narrow interface over all three.  Two implementations:

``MongoStateStore``
    Default whenever a Mongo URI is configured (``AI_CORE_MONGO_URI`` or
    ``MONGO_URI``).  Collections come from ``utils.mongo_client.get_mongo_db()``
    (which also serves ``mongomock`` for ``AI_CORE_STATE_BACKEND=memory``).
    Sessions expire through a TTL index (24 h default), checkpoints through a
    second one (7 d default).  Memory search uses a text index prefixed with
    ``{orgId, userId}`` and every query filters on both fields.

``SqliteStateStore``
    Local-dev / test backend (the original behaviour: WAL, FTS5 with a
    sanitised ``MATCH`` expression, LIKE fallback).

Backend selection (``resolve_backend``) reads ``AI_CORE_STATE_BACKEND``:
``mongo`` | ``sqlite`` | ``memory`` (mongomock).  Unset means ``mongo`` when a
Mongo URI is configured, otherwise ``sqlite``.

Stores exchange plain dicts so this module never imports the dataclasses that
live in ``utils.session_manager`` / ``memory.store`` (avoids import cycles).

Session document shape::

    {"id", "org_id", "user_id", "status", "created_at", "updated_at",
     "expires_at", "data": <SessionState.to_dict()>}

Checkpoint document shape::

    {"id", "session_id", "phase", "created_at", "data": <SessionCheckpoint.to_dict()>}
"""

from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
import threading
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)

SESSIONS_COLLECTION = "ai_sessions"
CHECKPOINTS_COLLECTION = "ai_checkpoints"
MEMORIES_COLLECTION = "ai_memories"

DEFAULT_SESSION_TTL_SECONDS = 24 * 3600
DEFAULT_CHECKPOINT_TTL_SECONDS = 7 * 24 * 3600

_FTS_MAX_TERMS = 12
_FTS_TOKEN_RE = re.compile(r"\w+", re.UNICODE)
_RESUMABLE_STATUSES = ("in_progress", "paused", "created")


# Exception raised when attempting to insert a session with an existing ID.
# Prevents unintentional state collision or overwriting active session data.
# Signals that caller should use update methods or generate a unique ID.
class SessionExistsError(Exception):
    """Raised by ``put_session`` when the session id is already taken."""


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
# Returns current UTC timestamp formatted as ISO-8601 string.
# Standardizes temporal timestamps across session and checkpoint documents.
# Supplies consistent ISO format representations for serialization.
def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Parses integer environment variable with lower boundary of one.
# Falls back to specified default value if parsing fails or variable unset.
# Safeguards TTL and numeric configuration parameters across environments.
def _env_int(name: str, default: int) -> int:
    try:
        return max(1, int(float(os.getenv(name, "") or default)))
    except ValueError:
        return default


# Resolves session time-to-live expiration duration in seconds.
# Reads AI_CORE_SESSION_TTL_SECONDS environment variable or default of 24h.
# Configures automated database TTL expiration for session records.
def session_ttl_seconds() -> int:
    return _env_int("AI_CORE_SESSION_TTL_SECONDS", DEFAULT_SESSION_TTL_SECONDS)


# Resolves checkpoint document time-to-live lifespan in seconds.
# Reads AI_CORE_CHECKPOINT_TTL_SECONDS variable or default of seven days.
# Governs database index automatic pruning threshold for past checkpoints.
def checkpoint_ttl_seconds() -> int:
    return _env_int("AI_CORE_CHECKPOINT_TTL_SECONDS", DEFAULT_CHECKPOINT_TTL_SECONDS)


# Safely converts ISO datetime string or object into UTC datetime.
# Normalizes timezone representations and handles missing tzinfo flags.
# Returns None when input string is malformed or empty.
def _parse_iso(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


# Converts datetime object or arbitrary value into ISO-8601 string.
# Parses input value into UTC datetime before rendering formatted string.
# Returns empty string or stringified representation if parsing fails.
def _to_iso(value: Any) -> str:
    parsed = _parse_iso(value)
    return parsed.isoformat() if parsed else str(value or "")


_seq_lock = threading.Lock()
_last_seq = 0


# Generates monotonically increasing wall-clock nanosecond sequence integer.
# Protects against duplicate timestamps when writing back-to-back checkpoints.
# Uses thread lock to ensure sequence values increment strictly across callers.
def _next_seq() -> int:
    """Monotonic, wall-clock-anchored sequence used to order checkpoints.

    BSON datetimes have millisecond precision and Windows clocks are coarse, so
    ``created_at`` alone cannot order checkpoints written back to back.
    """
    global _last_seq
    with _seq_lock:
        _last_seq = max(_last_seq + 1, time.time_ns())
        return _last_seq


# Converts free-form search query into sanitized SQLite FTS5 MATCH expression.
# Encloses individual token phrases in quotes to neutralize query operators.
# Joins tokens with OR conjunction to allow partial rank scoring on matches.
def build_fts_match_query(text: str) -> str:
    """Turn free-form user text into a safe FTS5 ``MATCH`` expression.

    Raw natural language is not valid FTS5 syntax: ``?``, ``"``, ``-``, ``:``,
    ``*`` and the bare words ``AND``/``OR``/``NOT``/``NEAR`` all raise
    ``sqlite3.OperationalError`` or change query meaning. Each alphanumeric token
    is therefore emitted as a quoted phrase (quoting neutralises operators) and
    the phrases are OR-ed so bm25 ranking can surface partial matches. Returns
    an empty string when the text has no searchable tokens.
    """
    return " OR ".join(f'"{token}"' for token in search_tokens(text))


# Extracts distinct lowercase alphanumeric word tokens from search query text.
# Filters out short characters under two chars and removes duplicates.
# Enforces upper term count bound to safeguard full-text query performance.
def search_tokens(text: str) -> List[str]:
    """Distinct lower-cased alphanumeric tokens (>=2 chars), capped for safety."""
    seen: set[str] = set()
    terms: List[str] = []
    for token in _FTS_TOKEN_RE.findall(str(text or "").lower()):
        if len(token) < 2 or token in seen:
            continue
        seen.add(token)
        terms.append(token)
        if len(terms) >= _FTS_MAX_TERMS:
            break
    return terms


# Escapes wildcard and backslash characters for safe SQL LIKE operations.
# Replaces percent, underscore, and backslash characters with escape sequences.
# Guarantees that user query substrings are matched literally without pattern syntax.
def _escape_like(text: str) -> str:
    """Escape ``%``/``_``/``\\`` so user text is matched literally by LIKE."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# ---------------------------------------------------------------------------
# interface
# ---------------------------------------------------------------------------
# Abstract interface defining persistent storage for sessions, checkpoints, and memories.
# Standardizes CRUD operations across database backends such as SQLite and MongoDB.
# Provides tenant-isolated storage contracts with time-to-live and search capabilities.
class StateStore(ABC):
    """Persistence for sessions, checkpoints and memory records."""

    backend: str = "abstract"

    # -- lifecycle ---------------------------------------------------------
    # Ensures required database indexes and tables are established idempotently.
    # Executes backend schema setup without raising errors during application startup.
    # Returns status dictionary documenting initialized indexes and collection states.
    @abstractmethod
    def ensure_indexes(self) -> Dict[str, Any]:
        """Create indexes idempotently. Never raises; returns a status dict."""

    # Verifies connectivity and operational readiness of underlying database backend.
    # Executes lightweight probe to test database connection responsiveness.
    # Returns boolean true if backend is healthy and responding properly.
    @abstractmethod
    def ping(self) -> bool: ...

    # Assesses backend health status for observability and health check endpoints.
    # Checks backend connection status and reports active storage backend name.
    # Returns status dictionary containing backend type identifier and health flag.
    def health(self) -> Dict[str, Any]:
        return {"backend": self.backend, "ok": self.ping()}

    # -- sessions ----------------------------------------------------------
    # Inserts brand new workflow session document into storage.
    # Enforces uniqueness of session ID, raising SessionExistsError on conflict.
    # Sets creation timestamps, status flags, and initial workflow parameters.
    @abstractmethod
    def put_session(self, doc: Dict[str, Any]) -> None:
        """Insert a new session; raises ``SessionExistsError`` on a duplicate id."""

    # Upserts active workflow session document matching specified session ID.
    # Updates phase states, serialized state dictionary, and updated timestamps.
    # Replaces existing session document or inserts new record if absent.
    @abstractmethod
    def save_session(self, doc: Dict[str, Any]) -> None:
        """Upsert a session by id."""

    # Retrieves stored session record by ID with optional tenant access checks.
    # Asserts matching organization and user identifiers if provided in arguments.
    # Returns complete session dictionary or None if session does not exist.
    @abstractmethod
    def get_session(
        self, session_id: str, *, org_id: Optional[str] = None, user_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Fetch a session; when ``org_id``/``user_id`` are given they must match."""

    # Permanently deletes session document matching specified session ID.
    # Removes session state and cleans up associated runtime resources.
    # Operates as a safe no-op if target session identifier does not exist.
    @abstractmethod
    def delete_session(self, session_id: str) -> None: ...

    # Queries uncompleted or paused sessions eligible for workflow resumption.
    # Filters by tenant organization and user ID in resumable lifecycle states.
    # Returns list of session documents ordered by most recent activity timestamp.
    @abstractmethod
    def list_resumable(self, org_id: str, user_id: str, limit: int) -> List[Dict[str, Any]]: ...

    # Flags overdue in-flight sessions as expired and purges their checkpoints.
    # Evaluates session timestamps against supplied ISO-8601 current time cutoff.
    # Returns count of sessions that were transitioned to expired status.
    @abstractmethod
    def expire_overdue(self, now_iso: str) -> int:
        """Mark overdue unfinished sessions ``expired`` and drop their checkpoints."""

    # Gathers diagnostic session counts broken down by active status labels.
    # Aggregates completed, expired, in-progress, and failed session numbers.
    # Returns statistics dictionary providing overview of session metrics.
    @abstractmethod
    def session_stats(self) -> Dict[str, Any]: ...

    # -- checkpoints -------------------------------------------------------
    # Appends workflow execution snapshot checkpoint document into persistent store.
    # Attaches phase, state dictionary, agent outputs, and sequence order tags.
    # Associates optional organization and user IDs for tenant boundary tracking.
    @abstractmethod
    def add_checkpoint(self, doc: Dict[str, Any], *, org_id: str = "", user_id: str = "") -> None: ...

    # Retrieves history of checkpoints for a specific workflow session.
    # Orders checkpoints newest first with optional phase and tenant filtering.
    # Returns list of checkpoint dictionaries for inspection or state resumption.
    @abstractmethod
    def list_checkpoints(
        self,
        session_id: str,
        *,
        limit: int = 50,
        phase: Optional[str] = None,
        org_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Newest first."""

    # Counts total number of checkpoints recorded for a workflow session.
    # Returns integer total used for verifying persistence progress and depth.
    # Enables auditing and telemetry tracking across intermediate phase steps.
    @abstractmethod
    def count_checkpoints(self, session_id: str) -> int: ...

    # Deletes all checkpoints associated with target workflow session ID.
    # Cleans up intermediate phase snapshots once session is finalized.
    # Returns count of deleted checkpoint records removed from persistent storage.
    @abstractmethod
    def delete_checkpoints(self, session_id: str) -> int: ...

    # -- memories ----------------------------------------------------------
    # Batch upserts memory records for specified user within tenant organization.
    # Accepts tuples of key, value, confidence, and extraction source.
    # Returns count of memory records successfully inserted or updated.
    @abstractmethod
    def upsert_memories(
        self, org_id: str, user_id: str, records: Iterable[tuple[str, str, float, str]]
    ) -> int: ...

    # Executes text search over user memories matching query string tokens.
    # Uses full-text indexing or LIKE fallbacks to rank and filter records.
    # Returns list of memory dictionaries meeting confidence and relevance limits.
    @abstractmethod
    def search_memories(self, org_id: str, user_id: str, query: str, limit: int) -> List[Dict[str, Any]]: ...

    # Lists all stored memory records for a given user in an organization.
    # Retrieves user facts ordered by confidence score and recency.
    # Returns bounded list of memory dictionaries for user context injection.
    @abstractmethod
    def list_memories(self, org_id: str, user_id: str, limit: int) -> List[Dict[str, Any]]: ...

    # Observability counters (best effort).
    text_search_errors: int = 0
    has_text_search: bool = False


# ---------------------------------------------------------------------------
# SQLite
# ---------------------------------------------------------------------------
# SQLite implementation of StateStore utilizing WAL mode and FTS5 search.
# Stores session states, checkpoint histories, and user memories in a local database.
# Provides resilient fallback for development and self-contained test environments.
class SqliteStateStore(StateStore):
    """The original single-process SQLite behaviour (dev / tests)."""

    backend = "sqlite"

    # Initialises SQLite state store instance with target database path.
    # Configures threading locks, search capability flags, and error tallies.
    # Invokes schema creation logic to ensure tables and virtual indices exist.
    def __init__(self, db_path: str):
        self.db_path = str(db_path)
        self._lock = threading.RLock()
        self._has_fts = False
        self.text_search_errors = 0
        self._ensure_ready()

    # Property indicating whether SQLite FTS5 extension is available and ready.
    # Reports status of full-text virtual table configuration in the database.
    # Used to choose between fast FTS5 queries or standard SQL LIKE searches.
    @property
    def has_text_search(self) -> bool:  # type: ignore[override]
        return self._has_fts

    # Creates isolated SQLite connection with autocommit and row factory settings.
    # Configures connection timeout and sqlite3.Row representation mapping.
    # Returns fresh SQLite database connection object for current operation.
    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10, isolation_level=None)
        conn.row_factory = sqlite3.Row
        return conn

    # Creates parent directory and sets up schema tables and indexes in SQLite.
    # Configures WAL journal mode and instantiates sessions, checkpoints, and memories.
    # Attempts FTS5 virtual table initialization to enable indexed lexical search.
    def _ensure_ready(self) -> None:
        path = Path(self.db_path)
        if path.parent and not path.parent.exists():
            path.parent.mkdir(parents=True, exist_ok=True)

        with self._lock:
            conn = self._connect()
            try:
                try:
                    conn.execute("PRAGMA journal_mode=WAL;")
                except Exception:
                    pass  # WAL may be unsupported on some filesystems.

                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS sessions (
                        id TEXT PRIMARY KEY,
                        org_id TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        status TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        data TEXT NOT NULL
                    );
                    """
                )
                conn.execute("CREATE INDEX IF NOT EXISTS sessions_org_user ON sessions(org_id, user_id);")
                conn.execute("CREATE INDEX IF NOT EXISTS sessions_status ON sessions(status);")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS checkpoints (
                        id TEXT PRIMARY KEY,
                        session_id TEXT NOT NULL,
                        phase TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        data TEXT NOT NULL,
                        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
                    );
                    """
                )
                conn.execute("CREATE INDEX IF NOT EXISTS checkpoints_session ON checkpoints(session_id);")
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
                conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS memories_uniq ON memories(org_id, user_id, key);")
                self._has_fts = self._ensure_fts(conn)
            finally:
                conn.close()

    # Creates FTS5 full-text virtual table and synchronization triggers in SQLite.
    # Attaches insert, update, and delete triggers to keep search index synchronized.
    # Returns true if FTS5 is successfully configured or false if extension fails.
    @staticmethod
    def _ensure_fts(conn: sqlite3.Connection) -> bool:
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

    # Returns index status dictionary for SQLite backend reporting.
    # Confirms SQLite database operation and FTS full-text search availability.
    # Reflects absence of background database-driven TTL index expiration.
    def ensure_indexes(self) -> Dict[str, Any]:
        return {"backend": "sqlite", "ok": True, "fts": self._has_fts, "ttl": False}

    # Probes local SQLite database file connectivity with a test query.
    # Executes SELECT 1 under thread lock to verify connection responsiveness.
    # Returns boolean true on successful execution or false upon SQLite error.
    def ping(self) -> bool:
        try:
            with self._lock:
                conn = self._connect()
                try:
                    conn.execute("SELECT 1;").fetchone()
                finally:
                    conn.close()
            return True
        except Exception:
            return False

    # -- sessions ----------------------------------------------------------
    # Formats session dictionary document into SQLite parameterized row tuple.
    # Serializes internal data sub-dictionary into JSON string representation.
    # Maps fields matching SQLite sessions table column definition order.
    @staticmethod
    def _session_row(doc: Dict[str, Any]) -> tuple:
        return (
            doc["id"],
            doc["org_id"],
            doc["user_id"],
            doc["status"],
            doc["created_at"],
            doc["updated_at"],
            json.dumps(doc["data"]),
        )

    # Inserts brand new session row into SQLite sessions table under lock.
    # Traps sqlite3.IntegrityError to raise canonical SessionExistsError.
    # Closes database connection safely in finally block post-insertion.
    def put_session(self, doc: Dict[str, Any]) -> None:
        with self._lock:
            conn = self._connect()
            try:
                try:
                    conn.execute(
                        "INSERT INTO sessions (id, org_id, user_id, status, created_at, updated_at, data) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?);",
                        self._session_row(doc),
                    )
                except sqlite3.IntegrityError as exc:
                    raise SessionExistsError(doc["id"]) from exc
            finally:
                conn.close()

    # Upserts session row into SQLite sessions table using ON CONFLICT DO UPDATE.
    # Modifies status, updated_at, and serialized data payload for existing IDs.
    # Ensures atomic session state synchronization under concurrency lock.
    def save_session(self, doc: Dict[str, Any]) -> None:
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO sessions (id, org_id, user_id, status, created_at, updated_at, data)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      status=excluded.status, updated_at=excluded.updated_at, data=excluded.data;
                    """,
                    self._session_row(doc),
                )
            finally:
                conn.close()

    # Converts SQLite sessions row and JSON payload into standard session document.
    # Deserializes JSON string into data dictionary and extracts expires_at field.
    # Returns standardized session dictionary matching StateStore interface format.
    @staticmethod
    def _session_doc(row: sqlite3.Row) -> Dict[str, Any]:
        data = json.loads(row["data"])
        return {
            "id": row["id"],
            "org_id": row["org_id"],
            "user_id": row["user_id"],
            "status": row["status"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "expires_at": data.get("expires_at"),
            "data": data,
        }

    # Fetches session document from SQLite database matching ID and tenant scopes.
    # Dynamically builds SQL query with organization and user filters when given.
    # Returns deserialized session document dictionary or None if not found.
    def get_session(self, session_id, *, org_id=None, user_id=None):
        sql = "SELECT * FROM sessions WHERE id = ?"
        params: List[Any] = [session_id]
        if org_id is not None:
            sql += " AND org_id = ?"
            params.append(org_id)
        if user_id is not None:
            sql += " AND user_id = ?"
            params.append(user_id)
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(sql + ";", params).fetchone()
                return self._session_doc(row) if row else None
            finally:
                conn.close()

    # Permanently deletes session and associated checkpoints from SQLite under lock.
    # Executes cascaded deletion across checkpoints and sessions tables.
    # Operates safely within synchronized lock context to prevent race conditions.
    def delete_session(self, session_id: str) -> None:
        with self._lock:
            conn = self._connect()
            try:
                conn.execute("DELETE FROM checkpoints WHERE session_id = ?;", (session_id,))
                conn.execute("DELETE FROM sessions WHERE id = ?;", (session_id,))
            finally:
                conn.close()

    # Queries SQLite sessions table for in-progress or paused sessions for user.
    # Restricts selection by tenant organization and user identifier.
    # Returns deserialized session documents ordered by most recent update time.
    def list_resumable(self, org_id, user_id, limit):
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT * FROM sessions
                    WHERE org_id = ? AND user_id = ?
                    AND status IN ('in_progress', 'paused', 'created')
                    ORDER BY updated_at DESC
                    LIMIT ?;
                    """,
                    (org_id, user_id, int(limit)),
                ).fetchall()
                return [self._session_doc(row) for row in rows]
            finally:
                conn.close()

    # Scans SQLite sessions for overdue records and marks their status expired.
    # Prunes intermediate checkpoints associated with expired session identifiers.
    # Returns count of sessions that were marked expired during the sweep.
    def expire_overdue(self, now_iso: str) -> int:
        count = 0
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT id FROM sessions
                    WHERE status NOT IN ('completed', 'expired')
                    AND json_extract(data, '$.expires_at') < ?;
                    """,
                    (now_iso,),
                ).fetchall()
                for row in rows:
                    conn.execute("DELETE FROM checkpoints WHERE session_id = ?;", (row["id"],))
                    conn.execute(
                        "UPDATE sessions SET status = 'expired', updated_at = ? WHERE id = ?;",
                        (now_iso, row["id"]),
                    )
                    count += 1
            finally:
                conn.close()
        return count

    # Compiles aggregate counts of sessions and checkpoints stored in SQLite.
    # Groups session counts by lifecycle status and counts total checkpoints.
    # Returns statistics dictionary summarizing storage volume and state metrics.
    def session_stats(self) -> Dict[str, Any]:
        with self._lock:
            conn = self._connect()
            try:
                total = conn.execute("SELECT COUNT(*) as c FROM sessions;").fetchone()["c"]
                by_status = conn.execute("SELECT status, COUNT(*) as c FROM sessions GROUP BY status;").fetchall()
                total_checkpoints = conn.execute("SELECT COUNT(*) as c FROM checkpoints;").fetchone()["c"]
                return {
                    "total_sessions": total,
                    "by_status": {row["status"]: row["c"] for row in by_status},
                    "total_checkpoints": total_checkpoints,
                }
            finally:
                conn.close()

    # -- checkpoints -------------------------------------------------------
    # Persists session execution checkpoint snapshot into SQLite database.
    # Serializes checkpoint payload into JSON string and inserts into checkpoints table.
    # Executes insertion under thread lock protection with explicit connection closing.
    def add_checkpoint(self, doc, *, org_id="", user_id=""):
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    "INSERT INTO checkpoints (id, session_id, phase, created_at, data) VALUES (?, ?, ?, ?, ?);",
                    (doc["id"], doc["session_id"], doc["phase"], doc["created_at"], json.dumps(doc["data"])),
                )
            finally:
                conn.close()

    # Retrieves checkpoints for a session from SQLite ordered by creation time.
    # Joins sessions table if tenant organization or user constraints are applied.
    # Returns deserialized JSON checkpoint payload dictionaries matching filters.
    def list_checkpoints(self, session_id, *, limit=50, phase=None, org_id=None, user_id=None):
        sql = "SELECT c.data FROM checkpoints c"
        params: List[Any] = []
        where = ["c.session_id = ?"]
        params.append(session_id)
        if org_id is not None or user_id is not None:
            sql += " JOIN sessions s ON s.id = c.session_id"
            if org_id is not None:
                where.append("s.org_id = ?")
                params.append(org_id)
            if user_id is not None:
                where.append("s.user_id = ?")
                params.append(user_id)
        if phase:
            where.append("c.phase = ?")
            params.append(phase)
        sql += " WHERE " + " AND ".join(where) + " ORDER BY c.created_at DESC, c.rowid DESC LIMIT ?;"
        params.append(int(limit))
        with self._lock:
            conn = self._connect()
            try:
                return [json.loads(row["data"]) for row in conn.execute(sql, params).fetchall()]
            finally:
                conn.close()

    # Counts number of stored checkpoints in SQLite matching session ID.
    # Executes SELECT COUNT query on checkpoints table under lock protection.
    # Returns total checkpoint count integer for given session identifier.
    def count_checkpoints(self, session_id: str) -> int:
        with self._lock:
            conn = self._connect()
            try:
                return int(
                    conn.execute("SELECT COUNT(*) AS c FROM checkpoints WHERE session_id = ?;", (session_id,)).fetchone()["c"]
                )
            finally:
                conn.close()

    # Deletes all checkpoints associated with target session from SQLite table.
    # Executes DELETE statement filtering on session ID parameter under lock.
    # Returns count of deleted rows removed from the checkpoints table.
    def delete_checkpoints(self, session_id: str) -> int:
        with self._lock:
            conn = self._connect()
            try:
                return conn.execute("DELETE FROM checkpoints WHERE session_id = ?;", (session_id,)).rowcount
            finally:
                conn.close()

    # -- memories ----------------------------------------------------------
    # Inserts or updates multiple memory records in SQLite using ON CONFLICT clause.
    # Updates value, confidence, source, and modification timestamp on duplicate key.
    # Returns count of processed records successfully written to memories table.
    def upsert_memories(self, org_id, user_id, records):
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

    # Formats SQLite memory table row into standardized dictionary representation.
    # Extracts key, value, floating point confidence rating, source, and timestamps.
    # Normalizes column types to conform to standard memory model contract shapes.
    @staticmethod
    def _memory_dict(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "key": str(row["key"]),
            "value": str(row["value"]),
            "confidence": float(row["confidence"]),
            "source": str(row["source"]),
            "updated_at": str(row["updated_at"]),
        }

    # Performs text search over SQLite memories utilizing FTS5 bm25 or LIKE fallback.
    # Searches query tokens against key and value columns scoped to tenant user.
    # Returns formatted memory records sorted by relevance rank and recency.
    def search_memories(self, org_id, user_id, query, limit):
        q = str(query or "").strip()
        if not q:
            return []
        limit = max(1, min(50, int(limit)))
        with self._lock:
            conn = self._connect()
            try:
                rows = None
                if self._has_fts:
                    match_query = build_fts_match_query(q)
                    if not match_query:
                        return []
                    try:
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
                            (match_query, org_id, user_id, limit),
                        ).fetchall()
                    except sqlite3.OperationalError as exc:
                        # Should be unreachable after sanitising, but never lose
                        # memory silently: count it, log it, and fall back to LIKE.
                        self.text_search_errors += 1
                        logger.warning(
                            "memory_fts_query_failed",
                            extra={"event": "memory_fts_query_failed", "error": str(exc), "fts_errors": self.text_search_errors},
                        )
                        rows = None
                if rows is None:
                    like = f"%{_escape_like(q)}%"
                    rows = conn.execute(
                        """
                        SELECT key, value, confidence, source, updated_at
                        FROM memories
                        WHERE org_id = ?
                          AND user_id = ?
                          AND (key LIKE ? ESCAPE '\\' OR value LIKE ? ESCAPE '\\')
                        ORDER BY updated_at DESC
                        LIMIT ?;
                        """,
                        (org_id, user_id, like, like, limit),
                    ).fetchall()
                return [self._memory_dict(row) for row in rows]
            finally:
                conn.close()

    # Lists memory records from SQLite for a user ordered by modification date.
    # Restricts selection by tenant organization and user identifier.
    # Returns formatted memory dictionaries clamped to requested upper limit.
    def list_memories(self, org_id, user_id, limit):
        limit = max(1, min(500, int(limit)))
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT key, value, confidence, source, updated_at
                    FROM memories
                    WHERE org_id = ? AND user_id = ?
                    ORDER BY updated_at DESC
                    LIMIT ?;
                    """,
                    (org_id, user_id, limit),
                ).fetchall()
                return [self._memory_dict(row) for row in rows]
            finally:
                conn.close()


# ---------------------------------------------------------------------------
# MongoDB
# ---------------------------------------------------------------------------
# MongoDB implementation of StateStore providing production-grade persistence.
# Manages sessions, phase checkpoints, and user memories with TTL expiration.
# Utilizes compound text indexing and tenant organization ID scoping across collections.
class MongoStateStore(StateStore):
    """MongoDB (or mongomock) backed state.

    Every query filters on ``orgId``/``userId`` where the caller supplies them
    (memories always; sessions/checkpoints when scoped by the caller).  Session
    ids are 64-bit random handles and are additionally verified by the
    ``SessionManager`` ownership check.
    """

    backend = "mongo"

    # Initialises MongoDB state store with optional database override connection.
    # Configures index tracking statuses, error counts, and text search flags.
    # Enables in-memory testing via mongomock or connects to shared MongoDB client.
    def __init__(self, db: Any = None):
        self._db_override = db
        self._text_disabled = False
        self.text_search_errors = 0
        self.has_text_search = False
        self._index_status: Dict[str, Any] = {"ok": None}

    # -- collections -------------------------------------------------------
    # Property resolving active MongoDB database object for store operations.
    # Returns overridden database connection or accesses global MongoDB client.
    # Supplies central database instance for session, checkpoint, and memory collections.
    @property
    def db(self) -> Any:
        if self._db_override is not None:
            return self._db_override
        from utils.mongo_client import get_mongo_db

        return get_mongo_db()

    # Property providing direct reference to the MongoDB sessions collection.
    # Accesses ai_sessions collection used for active workflow sessions.
    # Returns collection object for querying and persisting session documents.
    @property
    def sessions(self) -> Any:
        return self.db[SESSIONS_COLLECTION]

    # Property providing direct reference to MongoDB checkpoints collection.
    # Accesses ai_checkpoints collection storing intermediate workflow snapshots.
    # Returns collection object for managing phase resumption checkpoints.
    @property
    def checkpoints(self) -> Any:
        return self.db[CHECKPOINTS_COLLECTION]

    # Property providing direct reference to MongoDB memories collection.
    # Accesses ai_memories collection holding user facts and preferences.
    # Returns collection object for managing user preference extraction storage.
    @property
    def memories(self) -> Any:
        return self.db[MEMORIES_COLLECTION]

    # -- lifecycle ---------------------------------------------------------
    # Safely creates MongoDB index on target collection, recreating on options conflict.
    # Traps index conflict error codes to drop and recreate index when options alter.
    # Records success or diagnostic error message in provided status report mapping.
    def _create_index(self, coll: Any, keys: list, report: Dict[str, Any], **options: Any) -> None:
        name = options["name"]
        try:
            coll.create_index(keys, **options)
            report[name] = "ok"
        except Exception as exc:
            code = getattr(exc, "code", None)
            conflict = code in (85, 86) or "already exists with different options" in str(exc)
            if conflict:  # IndexOptionsConflict / IndexKeySpecsConflict (e.g. TTL value changed)
                try:
                    coll.drop_index(name)
                    coll.create_index(keys, **options)
                    report[name] = "recreated"
                    return
                except Exception as exc2:  # pragma: no cover - needs a real server
                    exc = exc2
            report[name] = f"error: {str(exc)[:160]}"

    # Builds TTL indexes and compound text search indexes across MongoDB collections.
    # Configures automated document expiration for sessions and checkpoint stores.
    # Returns comprehensive dictionary reporting status for each established index.
    def ensure_indexes(self) -> Dict[str, Any]:
        report: Dict[str, Any] = {}
        sess_ttl = session_ttl_seconds()
        ckpt_ttl = checkpoint_ttl_seconds()
        try:
            self._create_index(
                self.sessions,
                [("orgId", 1), ("userId", 1), ("status", 1), ("updatedAt", -1)],
                report,
                name="sessions_org_user_status",
            )
            self._create_index(
                self.sessions, [("updatedAt", 1)], report, name="sessions_ttl_updatedAt", expireAfterSeconds=sess_ttl
            )
            self._create_index(
                self.checkpoints, [("sessionId", 1), ("seq", -1)], report, name="checkpoints_session_seq"
            )
            self._create_index(
                self.checkpoints,
                [("sessionId", 1), ("phase", 1), ("seq", -1)],
                report,
                name="checkpoints_session_phase_seq",
            )
            self._create_index(
                self.checkpoints, [("createdAt", 1)], report, name="checkpoints_ttl_createdAt", expireAfterSeconds=ckpt_ttl
            )
            self._create_index(
                self.memories,
                [("orgId", 1), ("userId", 1), ("key", 1)],
                report,
                name="memories_uniq",
                unique=True,
            )
            self._create_index(
                self.memories,
                [("orgId", 1), ("userId", 1), ("key", "text"), ("value", "text")],
                report,
                name="memories_text",
                weights={"key": 2, "value": 1},
            )
        except Exception as exc:  # server down etc. - never block startup
            logger.warning("state_store_index_failed", extra={"event": "state_store_index_failed", "error": str(exc)[:200]})
            result = {"backend": "mongo", "ok": False, "error": str(exc)[:200], "indexes": report}
            self._index_status = result
            return result
        failed = {k: v for k, v in report.items() if str(v).startswith("error")}
        if failed:
            logger.warning("state_store_index_failed", extra={"event": "state_store_index_failed", "failed": failed})
        self.has_text_search = report.get("memories_text") in ("ok", "recreated")
        result = {
            "backend": "mongo",
            "ok": not failed,
            "indexes": report,
            "session_ttl_seconds": sess_ttl,
            "checkpoint_ttl_seconds": ckpt_ttl,
        }
        self._index_status = result
        return result

    # Tests connection health to remote MongoDB cluster or mongomock backend.
    # Executes MongoDB admin ping command to verify server responsiveness.
    # Returns true if database command executes successfully or false on error.
    def ping(self) -> bool:
        try:
            self.db.command("ping")
            return True
        except Exception:
            return False

    # Compiles comprehensive health assessment for the MongoDB storage backend.
    # Evaluates database ping responsiveness and verifies index initialization ok.
    # Returns diagnostic dictionary detailing backend type, health, and errors.
    def health(self) -> Dict[str, Any]:
        ok = self.ping()
        out: Dict[str, Any] = {"backend": self.backend, "ok": ok, "indexes_ok": self._index_status.get("ok")}
        if not ok:
            out["error"] = "ping failed"
        return out

    # -- sessions ----------------------------------------------------------
    # Maps standard session dictionary into MongoDB document schema format.
    # Parses string ISO timestamps into native BSON datetime objects.
    # Returns formatted document structure ready for MongoDB collection writes.
    @staticmethod
    def _session_mongo(doc: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "orgId": doc["org_id"],
            "userId": doc["user_id"],
            "status": doc["status"],
            "createdAt": _parse_iso(doc["created_at"]),
            "updatedAt": _parse_iso(doc["updated_at"]),
            "expiresAt": _parse_iso(doc.get("expires_at")),
            "data": doc["data"],
        }

    # Converts raw MongoDB document payload into standardized session dict shape.
    # Normalizes camelCase Mongo properties and parses BSON dates to ISO text.
    # Returns standardized session dictionary conforming to StateStore interface.
    @staticmethod
    def _session_doc(raw: Dict[str, Any]) -> Dict[str, Any]:
        data = raw.get("data") or {}
        return {
            "id": raw["_id"],
            "org_id": raw.get("orgId", data.get("org_id")),
            "user_id": raw.get("userId", data.get("user_id")),
            "status": raw.get("status", data.get("status")),
            "created_at": _to_iso(raw.get("createdAt") or data.get("created_at")),
            "updated_at": _to_iso(raw.get("updatedAt") or data.get("updated_at")),
            "expires_at": data.get("expires_at"),
            "data": data,
        }

    # Inserts brand new workflow session record into MongoDB sessions collection.
    # Sets primary _id attribute to session identifier and checks duplicate keys.
    # Raises SessionExistsError if document matching session ID already exists.
    def put_session(self, doc: Dict[str, Any]) -> None:
        from pymongo.errors import DuplicateKeyError

        body = self._session_mongo(doc)
        body["_id"] = doc["id"]
        try:
            self.sessions.insert_one(body)
        except DuplicateKeyError as exc:
            raise SessionExistsError(doc["id"]) from exc

    # Upserts session record in MongoDB sessions collection matching target ID.
    # Replaces existing session document body using replace_one with upsert flag.
    # Persists latest workflow progress state, status changes, and timestamps.
    def save_session(self, doc: Dict[str, Any]) -> None:
        body = self._session_mongo(doc)
        self.sessions.replace_one({"_id": doc["id"]}, body, upsert=True)

    # Fetches session document from MongoDB by ID with tenant scope constraints.
    # Applies orgId and userId filters to query dictionary when provided.
    # Returns normalized session document dictionary or None if absent.
    def get_session(self, session_id, *, org_id=None, user_id=None):
        query: Dict[str, Any] = {"_id": session_id}
        if org_id is not None:
            query["orgId"] = org_id
        if user_id is not None:
            query["userId"] = user_id
        raw = self.sessions.find_one(query)
        return self._session_doc(raw) if raw else None

    # Deletes session record and all corresponding checkpoints from MongoDB.
    # Executes delete_many across checkpoints collection before deleting session.
    # Removes active session state permanently from the database.
    def delete_session(self, session_id: str) -> None:
        self.checkpoints.delete_many({"sessionId": session_id})
        self.sessions.delete_one({"_id": session_id})

    # Queries MongoDB for resumable sessions belonging to a specific tenant user.
    # Filters by orgId, userId, and statuses matching created, in_progress, paused.
    # Returns normalized session document list ordered descending by update date.
    def list_resumable(self, org_id, user_id, limit):
        cursor = (
            self.sessions.find({"orgId": org_id, "userId": user_id, "status": {"$in": list(_RESUMABLE_STATUSES)}})
            .sort([("updatedAt", -1)])
            .limit(int(limit))
        )
        return [self._session_doc(raw) for raw in cursor]

    # Marks overdue unfinished sessions expired and purges their checkpoints in Mongo.
    # Evaluates expiresAt date field against provided current ISO cutoff time.
    # Returns integer count of overdue sessions transitioned to expired status.
    def expire_overdue(self, now_iso: str) -> int:
        now = _parse_iso(now_iso) or datetime.now(timezone.utc)
        overdue = list(
            self.sessions.find(
                {"status": {"$nin": ["completed", "expired"]}, "expiresAt": {"$lt": now}}, {"_id": 1}
            )
        )
        for raw in overdue:
            self.checkpoints.delete_many({"sessionId": raw["_id"]})
            self.sessions.update_one({"_id": raw["_id"]}, {"$set": {"status": "expired", "updatedAt": now, "data.status": "expired"}})
        return len(overdue)

    # Gathers session and checkpoint aggregate counts from MongoDB collections.
    # Executes aggregation pipeline grouping sessions by their status attribute.
    # Returns statistics dictionary summarizing totals and status distributions.
    def session_stats(self) -> Dict[str, Any]:
        by_status = {row["_id"]: row["c"] for row in self.sessions.aggregate([{"$group": {"_id": "$status", "c": {"$sum": 1}}}])}
        return {
            "total_sessions": sum(by_status.values()),
            "by_status": by_status,
            "total_checkpoints": self.checkpoints.count_documents({}),
        }

    # -- checkpoints -------------------------------------------------------
    # Inserts workflow checkpoint snapshot document into MongoDB checkpoints table.
    # Attaches nanosecond sequence ordering value, creation timestamp, and data.
    # Stores intermediate phase progress for session state recovery and resumption.
    def add_checkpoint(self, doc, *, org_id="", user_id=""):
        self.checkpoints.insert_one(
            {
                "_id": doc["id"],
                "sessionId": doc["session_id"],
                "orgId": org_id,
                "userId": user_id,
                "phase": doc["phase"],
                "createdAt": _parse_iso(doc["created_at"]) or datetime.now(timezone.utc),
                "seq": _next_seq(),
                "data": doc["data"],
            }
        )

    # Retrieves checkpoints for a session from MongoDB ordered chronologically.
    # Applies optional filters for processing phase, tenant, and user ID.
    # Returns serialized checkpoint state payload records up to limit.
    def list_checkpoints(self, session_id, *, limit=50, phase=None, org_id=None, user_id=None):
        query: Dict[str, Any] = {"sessionId": session_id}
        if phase:
            query["phase"] = phase
        if org_id is not None:
            query["orgId"] = org_id
        if user_id is not None:
            query["userId"] = user_id
        cursor = self.checkpoints.find(query).sort([("seq", -1)]).limit(int(limit))
        return [raw["data"] for raw in cursor]

    # Counts total stored checkpoints for a session in MongoDB collection.
    # Queries the checkpoints collection using matching session identifier.
    # Returns total count of matching checkpoint documents as integer.
    def count_checkpoints(self, session_id: str) -> int:
        return int(self.checkpoints.count_documents({"sessionId": session_id}))

    # Deletes all checkpoints associated with a session from MongoDB.
    # Executes delete many operation matching on the session identifier.
    # Returns total number of deleted checkpoint documents as integer.
    def delete_checkpoints(self, session_id: str) -> int:
        return int(self.checkpoints.delete_many({"sessionId": session_id}).deleted_count)

    # -- memories ----------------------------------------------------------
    # Performs bulk upsert of memory key-value records into MongoDB.
    # Prepares update operations updating confidence, source, and timestamps.
    # Returns count of successfully queued and written memory items.
    def upsert_memories(self, org_id, user_id, records):
        from pymongo import UpdateOne

        now = datetime.now(timezone.utc)
        ops = [
            UpdateOne(
                {"orgId": org_id, "userId": user_id, "key": str(key)},
                {
                    "$set": {"value": str(value), "confidence": float(confidence), "source": source, "updatedAt": now},
                    "$setOnInsert": {"createdAt": now},
                },
                upsert=True,
            )
            for (key, value, confidence, source) in records
            if str(key).strip() and str(value).strip()
        ]
        if not ops:
            return 0
        self.memories.bulk_write(ops, ordered=False)
        return len(ops)

    # Normalizes raw MongoDB memory document into standardized dictionary.
    # Formats confidence score, source type, and ISO update timestamp.
    # Returns clean dictionary representing user memory key-value entry.
    @staticmethod
    def _memory_dict(raw: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "key": str(raw["key"]),
            "value": str(raw["value"]),
            "confidence": float(raw.get("confidence", 0.5)),
            "source": str(raw.get("source", "explicit")),
            "updated_at": _to_iso(raw.get("updatedAt")),
        }

    # Searches memory records using MongoDB text search or regex fallback.
    # Scopes query to organization and user with tokenized match clauses.
    # Returns matching memory dictionaries sorted by score or recency.
    def search_memories(self, org_id, user_id, query, limit):
        tokens = search_tokens(str(query or ""))
        if not tokens:
            return []
        limit = max(1, min(50, int(limit)))
        scope = {"orgId": org_id, "userId": user_id}
        if not self._text_disabled:
            try:
                cursor = (
                    self.memories.find({**scope, "$text": {"$search": " ".join(tokens)}}, {"score": {"$meta": "textScore"}})
                    .sort([("score", {"$meta": "textScore"}), ("updatedAt", -1)])
                    .limit(limit)
                )
                return [self._memory_dict(raw) for raw in cursor]
            except NotImplementedError:
                # mongomock: no $text support. Not an error, use the regex path.
                self._text_disabled = True
            except Exception as exc:
                self.text_search_errors += 1
                logger.warning(
                    "memory_text_query_failed",
                    extra={"event": "memory_text_query_failed", "error": str(exc)[:200], "text_errors": self.text_search_errors},
                )
        clauses = []
        for token in tokens:
            pattern = re.escape(token)
            clauses.append({"key": {"$regex": pattern, "$options": "i"}})
            clauses.append({"value": {"$regex": pattern, "$options": "i"}})
        cursor = self.memories.find({**scope, "$or": clauses}).sort([("updatedAt", -1)]).limit(limit)
        return [self._memory_dict(raw) for raw in cursor]

    # Lists memory records from MongoDB for a user ordered by modification date.
    # Restricts selection by tenant organization and user identifier.
    # Returns formatted memory dictionaries clamped to requested upper limit.
    def list_memories(self, org_id, user_id, limit):
        limit = max(1, min(500, int(limit)))
        cursor = self.memories.find({"orgId": org_id, "userId": user_id}).sort([("updatedAt", -1)]).limit(limit)
        return [self._memory_dict(raw) for raw in cursor]


# ---------------------------------------------------------------------------
# selection
# ---------------------------------------------------------------------------
# Resolves active persistence backend based on configuration and environment.
# Checks environment variable and verifies MongoDB configuration availability.
# Returns string identifier representing selected storage backend mechanism.
def resolve_backend() -> str:
    """``mongo`` | ``sqlite`` | ``memory`` from ``AI_CORE_STATE_BACKEND`` (+ URI)."""
    from utils.mongo_client import mongo_configured

    explicit = (os.getenv("AI_CORE_STATE_BACKEND") or "").strip().lower()
    if explicit == "memory":
        return "memory"
    if explicit == "sqlite":
        return "sqlite"
    if explicit == "mongo":
        if mongo_configured():
            return "mongo"
        logger.error(
            "AI_CORE_STATE_BACKEND=mongo but no AI_CORE_MONGO_URI/MONGO_URI is set; falling back to sqlite",
            extra={"event": "state_backend_fallback"},
        )
        return "sqlite"
    return "mongo" if mongo_configured() else "sqlite"


# Determines filesystem storage path for SQLite database instances.
# Resolves dedicated sessions database or shared memory database location.
# Returns resolved absolute or relative SQLite database file path.
def _sqlite_path(kind: str) -> str:
    from config import settings

    memory_path = settings.MEMORY_DB_PATH
    if kind == "sessions":
        return os.path.join(os.path.dirname(memory_path), "sessions.sqlite3")
    return memory_path


_stores: Dict[tuple, StateStore] = {}
_stores_lock = threading.Lock()


# Retrieves process-wide cached state store singleton for specified storage type.
# Lazily instantiates SQLite or Mongo backend under thread-safe lock.
# Returns configured StateStore instance ready for checkpoint operations.
def get_state_store(kind: str = "sessions") -> StateStore:
    """Process-wide store for ``kind`` ("sessions" or "memory")."""
    backend = resolve_backend()
    key = (backend, kind if backend == "sqlite" else "shared")
    with _stores_lock:
        store = _stores.get(key)
        if store is None:
            store = SqliteStateStore(_sqlite_path(kind)) if backend == "sqlite" else MongoStateStore()
            _stores[key] = store
        return store


# Clears all cached state store instances and resets health cache.
# Thread-safely empties active store dictionary for isolated testing.
# Ensures clean state initialization on subsequent storage store requests.
def reset_state_stores() -> None:
    """Drop cached stores (tests)."""
    with _stores_lock:
        _stores.clear()
    _health_cache.update({"at": 0.0, "value": None})


# ---------------------------------------------------------------------------
# startup + readiness
# ---------------------------------------------------------------------------
_health_cache: Dict[str, Any] = {"at": 0.0, "value": None}


# Initializes state storage backend by building necessary collection indexes.
# Connects to configured state store and handles index creation idempotently.
# Returns index status report indicating backend initialization health.
def init_state_backend() -> Dict[str, Any]:
    """Create indexes (idempotent) for the selected backend. Fails soft."""
    try:
        store = get_state_store("sessions")
        report = store.ensure_indexes()
        if store.backend != "sqlite":
            get_state_store("memory")  # same shared store; keeps symmetry
        if not report.get("ok"):
            logger.warning("state_backend_degraded", extra={"event": "state_backend_degraded", "report": str(report)[:300]})
        return report
    except Exception as exc:
        logger.warning("state_backend_init_failed", extra={"event": "state_backend_init_failed", "error": str(exc)[:200]})
        return {"backend": resolve_backend(), "ok": False, "error": str(exc)[:200]}


# Evaluates and returns health check status of the active state backend.
# Utilizes cached health status within maximum age threshold for efficiency.
# Returns status dictionary containing backend name and operational status.
def state_backend_health(max_age_seconds: float = 5.0) -> Dict[str, Any]:
    """Cached health of the state backend for ``/ready`` (blocking; call via a thread)."""
    now = time.monotonic()
    cached = _health_cache.get("value")
    if cached is not None and now - float(_health_cache["at"]) < max_age_seconds:
        return cached
    try:
        value = get_state_store("sessions").health()
    except Exception as exc:
        value = {"backend": resolve_backend(), "ok": False, "error": str(exc)[:200]}
    _health_cache.update({"at": now, "value": value})
    return value
