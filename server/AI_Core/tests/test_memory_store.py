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


def test_memory_store_search_ranked():
    with tempfile.TemporaryDirectory() as tmp:
        db_path = str(Path(tmp) / "memory_ranked.sqlite3")
        store = MemoryStore(db_path=db_path)

        store.upsert_many(
            org_id="org_alpha",
            user_id="user_alpha",
            records=[
                ("monthly_emergency_target", "Save $10,000 in HYSA for 6 months emergency cushion", 0.95, "explicit"),
                ("investment_risk", "Moderate growth index funds, max out Roth IRA", 0.85, "explicit"),
                ("dining_limit", "Cap eating out at $300 per month", 0.60, "inferred"),
            ],
        )

        # Query for emergency fund should rank monthly_emergency_target #1
        results = store.search_ranked(
            org_id="org_alpha",
            user_id="user_alpha",
            query="emergency cushion hysa",
            limit=5,
        )
        assert len(results) >= 1
        assert results[0].key == "monthly_emergency_target"
        assert results[0].rank == 1
        assert results[0].score > 10.0
        assert results[0].rrf_score > 0.0

        # Confidence filtering
        high_conf = store.search_ranked(
            org_id="org_alpha",
            user_id="user_alpha",
            query="dining limit",
            limit=5,
            min_confidence=0.8,
        )
        assert len(high_conf) == 0


def test_reciprocal_rank_fusion():
    from memory.store import reciprocal_rank_fusion

    memories = [
        {"id": "mem_1", "source_type": "memory", "title": "Prefers Low Risk", "score": 25.0},
        {"id": "mem_2", "source_type": "memory", "title": "Monthly Target $500", "score": 15.0},
    ]
    files = [
        {"id": "file_chunk_1", "source_type": "file", "title": "Q3 401k statement", "score": 30.0},
        {"id": "file_chunk_2", "source_type": "file", "title": "Tax return 1040", "score": 12.0},
    ]
    txns = [
        {"id": "txn_1", "source_type": "transaction", "title": "Vanguard Index $500", "score": 40.0},
    ]

    # Test standard equal weighting
    fused = reciprocal_rank_fusion([memories, files, txns], k=60)
    assert len(fused) == 5
    assert all("rrf_score" in item for item in fused)
    assert all("normalized_score" in item for item in fused)
    assert all("unified_rank" in item for item in fused)

    # Rank 1 must have normalized_score == 100.0
    assert fused[0]["normalized_score"] == 100.0
    assert fused[0]["unified_rank"] == 1

    # Test weighted fusion (boost memory)
    weighted = reciprocal_rank_fusion([memories, files, txns], k=60, weights={"memory": 2.5, "file": 1.0, "transaction": 1.0})
    assert len(weighted) == 5
    # Memory item with boosted weight should be top ranked
    assert weighted[0]["source_type"] == "memory"
    assert weighted[0]["id"] == "mem_1"


def test_api_memory_endpoints():
    from fastapi.testclient import TestClient

    from api_service import app

    client = TestClient(app)
    # Memory routes require the gateway-supplied actor headers.
    actor = {"x-internal-org-id": "org_e2e", "x-internal-user-id": "user_e2e"}

    # 1. Upsert memory
    upsert_res = client.post(
        "/api/memory/upsert",
        headers=actor,
        json={
            "org_id": "org_e2e",
            "user_id": "user_e2e",
            "key": "groceries_cap",
            "value": "Keep monthly groceries under $450",
            "confidence": 0.9,
            "source": "explicit",
        },
    )
    assert upsert_res.status_code == 200
    assert upsert_res.json()["status"] == "success"
    assert upsert_res.json()["upserted"] == 1

    # 2. Get / search memory
    get_res = client.get("/api/memory?org_id=org_e2e&user_id=user_e2e&query=groceries", headers=actor)
    assert get_res.status_code == 200
    data = get_res.json()
    assert data["status"] == "success"
    assert data["total"] >= 1
    assert data["memories"][0]["key"] == "groceries_cap"

    # 3. Unified rank endpoint
    rank_res = client.post(
        "/api/memory/unified-rank",
        json={
            "query": "groceries spend",
            "candidates": [
                {"id": "m1", "source_type": "memory", "title": "Groceries Rule", "score": 20.0},
                {"id": "t1", "source_type": "transaction", "title": "Trader Joes $82", "score": 35.0},
            ],
            "limit": 5,
        },
    )
    assert rank_res.status_code == 200
    rank_data = rank_res.json()
    assert rank_data["status"] == "success"
    assert rank_data["total"] == 2
    assert len(rank_data["results"]) == 2


