import tempfile
from pathlib import Path

from memory import MemoryStore, extract_memories


def test_memory_store_upsert_and_search():
    with tempfile.TemporaryDirectory() as tmp:
        db_path = str(Path(tmp) / "memory.sqlite3")
        store = MemoryStore(db_path=db_path)

        inserted = store.upsert_many(
            org_id="org_test",
            user_id="user_test",
            records=[
                ("risk_tolerance", "low", 0.8, "explicit"),
                ("preference", "prefer: envelope budgeting", 0.7, "explicit"),
            ],
        )
        assert inserted == 2

        results = store.search(
            org_id="org_test",
            user_id="user_test",
            query="envelope",
            limit=10,
        )
        assert len(results) >= 1
        assert any("envelope" in r.value.lower() for r in results)

        other_user = store.search(
            org_id="org_test",
            user_id="someone_else",
            query="envelope",
            limit=10,
        )
        assert other_user == []


def test_extract_memories():
    memories = extract_memories("I prefer envelope budgeting and I am conservative for the next 12 months.")
    keys = {m[0] for m in memories}
    assert "risk_tolerance" in keys
    assert "preference" in keys
    assert "budgeting_style" in keys

    redacted = extract_memories("My API key is sk_test_abcdefghijklmnopqrstuvwxyz0123456789")
    assert redacted == []

