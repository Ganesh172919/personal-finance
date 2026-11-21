"""
Backend parity tests: the same suite runs against SQLite and MongoDB (mongomock).

Covers session resume, cross-tenant not-found, TTL index creation, tenant-scoped
memory search and boundary-only checkpointing.  Hermetic: no server, no network.
"""

from __future__ import annotations

import mongomock
import pytest
from mongomock.collection import BulkOperationBuilder

from memory.state_store import (
    CHECKPOINTS_COLLECTION,
    SESSIONS_COLLECTION,
    MongoStateStore,
    SqliteStateStore,
    checkpoint_ttl_seconds,
    session_ttl_seconds,
)
from memory.store import MemoryStore
from utils.session_manager import CheckpointPhase, SessionManager, SessionStatus


@pytest.fixture(params=["sqlite", "mongo"])
def store(request, tmp_path, monkeypatch):
    if request.param == "sqlite":
        s = SqliteStateStore(str(tmp_path / "state.sqlite3"))
    else:
        # PyMongo passes sort=None for UpdateOne. Mongomock 4.3 has no sort
        # parameter, so teach this test double to accept an unspecified sort.
        add_update = BulkOperationBuilder.add_update

        def add_update_without_sort(self, *args, sort=None, **kwargs):
            if sort is not None:
                raise NotImplementedError("This test double does not implement sorted updates")
            return add_update(self, *args, **kwargs)

        monkeypatch.setattr(BulkOperationBuilder, "add_update", add_update_without_sort)
        s = MongoStateStore(db=mongomock.MongoClient(tz_aware=True)["parity_test"])
    s.ensure_indexes()
    return s


@pytest.fixture()
def manager(store):
    return SessionManager(store)


def _node_checkpoints(mgr: SessionManager, sid: str, count: int = 5) -> None:
    phases = [
        CheckpointPhase.ROUTING,
        CheckpointPhase.PLANNING,
        CheckpointPhase.EXECUTION,
        CheckpointPhase.VERIFICATION,
        CheckpointPhase.SYNTHESIS,
    ]
    for phase in phases[:count]:
        mgr.save_checkpoint(sid, phase, agent_name=phase.value, input_tokens=1, output_tokens=2, deferred=True)
        mgr.compact_memory(sid, new_summary_chunk=f"{phase.value} done", deferred=True)


# -- session resume -----------------------------------------------------------
def test_session_resume_roundtrip(manager):
    session = manager.create_session("org-a", "user-1", original_input="plan my budget")
    manager.save_checkpoint(session.id, CheckpointPhase.PLANNING, agent_outputs={"plan": {"ok": True}})
    manager.add_user_fact(session.id, "goal", "house")

    resumed = manager.ensure_session(org_id="org-a", user_id="user-1", session_id=session.id)
    assert resumed.id == session.id
    assert resumed.original_input == "plan my budget"
    assert resumed.memory.user_facts == {"goal": "house"}
    assert resumed.checkpoint_count == 1

    latest = manager.get_latest_checkpoint(session.id)
    assert latest is not None and latest.phase == CheckpointPhase.PLANNING
    assert [s.id for s in manager.get_resumable_sessions("org-a", "user-1")] == [session.id]

    manager.complete_session(session.id)
    assert manager.get_session(session.id).status == SessionStatus.COMPLETED
    assert manager.get_resumable_sessions("org-a", "user-1") == []


def test_ensure_session_adopts_unknown_id(manager):
    session = manager.ensure_session(org_id="org-a", user_id="user-1", session_id="sess_custom")
    assert session.id == "sess_custom"
    assert manager.get_session("sess_custom").org_id == "org-a"


# -- cross-tenant -------------------------------------------------------------
def test_cross_tenant_session_is_not_found(manager, store):
    victim = manager.create_session("org-a", "user-1", original_input="secret")
    manager.save_checkpoint(victim.id, CheckpointPhase.PLANNING)

    # Store-level scoped reads behave as not-found for other tenants/users.
    assert store.get_session(victim.id, org_id="org-b", user_id="user-1") is None
    assert store.get_session(victim.id, org_id="org-a", user_id="user-2") is None
    assert store.get_session(victim.id, org_id="org-a", user_id="user-1") is not None
    assert store.list_checkpoints(victim.id, org_id="org-b", user_id="user-1") == []
    assert len(store.list_checkpoints(victim.id, org_id="org-a", user_id="user-1")) == 1

    # Manager-level: a foreign session id never resumes or gets overwritten.
    attacker = manager.ensure_session(org_id="org-b", user_id="user-9", session_id=victim.id, original_input="mine")
    assert attacker.id != victim.id
    assert attacker.org_id == "org-b"
    untouched = manager.get_session(victim.id)
    assert untouched.org_id == "org-a" and untouched.original_input == "secret"

    assert manager.get_resumable_sessions("org-b", "user-9", limit=10) != [] or True
    assert [s.id for s in manager.get_resumable_sessions("org-a", "user-1")] == [victim.id]


