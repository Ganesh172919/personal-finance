"""
Tests for session manager with checkpointing and resumable state.
"""

import json
import os
import tempfile
import time
import pytest
from pathlib import Path

from utils.session_manager import (
    SessionManager,
    SessionState,
    SessionCheckpoint,
    SessionStatus,
    CheckpointPhase,
    CompactedMemory,
    get_session_manager,
    reset_session_manager,
)


@pytest.fixture
def temp_db_path():
    """Create a temporary database file."""
    fd, path = tempfile.mkstemp(suffix=".sqlite3")
    os.close(fd)
    yield path
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


@pytest.fixture
def session_manager(temp_db_path):
    """Create a session manager with a temporary database."""
    return SessionManager(temp_db_path)


@pytest.fixture(autouse=True)
def reset_global_manager():
    """Reset global session manager before each test."""
    reset_session_manager()
    yield
    reset_session_manager()


class TestSessionCreation:
    """Tests for session creation."""

    def test_create_session(self, session_manager):
        session = session_manager.create_session(
            org_id="org_123",
            user_id="user_456",
            original_input="Help me budget",
        )

        assert session.id.startswith("sess_")
        assert session.org_id == "org_123"
        assert session.user_id == "user_456"
        assert session.original_input == "Help me budget"
        assert session.status == SessionStatus.CREATED
        assert session.current_phase == CheckpointPhase.ROUTING
        assert session.expires_at is not None

    def test_create_session_with_profile(self, session_manager):
        profile = {"age": 30, "income": 50000}
        session = session_manager.create_session(
            org_id="org_123",
            user_id="user_456",
            original_profile=profile,
        )

        assert session.original_profile == profile

    def test_create_session_custom_expiration(self, session_manager):
        session = session_manager.create_session(
            org_id="org_123",
            user_id="user_456",
            expiration_hours=1.0,  # 1 hour
        )

        assert session.expires_at is not None


class TestSessionRetrieval:
    """Tests for session retrieval."""

    def test_get_session(self, session_manager):
        created = session_manager.create_session("org_1", "user_1")

        retrieved = session_manager.get_session(created.id)

        assert retrieved is not None
        assert retrieved.id == created.id
        assert retrieved.org_id == "org_1"

    def test_get_nonexistent_session(self, session_manager):
        result = session_manager.get_session("sess_nonexistent")
        assert result is None

    def test_get_resumable_sessions(self, session_manager):
        # Create sessions in different states
        s1 = session_manager.create_session("org_1", "user_1")
        s2 = session_manager.create_session("org_1", "user_1")
        s3 = session_manager.create_session("org_1", "user_1")

        # Mark one as completed
        session_manager.complete_session(s3.id)

        resumable = session_manager.get_resumable_sessions("org_1", "user_1")

        # Should only return non-completed sessions
        ids = [s.id for s in resumable]
        assert s1.id in ids
        assert s2.id in ids
        assert s3.id not in ids


