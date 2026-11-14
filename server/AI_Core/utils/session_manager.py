r"""
Session Manager with Checkpointing and Resumable State.

Provides persistent session state for long-running multi-agent workflows:
- Session checkpoints saved at each agent phase
- Resumable state after failures or restarts
- Memory compaction with rolling summaries
- Artifact storage for intermediate results

================================================================================
MINDMAP FLOW: SESSION LIFECYCLE & STATE CHECKPOINTING
================================================================================
- Session & Checkpoint Management Engine
    ├── 1. Session Lifecycle State Machine
    │   ├── CREATED: Initial session instantiation with org_id & user_id
    │   ├── IN_PROGRESS: Active multi-agent execution
    │   ├── PAUSED: Suspended waiting for user confirmation or async task
    │   ├── COMPLETED: Successful end-to-end synthesis & delivery
    │   ├── FAILED: Unrecoverable workflow failure recorded
    │   └── EXPIRED: TTL timeout eviction
    ├── 2. Multi-Phase Checkpointing Engine
    │   ├── Phases: ROUTING -> PLANNING -> RESEARCH -> EXECUTION -> VERIFICATION -> SYNTHESIS -> COMPLETE
    │   ├── Checkpoint Payload: state_data, agent_outputs, context_summary, telemetry
    │   └── Output Normalization: Backward-compatible scalar/string to dict mapping
    ├── 3. Pluggable Persistence (memory/state_store.py)
    │   ├── MongoStateStore (default with a Mongo URI): TTL-indexed sessions (24h) & checkpoints (7d)
    │   ├── SqliteStateStore (local dev / tests)
    │   └── Checkpoints at request start & end only (AI_CORE_CHECKPOINT_MODE=boundary)
    ├── 4. Memory Compaction & Context Pruning
    │   ├── Rolling Summaries: Compresses chat & execution history to prevent context overflow
    │   └── Truncation & Token Budgeting: Limits context window per LLM call
    └── 5. Resumption & Crash Recovery Flow
        ├── Latest Checkpoint Retrieval
        ├── State Reconstruction & Edge Re-eval
        └── Replay Execution from Failure Boundary

================================================================================
ASCII FLOW: CHECKPOINTING & RECOVERY LIFECYCLE
================================================================================
         Client Request: create_session(org_id, user_id)
                                |
                                v
               +----------------------------------+
               |  Session Created (Status: CREATED)|
               |  Persisted via the StateStore    |
               +----------------+-----------------+
                                |
                   Phase 1: ROUTING Node
                                |
                                v
               +----------------------------------+
               |  save_checkpoint(Phase.ROUTING)  |
               |  Captures: routing intent & plan |
               +----------------+-----------------+
                                |
                   Phase 2: EXECUTION Node
                                |
                                v
               +----------------------------------+
               | save_checkpoint(Phase.EXECUTION) |
               | Captures: Subagent outputs & data|
               +----------------+-----------------+
                                |
             +------------------+------------------+
             |                                     |
       [ Normal Flow ]                     [ System Crash / Worker Dies ]
             |                                     |
             v                                     v
   Phase 3: VERIFICATION                 Worker Reboots / Resumes Session
             |                                     |
             v                                     v
   save_checkpoint(VERIFICATION)         get_latest_checkpoint(session_id)
             |                                     |
             v                                     v
     Phase 4: SYNTHESIS                  Reconstruct AgentState Dict
             |                                     |
             v                                     +-----> Resume at VERIFICATION!
   SessionStatus: COMPLETED

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
import os
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from memory.state_store import SessionExistsError, SqliteStateStore, StateStore

logger = logging.getLogger(__name__)


# Generates current UTC timestamp formatted as an ISO 8601 string.
# Obtains current datetime using timezone-aware UTC clock.
# Returns string representation for state and checkpoint timestamps.
def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Calculates current UTC epoch timestamp as a floating-point number.
# Queries datetime module with timezone-aware UTC clock.
# Returns epoch seconds float used for duration and expiration tracking.
def _utc_now_timestamp() -> float:
    return datetime.now(timezone.utc).timestamp()


# Normalizes heterogeneous agent output payloads into a dictionary structure.
# Decodes JSON string outputs or wraps scalar primitives into mapping.
# Returns standard dictionary ensuring backward compatibility during recovery.
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


# Enumeration of session lifecycle states across multi-agent workflows.
# Defines states including created, in progress, paused, completed, and failed.
# Tracks operational progress and eligibility for resumption or cleanup.
class SessionStatus(Enum):
    """Session lifecycle status."""

    CREATED = "created"
    IN_PROGRESS = "in_progress"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"


# Enumeration defining sequential multi-agent execution checkpoint phases.
# Spans routing, planning, research, execution, verification, and synthesis.
# Marks workflow boundaries where intermediate progress is checkpointed.
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


# Dataclass capturing workflow state and intermediate outputs at a phase boundary.
# Records state data, agent results, context summary, and execution latency.
# Enables crash recovery and auditability for long-running workflows.
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

    # Serializes checkpoint attributes into standard dictionary representation.
    # Converts phase enum and timestamps into JSON-serializable primitives.
    # Returns structured dictionary suitable for state store persistence.
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

    # Reconstructs SessionCheckpoint instance from persisted dictionary data.
    # Parses phase enum and normalizes historical agent output structures.
    # Returns validated SessionCheckpoint ready for state recovery.
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


# Dataclass maintaining compacted contextual memory across extended sessions.
# Tracks persistent user facts, rolling summaries, decisions, and artifacts.
# Prunes redundant history to operate within LLM context window budgets.
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

    # Converts compacted memory state into JSON-compatible dictionary.
    # Serializes user facts, decision history, and token consumption counters.
    # Returns serializable dictionary representation of compacted session state.
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

    # Deserializes dictionary data into a CompactedMemory dataclass instance.
    # Restores extracted facts, rolling summaries, and token statistics.
    # Returns initialized CompactedMemory instance for session reconstruction.
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


# Dataclass representing the complete persistent state of a user session.
# Maintains tenant identity, current phase, compacted memory, and errors.
# Powers end-to-end workflow resumption, auditing, and progress tracking.
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

    # Serializes complete session state into serializable dictionary format.
    # Converts status and phase enums along with nested compacted memory.
    # Returns dictionary suitable for database storage and client responses.
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

    # Deserializes dictionary payload into fully reconstituted SessionState object.
    # Parses status enums, timestamps, and nested compacted memory structures.
    # Returns SessionState instance for ongoing workflow execution.
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


# Dataclass tracking in-memory write-behind state for an active request.
# Holds pending session state mutations and uncommitted checkpoint payloads.
# Optimizes throughput by deferring database writes to request boundaries.
@dataclass
class _InFlight:
    """Write-behind state for one running request (see ``checkpoint_mode``)."""

    started_at: float = field(default_factory=time.monotonic)
    session: Optional[SessionState] = None
    pending: Optional[SessionCheckpoint] = None


# Creates an independent deep clone of a SessionState instance via dictionary round-trip.
# Ensures session mutations do not corrupt previously captured state copies.
# Returns duplicate SessionState instance safe for isolated modification.
def _copy_session(session: SessionState) -> SessionState:
    return SessionState.from_dict(session.to_dict())


# Central session and checkpoint coordinator for multi-agent workflows.
# Manages persistent execution sessions, state checkpoints, and memory compaction.
# Supports boundary-mode write-behind buffering and pluggable persistence stores.
class SessionManager:
    """
    Manages persistent session state for long-running workflows.

    Persistence is delegated to a ``StateStore`` (MongoDB in production, SQLite
    for local dev/tests).  ``SessionManager(path)`` keeps working and pins a
    SQLite file; ``SessionManager(store)`` takes any ``StateStore``.

    Checkpoint policy (``AI_CORE_CHECKPOINT_MODE``):

    * ``boundary`` (default) - callers that pass ``deferred=True`` (the workflow
      nodes) persist only the *first* checkpoint of a request (start) and the
      terminal one written by ``complete_session`` / ``fail_session`` (end).
      Intermediate node checkpoints and session-memory compaction are coalesced
      in process and flushed with the end-of-request write.
    * ``every_node`` - every call persists immediately (legacy behaviour).

    Direct callers (``deferred=False``) always persist immediately.
    """

    # Maximum decisions to keep in memory
    MAX_RECENT_DECISIONS = 10

    # Maximum unresolved goals
    MAX_UNRESOLVED_GOALS = 20

    # Maximum rolling summary length (characters)
    MAX_SUMMARY_LENGTH = 4000

    # Session expiration (24 hours)
    DEFAULT_EXPIRATION_HOURS = 24

    # In-flight write-behind entries older than this are dropped (crashed request).
    INFLIGHT_MAX_AGE_SECONDS = 900.0

    # Initializes SessionManager with designated StateStore and checkpoint mode.
    # Configures database connection path, in-flight buffer, and re-entrant lock.
    # Establishes checkpointing policy supporting either boundary or per-node modes.
    def __init__(
        self,
        store: Any = None,
        *,
        db_path: Optional[str] = None,
        checkpoint_mode: Optional[str] = None,
    ):
        if store is None:
            if db_path is None:
                raise TypeError("SessionManager requires a StateStore or db_path")
            store = db_path
        if isinstance(store, (str, Path)):
            store = SqliteStateStore(str(store))
        self._store: StateStore = store
        self.db_path = getattr(store, "db_path", None)
        mode = (checkpoint_mode or os.getenv("AI_CORE_CHECKPOINT_MODE") or "boundary").strip().lower()
        self.checkpoint_mode = mode if mode in {"boundary", "every_node"} else "boundary"
        self._lock = threading.RLock()
        self._inflight: Dict[str, _InFlight] = {}

    # Exposes reference to the underlying active StateStore persistence backend.
    # Returns StateStore implementation managing sessions and checkpoints.
    # Enables external inspection of database storage engine properties.
    @property
    def store(self) -> StateStore:
        return self._store

    # Obtains raw SQLite database connection for test setup and diagnostics.
    # Verifies that active storage backend is SQLite before returning connection.
    # Raises RuntimeError if attempted against non-SQLite storage backends.
    def _connect(self):
        """SQLite connection (tests that seed rows directly); SQLite backend only."""
        connect = getattr(self._store, "_connect", None)
        if connect is None:
            raise RuntimeError(f"_connect is only available for the sqlite backend (got {self._store.backend})")
        return connect()

    # -- doc conversion -----------------------------------------------------
    # Converts SessionState instance into standardized persistence dictionary document.
    # Normalizes metadata attributes including IDs, timestamps, and serialized data.
    # Returns dictionary formatted for database insert and update operations.
    @staticmethod
    def _session_doc(session: SessionState) -> Dict[str, Any]:
        return {
            "id": session.id,
            "org_id": session.org_id,
            "user_id": session.user_id,
            "status": session.status.value,
            "created_at": session.created_at,
            "updated_at": session.updated_at,
            "expires_at": session.expires_at,
            "data": session.to_dict(),
        }

    # -- in-flight bookkeeping ---------------------------------------------
    # Evicts in-flight write-behind session buffers exceeding maximum allowable age.
    # Drops abandoned session buffers left behind by crashed worker processes.
    # Emits warning logs for each dropped session buffer to preserve memory.
    def _purge_stale_inflight(self) -> None:
        cutoff = time.monotonic() - self.INFLIGHT_MAX_AGE_SECONDS
        for sid in [sid for sid, flight in self._inflight.items() if flight.started_at < cutoff]:
            self._inflight.pop(sid, None)
            logger.warning("Dropped stale in-flight session buffer: id=%s", sid)

    # Determines whether checkpoint writes should be deferred to request boundaries.
    # Checks whether caller requested deferred write and boundary mode is active.
    # Returns boolean true if write-behind buffering should be applied.
    def _deferring(self, deferred: bool) -> bool:
        return bool(deferred) and self.checkpoint_mode == "boundary"

    # -- sessions -----------------------------------------------------------
    # Constructs and initializes a fresh SessionState instance with default values.
    # Calculates session expiration timestamp based on configured hours.
    # Returns newly created SessionState object ready for persistence.
    def _new_session(
        self,
        org_id: str,
        user_id: str,
        original_input: str,
        original_profile: Optional[Dict[str, Any]],
        expiration_hours: Optional[float],
        session_id: Optional[str] = None,
    ) -> SessionState:
        now = _utc_now_iso()
        expiration_hours = expiration_hours or self.DEFAULT_EXPIRATION_HOURS
        expires_at = datetime.fromtimestamp(_utc_now_timestamp() + expiration_hours * 3600, tz=timezone.utc).isoformat()
        return SessionState(
            id=session_id or f"sess_{uuid4().hex[:16]}",
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

    # Creates and persists a new workflow session in the active storage backend.
    # Initializes tenant ownership, original input parameters, and expiration.
    # Returns created SessionState object and logs session creation event.
    def create_session(
        self,
        org_id: str,
        user_id: str,
        original_input: str = "",
        original_profile: Optional[Dict[str, Any]] = None,
        expiration_hours: Optional[float] = None,
    ) -> SessionState:
        """Create a new session."""
        session = self._new_session(org_id, user_id, original_input, original_profile, expiration_hours)
        self._store.put_session(self._session_doc(session))
        logger.info(
            "Session created: id=%s org_id=%s user_id=%s expires_at=%s",
            session.id,
            org_id,
            user_id,
            session.expires_at,
        )
        return session

    # Resumes existing session if tenant authorization matches, or creates fresh session.
    # Enforces tenant isolation preventing unauthorized access to foreign sessions.
    # Falls back gracefully to unpersisted session if storage engine is unavailable.
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
        """Resume the caller's own session or create one.

        A session id is an opaque handle, never an authorization grant. If it
        belongs to another tenant/user, behave as if it did not exist and start
        a fresh session under a new id so the caller can neither read nor
        overwrite the foreign session.  If the state backend is unavailable the
        request still proceeds with an unpersisted session (fail soft).
        """
        try:
            if session_id:
                existing = self.get_session(session_id)
                if existing:
                    if existing.org_id == org_id and existing.user_id == user_id:
                        return existing
                    logger.warning(
                        "Session ownership mismatch: requested_id=%s caller_org_id=%s caller_user_id=%s; creating a new session",
                        session_id,
                        org_id,
                        user_id,
                    )
                else:
                    # Adopt the caller-supplied id for an unknown session. The insert
                    # is atomic: losing a race to another tenant falls through below.
                    session = self._new_session(
                        org_id, user_id, original_input, original_profile, expiration_hours, session_id=session_id
                    )
                    try:
                        self._store.put_session(self._session_doc(session))
                        return session
                    except SessionExistsError:
                        logger.warning("Session id collision on adopt: requested_id=%s; creating a new session", session_id)

            return self.create_session(
                org_id=org_id,
                user_id=user_id,
                original_input=original_input,
                original_profile=original_profile,
                expiration_hours=expiration_hours,
            )
        except Exception as exc:
            logger.warning(
                "session_store_unavailable",
                extra={"event": "session_store_unavailable", "error": str(exc)[:200], "backend": self._store.backend},
            )
            return self._new_session(org_id, user_id, original_input, original_profile, expiration_hours)

    # Retrieves session state by ID, incorporating pending in-memory buffer updates.
    # Checks active in-flight buffer first before querying underlying state store.
    # Returns deep copy of SessionState instance or none if not found.
    def get_session(self, session_id: str) -> Optional[SessionState]:
        """Get a session by ID (includes not-yet-flushed in-process changes)."""
        with self._lock:
            flight = self._inflight.get(session_id)
            if flight is not None and flight.session is not None:
                return _copy_session(flight.session)
        doc = self._store.get_session(session_id)
        return SessionState.from_dict(doc["data"]) if doc else None

    # Updates timestamps and persists session state to buffer or database.
    # Defers database writes to request boundary when deferred flag is set.
    # Synchronizes session updates across concurrent worker threads.
    def update_session(self, session: SessionState, deferred: bool = False) -> None:
        """Update a session. ``deferred`` coalesces the write into the end of the request."""
        session.updated_at = _utc_now_iso()
        session.last_active_at = session.updated_at
        with self._lock:
            flight = self._inflight.get(session.id)
            if flight is not None and self._deferring(deferred):
                flight.session = _copy_session(session)
                return
            self._store.save_session(self._session_doc(session))
            if flight is not None:
                flight.session = None

    # -- checkpoints --------------------------------------------------------
    # Persists a session checkpoint document into the underlying state store.
    # Updates the parent session state and increments checkpoint count.
    # Clears pending inflight checkpoint references for the target session.
    def _persist_checkpoint(self, checkpoint: SessionCheckpoint) -> None:
        """Write a checkpoint and fold its effect into the session document."""
        session = self.get_session(checkpoint.session_id)
        self._store.add_checkpoint(
            {
                "id": checkpoint.id,
                "session_id": checkpoint.session_id,
                "phase": checkpoint.phase.value,
                "created_at": checkpoint.created_at,
                "data": checkpoint.to_dict(),
            },
            org_id=session.org_id if session else "",
            user_id=session.user_id if session else "",
        )
        if session:
            session.checkpoint_count += 1
            self._apply_checkpoint_to_session(session, checkpoint)
            session.updated_at = _utc_now_iso()
            self._store.save_session(self._session_doc(session))
        flight = self._inflight.get(checkpoint.session_id)
        if flight is not None:
            flight.session = None
            if flight.pending is checkpoint:
                flight.pending = None

    # Applies checkpoint state updates directly onto an active session model.
    # Updates current phase, session status, and cumulative token usages.
    # Records any execution errors and increments the session error counter.
    @staticmethod
    def _apply_checkpoint_to_session(session: SessionState, checkpoint: SessionCheckpoint) -> None:
        session.current_phase = checkpoint.phase
        session.status = SessionStatus.IN_PROGRESS
        session.memory.total_input_tokens += checkpoint.input_tokens
        session.memory.total_output_tokens += checkpoint.output_tokens
        if checkpoint.error:
            session.error_count += 1
            session.last_error = checkpoint.error

    # Creates and records an execution checkpoint for an active session.
    # Buffers checkpoints during deferred execution to reduce database writes.
    # Returns the created session checkpoint instance with metadata.
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
        deferred: bool = False,
    ) -> SessionCheckpoint:
        """Save a checkpoint for a session.

        With ``deferred=True`` (workflow nodes) and ``checkpoint_mode=boundary``
        only the first checkpoint of a request is written now; later ones are
        held in process and the newest is flushed if the request fails.
        """
        checkpoint = SessionCheckpoint(
            id=f"ckpt_{uuid4().hex[:12]}",
            session_id=session_id,
            phase=phase,
            created_at=_utc_now_iso(),
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
            self._purge_stale_inflight()
            if self._deferring(deferred):
                flight = self._inflight.get(session_id)
                if flight is None:
                    # Start-of-request boundary: persist, then start buffering.
                    self._inflight[session_id] = _InFlight()
                else:
                    session = self.get_session(session_id)
                    if session:
                        self._apply_checkpoint_to_session(session, checkpoint)
                        flight.session = session
                    flight.pending = checkpoint
                    return checkpoint
            self._persist_checkpoint(checkpoint)

        logger.debug(
            "Checkpoint saved: id=%s session_id=%s phase=%s agent=%s",
            checkpoint.id,
            session_id,
            phase.value,
            agent_name,
        )
        return checkpoint

    # Retrieves all stored checkpoints for a session ordered by creation time.
    # Supports limiting output count and scoping by organization and user IDs.
    # Deserializes stored checkpoint documents into session checkpoint models.
    def get_checkpoints(
        self,
        session_id: str,
        limit: int = 50,
        *,
        org_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> List[SessionCheckpoint]:
        """Get all checkpoints for a session (newest first)."""
        docs = self._store.list_checkpoints(session_id, limit=limit, org_id=org_id, user_id=user_id)
        return [SessionCheckpoint.from_dict(d) for d in docs]

    # Queries the most recent checkpoint recorded for a specific session.
    # Allows filtering by specific workflow phase and tenant boundaries.
    # Returns the deserialized checkpoint instance or None if not found.
    def get_latest_checkpoint(
        self,
        session_id: str,
        phase: Optional[CheckpointPhase] = None,
        *,
        org_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> Optional[SessionCheckpoint]:
        """Get the latest checkpoint for a session."""
        docs = self._store.list_checkpoints(
            session_id, limit=1, phase=phase.value if phase else None, org_id=org_id, user_id=user_id
        )
        return SessionCheckpoint.from_dict(docs[0]) if docs else None

    # Truncates and compresses session memory to maintain context size limits.
    # Merges rolling summaries, appends recent decisions, and updates goals.
    # Persists updated memory state and returns the compacted memory object.
    def compact_memory(
        self,
        session_id: str,
        new_summary_chunk: str = "",
        new_decisions: Optional[List[Dict[str, Any]]] = None,
        new_goals: Optional[List[Dict[str, Any]]] = None,
        resolved_goal_ids: Optional[List[str]] = None,
        deferred: bool = False,
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
        self.update_session(session, deferred=deferred)

        return memory

    # Records a user-specific fact or preference key-value pair in memory.
    # Retrieves the target session and updates its user facts dictionary.
    # Persists the modified session state back to the backing store.
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

    # Appends a unique artifact reference identifier to session memory.
    # Verifies uniqueness to avoid duplicate artifact entries in history.
    # Updates and persists the modified session state to the store.
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

    # Marks a session as completed at the end of a request boundary.
    # Flushes any pending inflight checkpoints and records final output.
    # Updates the final session status and clears inflight tracking buffers.
    def complete_session(
        self,
        session_id: str,
        final_output: Optional[Any] = None,
    ) -> None:
        """Mark a session as completed (the end-of-request boundary)."""
        with self._lock:
            flight = self._inflight.get(session_id)
            if flight is not None and flight.pending is not None and not final_output:
                # No terminal checkpoint will carry the state: keep the newest one.
                self._persist_checkpoint(flight.pending)

            if not self.get_session(session_id):
                self._inflight.pop(session_id, None)
                return

            if final_output:
                self.save_checkpoint(
                    session_id=session_id,
                    phase=CheckpointPhase.COMPLETE,
                    agent_outputs=final_output,
                )

            session = self.get_session(session_id)
            if session:
                session.status = SessionStatus.COMPLETED
                session.current_phase = CheckpointPhase.COMPLETE
                self.update_session(session)
            self._inflight.pop(session_id, None)
        logger.info("Session completed: id=%s", session_id)

    # Marks an active session as failed and records the failure reason.
    # Persists pending checkpoints and logs an error phase checkpoint.
    # Transitions session status to failed and evicts inflight state.
    def fail_session(
        self,
        session_id: str,
        error: str,
    ) -> None:
        """Mark a session as failed (the end-of-request boundary)."""
        with self._lock:
            flight = self._inflight.get(session_id)
            if flight is not None and flight.pending is not None and flight.pending.phase != CheckpointPhase.ERROR:
                # Keep the newest partial progress so a retry can resume from it.
                self._persist_checkpoint(flight.pending)

            if not self.get_session(session_id):
                self._inflight.pop(session_id, None)
                return

            # The ERROR checkpoint records the error and bumps error_count once.
            self.save_checkpoint(
                session_id=session_id,
                phase=CheckpointPhase.ERROR,
                error=error,
            )

            session = self.get_session(session_id)
            if session:
                session.status = SessionStatus.FAILED
                session.current_phase = CheckpointPhase.ERROR
                session.last_error = error
                self.update_session(session)
            self._inflight.pop(session_id, None)
        logger.warning("Session failed: id=%s error=%s", session_id, error[:200])

    # Lists resumable sessions belonging to a specific user and organization.
    # Filters out sessions whose expiration timestamp has passed current time.
    # Returns a list of deserialized active SessionState instances.
    def get_resumable_sessions(
        self,
        org_id: str,
        user_id: str,
        limit: int = 10,
    ) -> List[SessionState]:
        """Get resumable sessions for a user."""
        sessions = []
        now = _utc_now_timestamp()
        for doc in self._store.list_resumable(org_id, user_id, limit):
            session = SessionState.from_dict(doc["data"])
            if session.expires_at:
                expires_ts = datetime.fromisoformat(session.expires_at.replace("Z", "+00:00")).timestamp()
                if now > expires_ts:
                    continue
            sessions.append(session)
        return sessions

    # Purges expired sessions from the backing persistence state store.
    # Evaluates overdue expiration timestamps against current UTC time.
    # Returns the total count of session documents successfully removed.
    def cleanup_expired(self) -> int:
        """Clean up expired sessions. Returns count of sessions cleaned."""
        count = self._store.expire_overdue(_utc_now_iso())
        if count > 0:
            logger.info("Cleaned up %d expired sessions", count)
        return count

    # Gathers diagnostic metrics and storage statistics for session management.
    # Collects backend details, active checkpoint mode, and session counts.
    # Returns a summary dictionary of session manager performance metrics.
    def get_stats(self) -> Dict[str, Any]:
        """Get session manager statistics."""
        return {**self._store.session_stats(), "backend": self._store.backend, "checkpoint_mode": self.checkpoint_mode}

    # Extracts a serializable snapshot of compacted memory for a session.
    # Retrieves session details and converts memory state to a dictionary.
    # Returns None if the specified session identifier does not exist.
    def get_memory_snapshot(self, session_id: str) -> Optional[Dict[str, Any]]:
        session = self.get_session(session_id)
        if not session:
            return None
        return session.memory.to_dict()


# Global session manager instance
_session_manager: Optional[SessionManager] = None
_manager_lock = threading.Lock()


# Provides a singleton accessor for the global session manager instance.
# Initializes SQLite or configured state store backends under thread lock.
# Returns the active SessionManager instance for the application runtime.
def get_session_manager(db_path: Optional[str] = None) -> SessionManager:
    """Get or create the global session manager.

    An explicit ``db_path`` pins a SQLite file; otherwise the backend comes from
    ``AI_CORE_STATE_BACKEND`` / the configured Mongo URI (``memory.state_store``).
    """
    global _session_manager

    with _manager_lock:
        if _session_manager is None:
            if db_path is not None:
                _session_manager = SessionManager(db_path)
            else:
                from memory.state_store import get_state_store

                _session_manager = SessionManager(get_state_store("sessions"))
        return _session_manager


# Resets the global session manager singleton instance reference.
# Acquires manager lock to ensure thread-safe cleanup for test environments.
# Nullifies the shared session manager reference across worker threads.
def reset_session_manager() -> None:
    """Reset the global session manager (for testing)."""
    global _session_manager
    with _manager_lock:
        _session_manager = None
