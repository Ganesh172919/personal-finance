"""
Workflow session continuity tests.
"""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone

from graph.workflow import FinancialWorkflow
from utils.session_manager import CheckpointPhase, SessionManager


def test_workflow_creates_and_resumes_session():
    fd, path = tempfile.mkstemp(suffix=".sqlite3")
    os.close(fd)

    try:
        workflow = FinancialWorkflow()
        workflow._session_manager = SessionManager(path)

        profile = {
            "age": 32,
            "annual_income": 90000,
            "monthly_expenses": 4000,
            "savings": 15000,
            "debts": [],
            "financial_goals": [],
            "risk_tolerance": "moderate",
            "investment_experience": "beginner",
            "time_horizon": 10,
            "transactions": [],
            "currency": "USD",
        }

        first = workflow.process_request(
            "Help me make a budget plan",
            profile,
            org_id="org_1",
            user_id="user_1",
            options={"narrative": False},
        )

        session_id = first.get("session_id")
        assert session_id
        assert first.get("recovered_from_checkpoint") is False

        resumed = workflow.process_request(
            "Continue this budget work",
            profile,
            org_id="org_1",
            user_id="user_1",
            session_id=session_id,
            resume_from_checkpoint=True,
            options={"narrative": False},
        )

        assert resumed.get("session_id") == session_id
        assert resumed.get("recovered_from_checkpoint") is True
        assert resumed.get("phase") == "complete"
    finally:
        os.unlink(path)


def test_workflow_resumes_legacy_complete_checkpoint_with_scalar_output():
    fd, path = tempfile.mkstemp(suffix=".sqlite3")
    os.close(fd)

    try:
        workflow = FinancialWorkflow()
        manager = SessionManager(path)
        workflow._session_manager = manager

        profile = {
            "age": 32,
            "annual_income": 90000,
            "monthly_expenses": 4000,
            "savings": 15000,
            "debts": [],
            "financial_goals": [],
            "risk_tolerance": "moderate",
            "investment_experience": "beginner",
            "time_horizon": 10,
            "transactions": [],
            "currency": "USD",
        }

        session = manager.create_session(
            "org_1",
            "user_1",
            original_input="Help me make a budget plan",
            original_profile=profile,
        )

        checkpoint_data = {
            "id": "ckpt_legacy_complete",
            "session_id": session.id,
            "phase": CheckpointPhase.COMPLETE.value,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "state_data": {"phase": "complete", "current_analysis": {}},
            "agent_outputs": "Legacy scalar final output",
            "context_summary": "Budget plan complete",
            "agent_name": "master_agent",
            "input_tokens": 0,
            "output_tokens": 0,
            "latency_ms": 0.0,
            "error": None,
        }

        conn = manager._connect()
        try:
            conn.execute(
                """
                INSERT INTO checkpoints (id, session_id, phase, created_at, data)
                VALUES (?, ?, ?, ?, ?);
                """,
                (
                    checkpoint_data["id"],
                    checkpoint_data["session_id"],
                    checkpoint_data["phase"],
                    checkpoint_data["created_at"],
                    json.dumps(checkpoint_data),
                ),
            )
        finally:
            conn.close()

        resumed = workflow.process_request(
            "Continue this budget work",
            profile,
            org_id="org_1",
            user_id="user_1",
            session_id=session.id,
            resume_from_checkpoint=True,
            options={"narrative": False},
        )

        assert resumed.get("session_id") == session.id
        assert resumed.get("recovered_from_checkpoint") is True
        assert resumed.get("error") is None
    finally:
        os.unlink(path)
