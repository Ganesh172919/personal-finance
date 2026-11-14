"""Tenant-isolation regression tests for the AI Core (P0.1 / P0.2)."""

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api_service import app
from memory import MemoryStore
from memory.store import build_fts_match_query
from utils.session_manager import SessionManager


def _actor(org_id: str, user_id: str) -> dict:
    return {"x-internal-org-id": org_id, "x-internal-user-id": user_id}


# --------------------------------------------------------------------------- #
# Session ownership
# --------------------------------------------------------------------------- #


@pytest.fixture()
def manager():
    with tempfile.TemporaryDirectory() as tmp:
        yield SessionManager(db_path=str(Path(tmp) / "sessions.sqlite3"))


def test_ensure_session_returns_own_session(manager):
    created = manager.create_session(org_id="org-a", user_id="user-a", original_input="hi")
    resumed = manager.ensure_session(org_id="org-a", user_id="user-a", session_id=created.id)
    assert resumed.id == created.id


def test_ensure_session_never_returns_another_tenants_session(manager):
    victim = manager.create_session(org_id="org-a", user_id="user-a", original_input="secret plan")

    # Same org, different user, and a different org entirely.
    for org_id, user_id in (("org-a", "user-b"), ("org-b", "user-a"), ("org-b", "user-b")):
        session = manager.ensure_session(org_id=org_id, user_id=user_id, session_id=victim.id)
        assert session.id != victim.id
        assert (session.org_id, session.user_id) == (org_id, user_id)

    # The victim's session is untouched.
    intact = manager.get_session(victim.id)
    assert (intact.org_id, intact.user_id) == ("org-a", "user-a")
    assert intact.original_input == "secret plan"


def test_ensure_session_unknown_id_is_created_for_caller(manager):
    session = manager.ensure_session(org_id="org-a", user_id="user-a", session_id="sess_client_chosen")
    assert session.id == "sess_client_chosen"
    assert (session.org_id, session.user_id) == ("org-a", "user-a")


# --------------------------------------------------------------------------- #
# Actor resolution on HTTP routes
# --------------------------------------------------------------------------- #


def test_memory_routes_require_actor_headers():
    client = TestClient(app)
    assert client.get("/api/memory?org_id=o&user_id=u").status_code == 403
    assert (
        client.post(
            "/api/memory/upsert",
            json={"org_id": "o", "user_id": "u", "key": "k", "value": "v"},
        ).status_code
        == 403
    )


def test_memory_routes_reject_body_or_query_ids_that_differ_from_actor():
    client = TestClient(app)
    # Header says org-a/user-a; query tries to read org-b/user-b.
    res = client.get("/api/memory?org_id=org-b&user_id=user-b", headers=_actor("org-a", "user-a"))
    assert res.status_code == 403

    res = client.post(
        "/api/memory/upsert",
        headers=_actor("org-a", "user-a"),
        json={"org_id": "org-b", "user_id": "user-b", "key": "k", "value": "v"},
    )
    assert res.status_code == 403


def test_process_rejects_mismatched_actor_instead_of_falling_back():
    client = TestClient(app)
    res = client.post(
        "/api/agents/process",
        headers=_actor("org-a", "user-a"),
        json={"user_input": "hello", "org_id": "org-b", "user_id": "user-b"},
    )
    # Must be a hard 403, not the swallowed success=True fallback plan.
    assert res.status_code == 403


def test_process_requires_headers_in_strict_mode(monkeypatch):
    monkeypatch.setenv("AI_CORE_REQUIRE_ACTOR_HEADERS", "true")
    client = TestClient(app)
    res = client.post("/api/agents/process", json={"user_input": "hello", "org_id": "o", "user_id": "u"})
    assert res.status_code == 403


def test_process_stream_rejects_mismatched_actor():
    client = TestClient(app)
    res = client.post(
        "/api/agents/process/stream",
        headers=_actor("org-a", "user-a"),
        json={"user_input": "hello", "org_id": "org-b", "user_id": "user-b"},
    )
    assert res.status_code == 403


# --------------------------------------------------------------------------- #
# FTS5 query sanitising
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "text, expected",
    [
        ("envelope budgeting", '"envelope" OR "budgeting"'),
        ("what's my emergency fund?", '"what" OR "my" OR "emergency" OR "fund"'),
        ("NOT AND OR NEAR", '"not" OR "and" OR "or" OR "near"'),
        ('say "hello" -world*', '"say" OR "hello" OR "world"'),
        ("a b", ""),  # single-character tokens carry no signal
        ("", ""),
        ("???", ""),
    ],
)
def test_build_fts_match_query_quotes_every_token(text, expected):
    assert build_fts_match_query(text) == expected


def test_build_fts_match_query_caps_terms():
    text = " ".join(f"term{i}" for i in range(100))
    assert build_fts_match_query(text).count(" OR ") == 11  # 12 terms


@pytest.mark.parametrize(
    "query",
    [
        "what is my budget?",
        'quote " inside',
        "dash-separated co-pay",
        "col:on",
        "star* wildcard",
        "NOT",
        "AND OR NEAR",
        "(unbalanced",
        "café naïve résumé",
        "100% of $5_000",
    ],
)
def test_memory_search_survives_hostile_queries(query):
    with tempfile.TemporaryDirectory() as tmp:
        store = MemoryStore(db_path=str(Path(tmp) / "memory.sqlite3"))
        store.upsert_many(
            org_id="org",
            user_id="user",
            records=[
                ("budget", "what is my budget? about 5_000 per month", 0.9, "explicit"),
                ("coffee", "café naïve résumé", 0.9, "explicit"),
            ],
        )
        store.search(org_id="org", user_id="user", query=query, limit=5)  # must not raise
        assert store.fts_error_count == 0


def test_memory_search_finds_natural_language_question():
    with tempfile.TemporaryDirectory() as tmp:
        store = MemoryStore(db_path=str(Path(tmp) / "memory.sqlite3"))
        store.upsert_many(
            org_id="org",
            user_id="user",
            records=[("budgeting_style", "prefer envelope budgeting", 0.9, "explicit")],
        )
        # A question mark used to raise an FTS5 syntax error that was swallowed upstream.
        hits = store.search(org_id="org", user_id="user", query="Should I use envelope budgeting?", limit=5)
        assert [h.key for h in hits] == ["budgeting_style"]


def test_memory_search_is_tenant_scoped():
    with tempfile.TemporaryDirectory() as tmp:
        store = MemoryStore(db_path=str(Path(tmp) / "memory.sqlite3"))
        store.upsert_many(org_id="org-a", user_id="user-a", records=[("k", "envelope budgeting", 0.9, "explicit")])
        assert store.search(org_id="org-b", user_id="user-a", query="envelope", limit=5) == []
        assert store.search(org_id="org-a", user_id="user-b", query="envelope", limit=5) == []