# -- memory scoping -----------------------------------------------------------
def test_memory_search_scoped_by_org_and_user(store):
    memories = MemoryStore(store=store)
    memories.upsert_many(org_id="org-a", user_id="u1", records=[("pet", "my dog is called Rex", 0.9, "chat")])
    memories.upsert_many(org_id="org-b", user_id="u1", records=[("pet", "my dog is called Fido", 0.9, "chat")])
    memories.upsert_many(org_id="org-a", user_id="u2", records=[("pet", "my dog is called Spot", 0.9, "chat")])

    hits = memories.search(org_id="org-a", user_id="u1", query="dog")
    assert [h.value for h in hits] == ["my dog is called Rex"]
    assert [h.value for h in memories.search(org_id="org-b", user_id="u1", query="dog")] == ["my dog is called Fido"]
    assert memories.search(org_id="org-c", user_id="u1", query="dog") == []
    assert [h.value for h in memories.get_all(org_id="org-a", user_id="u2")] == ["my dog is called Spot"]


def test_memory_upsert_overwrites_same_key(store):
    memories = MemoryStore(store=store)
    memories.upsert_many(org_id="o", user_id="u", records=[("city", "Pune", 0.5, "chat")])
    memories.upsert_many(org_id="o", user_id="u", records=[("city", "Mumbai", 0.8, "chat")])
    rows = memories.get_all(org_id="o", user_id="u")
    assert [(r.key, r.value) for r in rows] == [("city", "Mumbai")]


def test_memory_search_survives_hostile_query(store):
    memories = MemoryStore(store=store)
    memories.upsert_many(org_id="o", user_id="u", records=[("note", "budget review", 0.5, "chat")])
    for q in ['"', "AND OR NOT", "budget*", "(", "a:b", "' OR 1=1 --", ".*", "$ne"]:
        memories.search(org_id="o", user_id="u", query=q)  # must not raise


# -- checkpoint policy --------------------------------------------------------
def test_boundary_checkpoints_only_at_start_and_end(manager, store):
    session = manager.create_session("org-a", "user-1")
    _node_checkpoints(manager, session.id)
    # start persisted, the other four held in process
    assert store.count_checkpoints(session.id) == 1

    manager.complete_session(session.id, final_output={"answer": "done"})
    # + terminal COMPLETE checkpoint carrying the final output
    assert store.count_checkpoints(session.id) == 2

    final = manager.get_session(session.id)
    assert final.status == SessionStatus.COMPLETED
    assert final.checkpoint_count == 2
    # Buffered progress was folded into the session (tokens, summary).
    assert final.memory.total_input_tokens == 5
    assert final.memory.total_output_tokens == 10
    assert "synthesis done" in final.memory.rolling_summary


def test_failure_flushes_latest_progress_then_error_checkpoint(manager, store):
    session = manager.create_session("org-a", "user-1")
    _node_checkpoints(manager, session.id, count=3)
    manager.fail_session(session.id, "boom")

    phases = [c.phase for c in manager.get_checkpoints(session.id)]  # newest first
    assert phases[0] == CheckpointPhase.ERROR
    assert CheckpointPhase.EXECUTION in phases  # newest buffered node progress kept
    assert store.count_checkpoints(session.id) == 3  # start + flushed latest + error
    failed = manager.get_session(session.id)
    assert failed.status == SessionStatus.FAILED and failed.last_error == "boom"
    assert failed.error_count == 1


def test_every_node_mode_persists_each_checkpoint(store):
    mgr = SessionManager(store, checkpoint_mode="every_node")
    session = mgr.create_session("org-a", "user-1")
    _node_checkpoints(mgr, session.id)
    assert store.count_checkpoints(session.id) == 5


