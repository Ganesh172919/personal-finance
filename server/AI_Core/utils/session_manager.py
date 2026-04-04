"""
Session Manager with Checkpointing and Resumable State.

Provides persistent session state for long-running multi-agent workflows:
- Session checkpoints saved at each agent phase
- Resumable state after failures or restarts
- Memory compaction with rolling summaries
- Artifact storage for intermediate results

Usage:
    from utils.session_manager import (
        SessionManager,
        SessionState,
        SessionCheckpoint,
        get_session_manager,
    )

    manager = get_session_manager()
    session = manager.create_session(org_id, user_id)

    # Save checkpoint after each phase
    manager.save_checkpoint(session.id, checkpoint)

    # Resume later
    session = manager.get_session(session_id)
    checkpoint = manager.get_latest_checkpoint(session_id)
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _utc_now_timestamp() -> float:
    return datetime.now(timezone.utc).timestamp()


def _normalize_agent_outputs(agent_outputs: Any) -> Dict[str, Any]:
    """
    Normalize checkpoint outputs to a mapping.

    Older checkpoints may have stored a bare string or other scalar as
    `agent_outputs` when completing a session. Resume logic expects a dict.
    """
    if isinstance(agent_outputs, dict):
        return agent_outputs

    if isinstance(agent_outputs, str):
        stripped = agent_outputs.strip()
        if stripped:
            try:
                decoded = json.loads(stripped)
            except json.JSONDecodeError:
                decoded = None
            if isinstance(decoded, dict):
                return decoded

    if agent_outputs is None:
        return {}

    return {"final_output": agent_outputs}


class SessionStatus(Enum):
    """Session lifecycle status."""

    CREATED = "created"
    IN_PROGRESS = "in_progress"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"


class CheckpointPhase(Enum):
    """Workflow phases for checkpointing."""

    ROUTING = "routing"
    PLANNING = "planning"
    RESEARCH = "research"
    EXECUTION = "execution"
    VERIFICATION = "verification"
    SYNTHESIS = "synthesis"
    COMPLETE = "complete"
    ERROR = "error"


@dataclass
class SessionCheckpoint:
    """A checkpoint capturing workflow state at a specific point."""

    id: str
    session_id: str
    phase: CheckpointPhase
    created_at: str

    # State data
    state_data: Dict[str, Any] = field(default_factory=dict)

    # Agent outputs
    agent_outputs: Dict[str, Any] = field(default_factory=dict)

    # Compressed context
    context_summary: str = ""

    # Metadata
    agent_name: Optional[str] = None
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: float = 0.0
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "phase": self.phase.value,
            "created_at": self.created_at,
            "state_data": self.state_data,
            "agent_outputs": self.agent_outputs,
            "context_summary": self.context_summary,
            "agent_name": self.agent_name,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "latency_ms": self.latency_ms,
            "error": self.error,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SessionCheckpoint":
        return cls(
            id=data["id"],
            session_id=data["session_id"],
            phase=CheckpointPhase(data["phase"]),
            created_at=data["created_at"],
            state_data=data.get("state_data", {}),
            agent_outputs=_normalize_agent_outputs(data.get("agent_outputs", {})),
            context_summary=data.get("context_summary", ""),
            agent_name=data.get("agent_name"),
            input_tokens=data.get("input_tokens", 0),
            output_tokens=data.get("output_tokens", 0),
            latency_ms=data.get("latency_ms", 0.0),
            error=data.get("error"),
        )


@dataclass
class CompactedMemory:
    """Compacted memory for long sessions."""

    # User facts (extracted from conversations)
    user_facts: Dict[str, Any] = field(default_factory=dict)

    # Rolling session summary (compressed context)
    rolling_summary: str = ""

    # Recent decisions (last N decisions made)
    recent_decisions: List[Dict[str, Any]] = field(default_factory=list)

    # Unresolved subgoals (pending items)
    unresolved_goals: List[Dict[str, Any]] = field(default_factory=list)

    # Important artifacts (plan IDs, file refs, etc.)
    artifact_refs: List[str] = field(default_factory=list)

    # Token usage tracking
    total_input_tokens: int = 0
    total_output_tokens: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_facts": self.user_facts,
            "rolling_summary": self.rolling_summary,
            "recent_decisions": self.recent_decisions,
            "unresolved_goals": self.unresolved_goals,
            "artifact_refs": self.artifact_refs,
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CompactedMemory":
        return cls(
            user_facts=data.get("user_facts", {}),
            rolling_summary=data.get("rolling_summary", ""),
            recent_decisions=data.get("recent_decisions", []),
            unresolved_goals=data.get("unresolved_goals", []),
            artifact_refs=data.get("artifact_refs", []),
            total_input_tokens=data.get("total_input_tokens", 0),
            total_output_tokens=data.get("total_output_tokens", 0),
        )


@dataclass
class SessionState:
    """Full session state."""

    id: str
    org_id: str
    user_id: str
    status: SessionStatus
    created_at: str
    updated_at: str

    # Original request
    original_input: str = ""
    original_profile: Optional[Dict[str, Any]] = None

    # Current phase
    current_phase: CheckpointPhase = CheckpointPhase.ROUTING

    # Compacted memory
    memory: CompactedMemory = field(default_factory=CompactedMemory)

    # Metadata
    checkpoint_count: int = 0
    total_duration_ms: float = 0.0
    last_active_at: str = ""
    expires_at: Optional[str] = None

    # Error tracking
    error_count: int = 0
    last_error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "org_id": self.org_id,
            "user_id": self.user_id,
            "status": self.status.value,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "original_input": self.original_input,
            "original_profile": self.original_profile,
            "current_phase": self.current_phase.value,
            "memory": self.memory.to_dict(),
            "checkpoint_count": self.checkpoint_count,
            "total_duration_ms": self.total_duration_ms,
            "last_active_at": self.last_active_at,
            "expires_at": self.expires_at,
            "error_count": self.error_count,
            "last_error": self.last_error,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SessionState":
        return cls(
            id=data["id"],
            org_id=data["org_id"],
            user_id=data["user_id"],
            status=SessionStatus(data["status"]),
            created_at=data["created_at"],
            updated_at=data["updated_at"],
            original_input=data.get("original_input", ""),
            original_profile=data.get("original_profile"),
            current_phase=CheckpointPhase(data.get("current_phase", "routing")),
            memory=CompactedMemory.from_dict(data.get("memory", {})),
            checkpoint_count=data.get("checkpoint_count", 0),
            total_duration_ms=data.get("total_duration_ms", 0.0),
            last_active_at=data.get("last_active_at", ""),
            expires_at=data.get("expires_at"),
            error_count=data.get("error_count", 0),
            last_error=data.get("last_error"),
        )


class SessionManager:
    """
    Manages persistent session state for long-running workflows.

    Uses SQLite for durability with support for:
    - Session creation and lifecycle management
    - Checkpoint storage and retrieval
    - Memory compaction
    - Session expiration and cleanup
    """

    # Maximum decisions to keep in memory
    MAX_RECENT_DECISIONS = 10

    # Maximum unresolved goals
    MAX_UNRESOLVED_GOALS = 20

    # Maximum rolling summary length (characters)
    MAX_SUMMARY_LENGTH = 4000

    # Session expiration (24 hours)
    DEFAULT_EXPIRATION_HOURS = 24

    def __init__(self, db_path: str):
        self.db_path = str(db_path)
        self._lock = threading.RLock()
        self._ensure_ready()

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
                pass

            # Sessions table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    org_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    data TEXT NOT NULL
                );
            """)

            # Indexes
            conn.execute("""
                CREATE INDEX IF NOT EXISTS sessions_org_user
                ON sessions(org_id, user_id);
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS sessions_status
                ON sessions(status);
            """)

            # Checkpoints table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS checkpoints (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    phase TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    data TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
                );
            """)

            conn.execute("""
                CREATE INDEX IF NOT EXISTS checkpoints_session
                ON checkpoints(session_id);
            """)

            conn.close()

    def create_session(
        self,
        org_id: str,
        user_id: str,
        original_input: str = "",
        original_profile: Optional[Dict[str, Any]] = None,
        expiration_hours: Optional[float] = None,
    ) -> SessionState:
        """Create a new session."""
        session_id = f"sess_{uuid4().hex[:16]}"
        now = _utc_now_iso()

        expiration_hours = expiration_hours or self.DEFAULT_EXPIRATION_HOURS
        expires_at = datetime.fromtimestamp(_utc_now_timestamp() + expiration_hours * 3600, tz=timezone.utc).isoformat()

        session = SessionState(
            id=session_id,
            org_id=org_id,
            user_id=user_id,
            status=SessionStatus.CREATED,
            created_at=now,
            updated_at=now,
            original_input=original_input,
            original_profile=original_profile,
            last_active_at=now,
            expires_at=expires_at,
        )

        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO sessions (id, org_id, user_id, status, created_at, updated_at, data)
                    VALUES (?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        session.id,
                        session.org_id,
                        session.user_id,
                        session.status.value,
                        session.created_at,
                        session.updated_at,
                        json.dumps(session.to_dict()),
                    ),
                )
            finally:
                conn.close()

        logger.info(
            "Session created: id=%s org_id=%s user_id=%s expires_at=%s",
            session_id,
            org_id,
            user_id,
            expires_at,
        )
        return session

    def ensure_session(
        self,
        *,
        org_id: str,
        user_id: str,
        session_id: Optional[str] = None,
        original_input: str = "",
        original_profile: Optional[Dict[str, Any]] = None,
        expiration_hours: Optional[float] = None,
    ) -> SessionState:
        if session_id:
            existing = self.get_session(session_id)
            if existing:
                return existing

        session = self.create_session(
            org_id=org_id,
            user_id=user_id,
            original_input=original_input,
            original_profile=original_profile,
            expiration_hours=expiration_hours,
        )

        if session_id and session.id != session_id:
            replacement = SessionState(
                id=session_id,
                org_id=session.org_id,
                user_id=session.user_id,
                status=session.status,
                created_at=session.created_at,
                updated_at=session.updated_at,
                original_input=session.original_input,
                original_profile=session.original_profile,
                current_phase=session.current_phase,
                memory=session.memory,
                checkpoint_count=session.checkpoint_count,
                total_duration_ms=session.total_duration_ms,
                last_active_at=session.last_active_at,
                expires_at=session.expires_at,
                error_count=session.error_count,
                last_error=session.last_error,
            )

            with self._lock:
                conn = self._connect()
                try:
                    conn.execute("DELETE FROM sessions WHERE id = ?;", (session.id,))
                    conn.execute(
                        """
                        INSERT INTO sessions (id, org_id, user_id, status, created_at, updated_at, data)
                        VALUES (?, ?, ?, ?, ?, ?, ?);
                        """,
                        (
                            replacement.id,
                            replacement.org_id,
                            replacement.user_id,
                            replacement.status.value,
                            replacement.created_at,
                            replacement.updated_at,
                            json.dumps(replacement.to_dict()),
                        ),
                    )
                finally:
                    conn.close()

            return replacement

        return session

    def get_session(self, session_id: str) -> Optional[SessionState]:
        """Get a session by ID."""
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT data FROM sessions WHERE id = ?;",
                    (session_id,),
                ).fetchone()
                if row:
                    return SessionState.from_dict(json.loads(row["data"]))
                return None
            finally:
                conn.close()

    def update_session(self, session: SessionState) -> None:
        """Update a session."""
        session.updated_at = _utc_now_iso()
        session.last_active_at = session.updated_at

        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    UPDATE sessions
                    SET status = ?, updated_at = ?, data = ?
                    WHERE id = ?;
                    """,
                    (
                        session.status.value,
                        session.updated_at,
                        json.dumps(session.to_dict()),
                        session.id,
                    ),
                )
            finally:
                conn.close()

    def save_checkpoint(
        self,
        session_id: str,
        phase: CheckpointPhase,
        state_data: Optional[Dict[str, Any]] = None,
        agent_outputs: Optional[Dict[str, Any]] = None,
        context_summary: str = "",
        agent_name: Optional[str] = None,
        input_tokens: int = 0,
        output_tokens: int = 0,
        latency_ms: float = 0.0,
        error: Optional[str] = None,
    ) -> SessionCheckpoint:
        """Save a checkpoint for a session."""
        checkpoint_id = f"ckpt_{uuid4().hex[:12]}"
        now = _utc_now_iso()

        checkpoint = SessionCheckpoint(
            id=checkpoint_id,
            session_id=session_id,
            phase=phase,
            created_at=now,
            state_data=state_data or {},
            agent_outputs=_normalize_agent_outputs(agent_outputs),
            context_summary=context_summary,
            agent_name=agent_name,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            error=error,
        )

        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO checkpoints (id, session_id, phase, created_at, data)
                    VALUES (?, ?, ?, ?, ?);
                    """,
                    (
                        checkpoint.id,
                        checkpoint.session_id,
                        checkpoint.phase.value,
                        checkpoint.created_at,
                        json.dumps(checkpoint.to_dict()),
                    ),
                )

                # Update session
                session = self.get_session(session_id)
                if session:
                    session.checkpoint_count += 1
                    session.current_phase = phase
                    session.status = SessionStatus.IN_PROGRESS
                    session.memory.total_input_tokens += input_tokens
                    session.memory.total_output_tokens += output_tokens

                    if error:
                        session.error_count += 1
                        session.last_error = error

                    # Update via raw execute to avoid double lock
                    conn.execute(
                        """
                        UPDATE sessions
                        SET status = ?, updated_at = ?, data = ?
                        WHERE id = ?;
                        """,
                        (
                            session.status.value,
                            _utc_now_iso(),
                            json.dumps(session.to_dict()),
                            session.id,
                        ),
                    )
            finally:
                conn.close()

        logger.debug(
            "Checkpoint saved: id=%s session_id=%s phase=%s agent=%s",
            checkpoint_id,
            session_id,
            phase.value,
            agent_name,
        )
        return checkpoint

    def get_checkpoints(
        self,
        session_id: str,
        limit: int = 50,
    ) -> List[SessionCheckpoint]:
        """Get all checkpoints for a session."""
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT data FROM checkpoints
                    WHERE session_id = ?
                    ORDER BY created_at DESC
                    LIMIT ?;
                    """,
                    (session_id, limit),
                ).fetchall()
                return [SessionCheckpoint.from_dict(json.loads(row["data"])) for row in rows]
            finally:
                conn.close()

    def get_latest_checkpoint(
        self,
        session_id: str,
        phase: Optional[CheckpointPhase] = None,
    ) -> Optional[SessionCheckpoint]:
        """Get the latest checkpoint for a session."""
        with self._lock:
            conn = self._connect()
            try:
                if phase:
                    row = conn.execute(
                        """
                        SELECT data FROM checkpoints
                        WHERE session_id = ? AND phase = ?
                        ORDER BY created_at DESC
                        LIMIT 1;
                        """,
                        (session_id, phase.value),
                    ).fetchone()
                else:
                    row = conn.execute(
                        """
                        SELECT data FROM checkpoints
                        WHERE session_id = ?
                        ORDER BY created_at DESC
                        LIMIT 1;
                        """,
                        (session_id,),
                    ).fetchone()

                if row:
                    return SessionCheckpoint.from_dict(json.loads(row["data"]))
                return None
            finally:
                conn.close()

    def compact_memory(
        self,
        session_id: str,
        new_summary_chunk: str = "",
        new_decisions: Optional[List[Dict[str, Any]]] = None,
        new_goals: Optional[List[Dict[str, Any]]] = None,
        resolved_goal_ids: Optional[List[str]] = None,
    ) -> Optional[CompactedMemory]:
        """
        Compact session memory by:
        - Appending to rolling summary (with truncation)
        - Adding new decisions (with limit)
        - Managing unresolved goals

        Returns the updated compacted memory.
        """
        session = self.get_session(session_id)
        if not session:
            return None

        memory = session.memory

        # Update rolling summary
        if new_summary_chunk:
            if memory.rolling_summary:
                combined = f"{memory.rolling_summary}\n\n{new_summary_chunk}"
            else:
                combined = new_summary_chunk

            # Truncate if too long
            if len(combined) > self.MAX_SUMMARY_LENGTH:
                # Keep the most recent part
                combined = "..." + combined[-(self.MAX_SUMMARY_LENGTH - 3) :]

            memory.rolling_summary = combined

        # Add new decisions
        if new_decisions:
            memory.recent_decisions.extend(new_decisions)
            # Keep only the most recent
            if len(memory.recent_decisions) > self.MAX_RECENT_DECISIONS:
                memory.recent_decisions = memory.recent_decisions[-self.MAX_RECENT_DECISIONS :]

        # Update goals
        if resolved_goal_ids:
            memory.unresolved_goals = [g for g in memory.unresolved_goals if g.get("id") not in resolved_goal_ids]

        if new_goals:
            memory.unresolved_goals.extend(new_goals)
            # Keep only the most recent
            if len(memory.unresolved_goals) > self.MAX_UNRESOLVED_GOALS:
                memory.unresolved_goals = memory.unresolved_goals[-self.MAX_UNRESOLVED_GOALS :]

        # Save updated session
        self.update_session(session)

        return memory

    def add_user_fact(
        self,
        session_id: str,
        key: str,
        value: Any,
    ) -> None:
        """Add a user fact to session memory."""
        session = self.get_session(session_id)
        if not session:
            return

        session.memory.user_facts[key] = value
        self.update_session(session)

    def add_artifact_ref(
        self,
        session_id: str,
        artifact_ref: str,
    ) -> None:
        """Add an artifact reference to session memory."""
        session = self.get_session(session_id)
        if not session:
            return

        if artifact_ref not in session.memory.artifact_refs:
            session.memory.artifact_refs.append(artifact_ref)
            self.update_session(session)

    def complete_session(
        self,
        session_id: str,
        final_output: Optional[Any] = None,
    ) -> None:
        """Mark a session as completed."""
        session = self.get_session(session_id)
        if not session:
            return

        session.status = SessionStatus.COMPLETED
        session.current_phase = CheckpointPhase.COMPLETE

        if final_output:
            self.save_checkpoint(
                session_id=session_id,
                phase=CheckpointPhase.COMPLETE,
                agent_outputs=final_output,
            )

        self.update_session(session)
        logger.info("Session completed: id=%s", session_id)

    def fail_session(
        self,
        session_id: str,
        error: str,
    ) -> None:
        """Mark a session as failed."""
        session = self.get_session(session_id)
        if not session:
            return

        session.status = SessionStatus.FAILED
        session.current_phase = CheckpointPhase.ERROR
        session.error_count += 1
        session.last_error = error

        self.save_checkpoint(
            session_id=session_id,
            phase=CheckpointPhase.ERROR,
            error=error,
        )

        self.update_session(session)
        logger.warning("Session failed: id=%s error=%s", session_id, error[:200])

    def get_resumable_sessions(
        self,
        org_id: str,
        user_id: str,
        limit: int = 10,
    ) -> List[SessionState]:
        """Get resumable sessions for a user."""
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT data FROM sessions
                    WHERE org_id = ? AND user_id = ?
                    AND status IN ('in_progress', 'paused', 'created')
                    ORDER BY updated_at DESC
                    LIMIT ?;
                    """,
                    (org_id, user_id, limit),
                ).fetchall()

                sessions = []
                now = _utc_now_timestamp()

                for row in rows:
                    session = SessionState.from_dict(json.loads(row["data"]))
                    # Check expiration
                    if session.expires_at:
                        expires_ts = datetime.fromisoformat(session.expires_at.replace("Z", "+00:00")).timestamp()
                        if now > expires_ts:
                            session.status = SessionStatus.EXPIRED
                            continue
                    sessions.append(session)

                return sessions
            finally:
                conn.close()

    def cleanup_expired(self) -> int:
        """Clean up expired sessions. Returns count of sessions cleaned."""
        now = _utc_now_iso()
        count = 0

        with self._lock:
            conn = self._connect()
            try:
                # Find expired sessions
                rows = conn.execute(
                    """
                    SELECT id FROM sessions
                    WHERE status NOT IN ('completed', 'expired')
                    AND json_extract(data, '$.expires_at') < ?;
                    """,
                    (now,),
                ).fetchall()

                for row in rows:
                    session_id = row["id"]
                    # Delete checkpoints first
                    conn.execute(
                        "DELETE FROM checkpoints WHERE session_id = ?;",
                        (session_id,),
                    )
                    # Update session status
                    conn.execute(
                        """
                        UPDATE sessions
                        SET status = 'expired', updated_at = ?
                        WHERE id = ?;
                        """,
                        (now, session_id),
                    )
                    count += 1
            finally:
                conn.close()

        if count > 0:
            logger.info("Cleaned up %d expired sessions", count)

        return count

    def get_stats(self) -> Dict[str, Any]:
        """Get session manager statistics."""
        with self._lock:
            conn = self._connect()
            try:
                total = conn.execute("SELECT COUNT(*) as c FROM sessions;").fetchone()["c"]
                by_status = conn.execute(
                    """
                    SELECT status, COUNT(*) as c
                    FROM sessions
                    GROUP BY status;
                    """
                ).fetchall()
                total_checkpoints = conn.execute("SELECT COUNT(*) as c FROM checkpoints;").fetchone()["c"]

                return {
                    "total_sessions": total,
                    "by_status": {row["status"]: row["c"] for row in by_status},
                    "total_checkpoints": total_checkpoints,
                }
            finally:
                conn.close()

    def get_memory_snapshot(self, session_id: str) -> Optional[Dict[str, Any]]:
        session = self.get_session(session_id)
        if not session:
            return None
        return session.memory.to_dict()


# Global session manager instance
_session_manager: Optional[SessionManager] = None
_manager_lock = threading.Lock()


def get_session_manager(db_path: Optional[str] = None) -> SessionManager:
    """Get or create the global session manager."""
    global _session_manager

    with _manager_lock:
        if _session_manager is None:
            if db_path is None:
                # Use default path
                import os
                from config import settings

                db_path = os.path.join(
                    os.path.dirname(settings.MEMORY_DB_PATH),
                    "sessions.sqlite3",
                )
            _session_manager = SessionManager(db_path)
        return _session_manager


def reset_session_manager() -> None:
    """Reset the global session manager (for testing)."""
    global _session_manager
    with _manager_lock:
        _session_manager = None
