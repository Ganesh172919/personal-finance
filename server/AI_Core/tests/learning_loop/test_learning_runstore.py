"""Run store: capture, redaction, opt-out, async writer, org isolation, aggregates."""

import threading
import time

from learning_helpers import add_feedback, add_run

from learning import config, run_store
from learning.async_writer import AsyncWriter, get_writer
from learning.run_store import RunStore, global_signals
from utils.mongo_client import get_mongo_db


def test_capture_stores_redacted_text_and_metadata():
    assert add_run(
        "orgA", "u1", "out1",
        input_text="My salary is Rs. 85,000 mail me a@b.com",
        output_text="Save 20% of 85000",
        route="budget_planning",
    )
    row = RunStore.for_org("orgA").run_for_output("out1")
    assert row["route"] == "budget_planning" and row["org_id"] == "orgA" and row["user_id"] == "u1"
    for leaked in ("85,000", "a@b.com", "20%", "85000"):
        assert leaked not in row["input_text"] + row["output_text"]
    assert row["tokens"]["total"] == 100 and row["verification"]["passed"] is True
    assert row["prompt_version"] == "default" and row["routing_version"] == "default"


def test_opt_out_header_flag_and_org_setting_skip_capture(monkeypatch):
    assert add_run("orgA", "u1", "x1", opt_out=True) is False
    monkeypatch.setenv("AI_LEARNING_OPT_OUT_ORGS", "orgOut")
    assert add_run("orgOut", "u1", "x2") is False
    assert add_feedback("orgOut", "u1", "x2", "down", "too_long") is False
    assert add_feedback("orgA", "u1", "x1", "down", "too_long", opt_out=True) is False
    assert get_mongo_db()[run_store.RUNS].count_documents({}) == 0
    assert get_mongo_db()[run_store.FEEDBACK].count_documents({}) == 0


def test_feedback_links_run_versions_and_sanitises_correction():
    add_run("orgA", "u1", "out1", artifact_ids=["art_pro_abc123"], route="comprehensive", model="m1")
    assert add_feedback("orgA", "u1", "out1", "down", "too_long", correction="it should be 5000 not 6000")
    fb = RunStore.for_org("orgA").negative_feedback()[0]
    assert fb["artifact_ids"] == ["art_pro_abc123"] and fb["route"] == "comprehensive" and fb["model"] == "m1"
    assert "5000" not in fb["correction"] and "6000" not in fb["correction"]


def test_feedback_validates_rating_and_org():
    import pytest

    with pytest.raises(ValueError):
        add_feedback("orgA", "u1", "o", "meh")
    with pytest.raises(ValueError):
        run_store.record_feedback(org_id="", user_id="u", agent_output_id="o", rating="up")


def test_org_filter_cannot_be_overridden_and_orgs_are_isolated():
    add_run("orgA", "u1", "a1", input_text="alpha secret question")
    add_run("orgB", "u2", "b1", input_text="beta question")
    add_feedback("orgA", "u1", "a1", "down", "too_long")
    b = RunStore.for_org("orgB")
    assert [r["agent_output_id"] for r in b.runs()] == ["b1"]
    assert b.feedback() == []
    # a hostile caller trying to widen the filter through ``extra`` still only sees its own org
    assert [r["agent_output_id"] for r in b.runs(extra={"org_id": "orgA"})] == ["b1"]
    assert b.run_for_output("a1") is None
    assert b.count_runs() == 1


def test_aggregates_split_candidate_and_baseline():
    for i in range(4):
        add_run("orgA", f"u{i}", f"c{i}", artifact_ids=["art_pro_cand"], fallback=(i == 0), latency_ms=200, tokens=200)
        add_run("orgA", f"u{i}", f"b{i}", latency_ms=100, tokens=100)
    add_feedback("orgA", "u0", "c0", "down", "too_long")
    cand = run_store.artifact_stats("art_pro_cand")
    base = run_store.baseline_stats("art_pro_cand", "orgA")
    assert cand["runs"] == 4 and cand["thumbsDown"] == 1 and cand["fallbackRate"] == 0.25
    assert cand["avgLatencyMs"] == 200 and cand["avgTokens"] == 200
    assert base["runs"] == 4 and base["thumbsDown"] == 0 and base["avgTokens"] == 100


def test_global_signals_are_k_anonymous_numeric_and_respect_opt_out(monkeypatch):
    monkeypatch.setenv("AI_GLOBAL_MIN_ORGS", "3")
    monkeypatch.setenv("AI_GLOBAL_MIN_EVENTS", "10")
    for i in range(6):
        add_run("orgA", "u", f"a{i}", route="budget_planning")
        add_feedback("orgA", "u", f"a{i}", "down", "too_long", correction="private text")
    for i in range(6):
        add_run("orgB", "u", f"b{i}", route="budget_planning")
        add_feedback("orgB", "u", f"b{i}", "down", "unclear")
    sig = global_signals()
    assert sig["eligible"] is False and sig["orgs"] == 2  # k-anonymity: need >= 3 orgs
    for i in range(3):
        add_run("orgC", "u", f"c{i}", route="budget_planning")
        add_feedback("orgC", "u", f"c{i}", "up")
    sig = global_signals()
    assert sig["eligible"] is True and sig["orgs"] == 3
    assert sig["byRoute"]["budget_planning"] == {"up": 3, "down": 12}
    assert "private text" not in str(sig) and "orgA" not in str(sig)
    monkeypatch.setenv("AI_LEARNING_OPT_OUT_ORGS", "orgC")
    assert global_signals()["eligible"] is False  # opted-out org excluded -> below k


def test_ttl_index_is_created(monkeypatch):
    monkeypatch.setenv("AI_RUN_TTL_DAYS", "7")
    add_run("orgA", "u", "a1")
    info = get_mongo_db()[run_store.RUNS].index_information()
    ttls = [v.get("expireAfterSeconds") for v in info.values() if v.get("expireAfterSeconds") is not None]
    assert ttls == [7 * 86400]


def test_async_writer_is_bounded_and_never_blocks():
    gate = threading.Event()
    written = []

    class SlowWriter(AsyncWriter):
        def _write(self, item):  # blocks the worker so the queue fills up
            gate.wait(5)
            written.append(item)
            return True

    writer = SlowWriter(maxsize=3, synchronous=False)
    started = time.perf_counter()
    results = [writer.submit("c", {"i": i}) for i in range(20)]
    assert time.perf_counter() - started < 1.0  # producer never waits on the writer
    assert results.count(False) >= 20 - 3 - 1 and writer.dropped == results.count(False)
    gate.set()
    assert writer.flush(5.0)
    assert len(written) == results.count(True)


def test_async_writer_flushes_to_mongo():
    writer = AsyncWriter(maxsize=10, synchronous=False)
    for i in range(5):
        assert writer.submit("ai_test_docs", {"i": i, "created_at": run_store._now()})
    assert writer.flush(5.0)
    assert get_mongo_db()["ai_test_docs"].count_documents({}) == 5
    assert writer.stats()["written"] == 5


def test_default_writer_is_synchronous_without_real_mongo():
    assert get_writer().synchronous is True
    assert config.run_buffer_size() >= 10