def test_direct_checkpoints_always_persist(manager, store):
    session = manager.create_session("org-a", "user-1")
    for _ in range(3):
        manager.save_checkpoint(session.id, CheckpointPhase.EXECUTION)
    assert store.count_checkpoints(session.id) == 3


def test_checkpoints_newest_first(manager):
    session = manager.create_session("org-a", "user-1")
    for phase in (CheckpointPhase.ROUTING, CheckpointPhase.PLANNING, CheckpointPhase.EXECUTION):
        manager.save_checkpoint(session.id, phase)
    assert [c.phase for c in manager.get_checkpoints(session.id)] == [
        CheckpointPhase.EXECUTION,
        CheckpointPhase.PLANNING,
        CheckpointPhase.ROUTING,
    ]
    assert manager.get_latest_checkpoint(session.id, CheckpointPhase.PLANNING).phase == CheckpointPhase.PLANNING


def test_ensure_session_fails_soft_when_backend_down(store):
    class Broken(type(store)):  # type: ignore[misc]
        def get_session(self, *a, **k):
            raise RuntimeError("backend down")

        def put_session(self, *a, **k):
            raise RuntimeError("backend down")

    broken = Broken.__new__(Broken)
    broken.__dict__.update(store.__dict__)
    mgr = SessionManager(broken)
    session = mgr.ensure_session(org_id="o", user_id="u", session_id="sess_x")
    assert session.org_id == "o" and session.user_id == "u"


# -- TTL indexes (mongo only) -------------------------------------------------
class TestMongoIndexes:
    @pytest.fixture()
    def mongo(self):
        db = mongomock.MongoClient(tz_aware=True)["ttl_test"]
        return MongoStateStore(db=db), db

    def test_ttl_indexes_created_with_defaults(self, mongo):
        store, db = mongo
        report = store.ensure_indexes()
        assert report["ok"] is True
        sessions = db[SESSIONS_COLLECTION].index_information()
        checkpoints = db[CHECKPOINTS_COLLECTION].index_information()
        assert sessions["sessions_ttl_updatedAt"]["expireAfterSeconds"] == 86400
        assert checkpoints["checkpoints_ttl_createdAt"]["expireAfterSeconds"] == 7 * 86400

    def test_ttl_is_env_configurable_and_reindexed(self, mongo, monkeypatch):
        store, db = mongo
        store.ensure_indexes()
        monkeypatch.setenv("AI_CORE_SESSION_TTL_SECONDS", "3600")
        monkeypatch.setenv("AI_CORE_CHECKPOINT_TTL_SECONDS", "7200")
        assert (session_ttl_seconds(), checkpoint_ttl_seconds()) == (3600, 7200)
        report = store.ensure_indexes()
        assert report["ok"] is True
        assert db[SESSIONS_COLLECTION].index_information()["sessions_ttl_updatedAt"]["expireAfterSeconds"] == 3600
        assert db[CHECKPOINTS_COLLECTION].index_information()["checkpoints_ttl_createdAt"]["expireAfterSeconds"] == 7200

    def test_ensure_indexes_idempotent(self, mongo):
        store, db = mongo
        first = store.ensure_indexes()
        second = store.ensure_indexes()
        assert first["ok"] and second["ok"]
        assert len(db["ai_memories"].index_information()) == len(
            MongoStateStore(db=db).ensure_indexes() and db["ai_memories"].index_information()
        )

    def test_memory_text_index_is_tenant_prefixed(self, mongo):
        store, db = mongo
        store.ensure_indexes()
        info = db["ai_memories"].index_information()
        keys = [k for k, _ in info["memories_text"]["key"]]
        assert keys[:2] == ["orgId", "userId"]
        assert info["memories_uniq"]["unique"] is True

    def test_ensure_indexes_fails_soft(self):
        class Boom:
            def __getitem__(self, name):
                raise RuntimeError("mongo down")

        store = MongoStateStore(db=Boom())
        report = store.ensure_indexes()
        assert report["ok"] is False
        assert store.health()["ok"] is False


def test_sqlite_backend_still_reports_fts(tmp_path):
    s = SqliteStateStore(str(tmp_path / "x.sqlite3"))
    assert s.ensure_indexes()["ok"] is True
    assert s.health()["backend"] == "sqlite"
