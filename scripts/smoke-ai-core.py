"""Exercise the native OCR dependencies and real MongoDB in the CI runtime image."""
import sys
from uuid import uuid4


def check_ocr() -> None:
    from paddleocr import PaddleOCR
    import zlib

    assert callable(PaddleOCR)
    sample = b"FinWise receipt OCR"
    assert zlib.decompress(zlib.compress(sample)) == sample


def check_state() -> None:
    from memory.state_store import MongoStateStore
    from utils.session_manager import CheckpointPhase, SessionManager

    store = MongoStateStore()
    assert store.db.command("hello")["isWritablePrimary"] is True
    index_report = store.ensure_indexes()
    assert index_report["ok"], index_report

    org_id = f"ci-{uuid4().hex}"
    user_id = "ci-user"
    for value in ("draft budget", "updated budget"):
        assert store.upsert_memories(org_id, user_id, [("plan", value, 0.9, "test")]) == 1
    memories = store.list_memories(org_id, user_id, 5)
    assert [(memory["key"], memory["value"]) for memory in memories] == [
        ("plan", "updated budget")
    ]
    assert not store.list_memories("other-org", user_id, 5)
    assert not store.list_memories(org_id, "other-user", 5)

    session = SessionManager(store).create_session(org_id, user_id, original_input="plan a budget")
    # Use a fresh manager to prove sessions survive process-local caches.
    reader = SessionManager(MongoStateStore())
    restored = reader.ensure_session(org_id=org_id, user_id=user_id, session_id=session.id)
    assert restored.id == session.id and restored.original_input == "plan a budget"

    reader.save_checkpoint(session.id, CheckpointPhase.PLANNING)
    assert store.get_session(session.id, org_id="other-org", user_id=user_id) is None
    assert store.list_checkpoints(session.id, org_id=org_id, user_id="other-user") == []
    latest = reader.get_latest_checkpoint(session.id)
    assert latest is not None and latest.phase is CheckpointPhase.PLANNING


if __name__ == "__main__":
    {"ocr": check_ocr, "state": check_state}[sys.argv[1]]()