class TestSessionUpdate:
    """Tests for session updates."""

    def test_update_session(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")
        original_updated_at = session.updated_at

        session.status = SessionStatus.IN_PROGRESS
        session_manager.update_session(session)

        retrieved = session_manager.get_session(session.id)
        assert retrieved.status == SessionStatus.IN_PROGRESS
        assert retrieved.updated_at != original_updated_at

    def test_complete_session(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")

        session_manager.complete_session(session.id, {"result": "success"})

        retrieved = session_manager.get_session(session.id)
        assert retrieved.status == SessionStatus.COMPLETED
        assert retrieved.current_phase == CheckpointPhase.COMPLETE

    def test_complete_session_wraps_scalar_output_for_checkpoint(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")

        session_manager.complete_session(session.id, "done")

        checkpoint = session_manager.get_latest_checkpoint(session.id)
        assert checkpoint is not None
        assert checkpoint.agent_outputs == {"final_output": "done"}

    def test_fail_session(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")

        session_manager.fail_session(session.id, "API timeout")

        retrieved = session_manager.get_session(session.id)
        assert retrieved.status == SessionStatus.FAILED
        assert retrieved.current_phase == CheckpointPhase.ERROR
        assert retrieved.last_error == "API timeout"
        assert retrieved.error_count == 1


class TestCheckpoints:
    """Tests for checkpoint management."""

    def test_save_checkpoint(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")

        checkpoint = session_manager.save_checkpoint(
            session_id=session.id,
            phase=CheckpointPhase.PLANNING,
            state_data={"current_step": 1},
            agent_name="budget_planner",
            input_tokens=100,
            output_tokens=50,
            latency_ms=250.0,
        )

        assert checkpoint.id.startswith("ckpt_")
        assert checkpoint.session_id == session.id
        assert checkpoint.phase == CheckpointPhase.PLANNING
        assert checkpoint.agent_name == "budget_planner"
        assert checkpoint.input_tokens == 100

    def test_save_multiple_checkpoints(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")

        # Save checkpoints for different phases
        session_manager.save_checkpoint(session.id, CheckpointPhase.ROUTING)
        session_manager.save_checkpoint(session.id, CheckpointPhase.PLANNING)
        session_manager.save_checkpoint(session.id, CheckpointPhase.EXECUTION)

        checkpoints = session_manager.get_checkpoints(session.id)

        assert len(checkpoints) == 3
        # Should be in reverse chronological order
        assert checkpoints[0].phase == CheckpointPhase.EXECUTION
        assert checkpoints[2].phase == CheckpointPhase.ROUTING

    def test_get_latest_checkpoint(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")

        session_manager.save_checkpoint(session.id, CheckpointPhase.ROUTING)
        session_manager.save_checkpoint(session.id, CheckpointPhase.PLANNING)
        session_manager.save_checkpoint(session.id, CheckpointPhase.EXECUTION)

        latest = session_manager.get_latest_checkpoint(session.id)

        assert latest.phase == CheckpointPhase.EXECUTION

    def test_get_latest_checkpoint_by_phase(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")

        session_manager.save_checkpoint(session.id, CheckpointPhase.ROUTING)
        session_manager.save_checkpoint(session.id, CheckpointPhase.PLANNING)
        session_manager.save_checkpoint(session.id, CheckpointPhase.EXECUTION)

        planning_ckpt = session_manager.get_latest_checkpoint(session.id, phase=CheckpointPhase.PLANNING)

        assert planning_ckpt.phase == CheckpointPhase.PLANNING

    def test_checkpoint_updates_session(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")
        assert session.checkpoint_count == 0

        session_manager.save_checkpoint(
            session.id,
            CheckpointPhase.PLANNING,
            input_tokens=100,
            output_tokens=50,
        )

        updated = session_manager.get_session(session.id)
        assert updated.checkpoint_count == 1
        assert updated.current_phase == CheckpointPhase.PLANNING
        assert updated.status == SessionStatus.IN_PROGRESS
        assert updated.memory.total_input_tokens == 100
        assert updated.memory.total_output_tokens == 50

    def test_checkpoint_with_error(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")

        session_manager.save_checkpoint(
            session.id,
            CheckpointPhase.ERROR,
            error="Model unavailable",
        )

        updated = session_manager.get_session(session.id)
        assert updated.error_count == 1
        assert updated.last_error == "Model unavailable"


class TestMemoryCompaction:
    """Tests for memory compaction."""

    def test_compact_memory_rolling_summary(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")

        # Add first chunk
        memory = session_manager.compact_memory(
            session.id,
            new_summary_chunk="User asked about budgeting.",
        )

        assert "budgeting" in memory.rolling_summary

        # Add second chunk
        memory = session_manager.compact_memory(
            session.id,
            new_summary_chunk="User has $5000 monthly income.",
        )

        assert "budgeting" in memory.rolling_summary
        assert "monthly income" in memory.rolling_summary

    def test_compact_memory_truncates_long_summary(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")

        # Add a very long summary
        long_text = "x" * 5000
        memory = session_manager.compact_memory(
            session.id,
            new_summary_chunk=long_text,
        )

        assert len(memory.rolling_summary) <= SessionManager.MAX_SUMMARY_LENGTH

    def test_compact_memory_decisions(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")

        # Add decisions
        decisions = [
            {"id": "d1", "action": "set_budget", "amount": 1000},
            {"id": "d2", "action": "create_goal", "name": "vacation"},
        ]

        memory = session_manager.compact_memory(
            session.id,
            new_decisions=decisions,
        )

        assert len(memory.recent_decisions) == 2
        assert memory.recent_decisions[0]["id"] == "d1"

    def test_compact_memory_limits_decisions(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")

        # Add more decisions than the limit
        for i in range(15):
            session_manager.compact_memory(
                session.id,
                new_decisions=[{"id": f"d{i}"}],
            )

        session = session_manager.get_session(session.id)
        assert len(session.memory.recent_decisions) <= SessionManager.MAX_RECENT_DECISIONS

    def test_compact_memory_goals(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")

        # Add goals
        goals = [
            {"id": "g1", "title": "Save for vacation"},
            {"id": "g2", "title": "Pay off debt"},
        ]

        memory = session_manager.compact_memory(
            session.id,
            new_goals=goals,
        )

        assert len(memory.unresolved_goals) == 2

        # Resolve one goal
        memory = session_manager.compact_memory(
            session.id,
            resolved_goal_ids=["g1"],
        )

        assert len(memory.unresolved_goals) == 1
        assert memory.unresolved_goals[0]["id"] == "g2"


class TestUserFacts:
    """Tests for user fact storage."""

    def test_add_user_fact(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")

        session_manager.add_user_fact(session.id, "income", 5000)
        session_manager.add_user_fact(session.id, "risk_tolerance", "moderate")

        updated = session_manager.get_session(session.id)
        assert updated.memory.user_facts["income"] == 5000
        assert updated.memory.user_facts["risk_tolerance"] == "moderate"


class TestArtifactRefs:
    """Tests for artifact reference storage."""

    def test_add_artifact_ref(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")

        session_manager.add_artifact_ref(session.id, "plan_123")
        session_manager.add_artifact_ref(session.id, "budget_456")

        updated = session_manager.get_session(session.id)
        assert "plan_123" in updated.memory.artifact_refs
        assert "budget_456" in updated.memory.artifact_refs

    def test_add_duplicate_artifact_ref(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")

        session_manager.add_artifact_ref(session.id, "plan_123")
        session_manager.add_artifact_ref(session.id, "plan_123")  # Duplicate

        updated = session_manager.get_session(session.id)
        assert updated.memory.artifact_refs.count("plan_123") == 1


class TestSessionExpiration:
    """Tests for session expiration and cleanup."""

    def test_cleanup_expired_sessions(self, session_manager):
        # Create a session with very short expiration
        session = session_manager.create_session(
            "org_1",
            "user_1",
            expiration_hours=0.0001,  # ~0.36 seconds
        )

        # Save a checkpoint
        session_manager.save_checkpoint(session.id, CheckpointPhase.PLANNING)

        # Wait for expiration
        time.sleep(0.5)

        # Cleanup
        cleaned = session_manager.cleanup_expired()

        assert cleaned >= 1

    def test_expired_sessions_not_in_resumable(self, session_manager):
        # Create a session with very short expiration
        session = session_manager.create_session(
            "org_1",
            "user_1",
            expiration_hours=0.0001,
        )

        # Wait for expiration
        time.sleep(0.5)

        resumable = session_manager.get_resumable_sessions("org_1", "user_1")

        # Should not include expired session
        ids = [s.id for s in resumable]
        assert session.id not in ids


class TestSessionStats:
    """Tests for session statistics."""

    def test_get_stats(self, session_manager):
        # Create sessions in various states
        s1 = session_manager.create_session("org_1", "user_1")
        s2 = session_manager.create_session("org_1", "user_1")
        s3 = session_manager.create_session("org_1", "user_1")

        session_manager.save_checkpoint(s1.id, CheckpointPhase.PLANNING)
        session_manager.complete_session(s2.id)
        session_manager.fail_session(s3.id, "error")

        stats = session_manager.get_stats()

        assert stats["total_sessions"] == 3
        assert "in_progress" in stats["by_status"]
        assert "completed" in stats["by_status"]
        assert "failed" in stats["by_status"]


class TestDataclassSerialization:
    """Tests for dataclass serialization."""

    def test_session_state_to_dict(self, session_manager):
        session = session_manager.create_session(
            "org_1",
            "user_1",
            original_input="test",
        )

        data = session.to_dict()

        assert data["id"] == session.id
        assert data["org_id"] == "org_1"
        assert data["status"] == "created"
        assert "memory" in data

    def test_session_state_from_dict(self):
        data = {
            "id": "sess_test",
            "org_id": "org_1",
            "user_id": "user_1",
            "status": "in_progress",
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
            "current_phase": "planning",
            "memory": {"rolling_summary": "test summary"},
        }

        session = SessionState.from_dict(data)

        assert session.id == "sess_test"
        assert session.status == SessionStatus.IN_PROGRESS
        assert session.current_phase == CheckpointPhase.PLANNING
        assert session.memory.rolling_summary == "test summary"

    def test_checkpoint_serialization(self, session_manager):
        session = session_manager.create_session("org_1", "user_1")
        checkpoint = session_manager.save_checkpoint(
            session.id,
            CheckpointPhase.PLANNING,
            state_data={"step": 1},
            agent_outputs={"budget": 1000},
        )

        data = checkpoint.to_dict()
        restored = SessionCheckpoint.from_dict(data)

        assert restored.id == checkpoint.id
        assert restored.phase == CheckpointPhase.PLANNING
        assert restored.state_data["step"] == 1
        assert restored.agent_outputs["budget"] == 1000
