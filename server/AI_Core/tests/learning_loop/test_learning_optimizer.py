"""Optimizer (zero-LLM default, budget cap, per-org isolation, k-anonymity), bandit, memory consolidation."""

import random
from datetime import datetime, timedelta, timezone

import pytest
from learning_helpers import add_feedback, add_run

from learning import bandit, memory_consolidation, optimizer
from learning.optimizer import Optimizer
from registry.store import ArtifactStore


def _seed_negatives(org="orgA", n=4, reason="too_long", route="comprehensive", correction=None, prefix="n"):
    for i in range(n):
        add_run(org, f"u{i}", f"{prefix}{i}", route=route, input_text="plan my savings")
        kw = {"correction": correction} if correction else {}
        add_feedback(org, f"u{i}", f"{prefix}{i}", "down", reason, **kw)


class SpyLLM:
    def __init__(self, reply):
        self.reply = reply
        self.calls = 0

    def __call__(self, system, user):
        self.calls += 1
        return self.reply


# ---------------------------------------------------------------------------
# Zero-LLM default and budget
# ---------------------------------------------------------------------------
def test_budget_zero_makes_no_llm_calls_and_still_produces_a_candidate():
    _seed_negatives()
    spy = SpyLLM("Be short.")
    summary = Optimizer("orgA", llm=spy, budget=0).run()
    assert spy.calls == 0 and summary["llmCallsUsed"] == 0 and summary["llmBudget"] == 0
    prompts = [c for c in summary["candidates"] if c["kind"] == "prompt"]
    assert len(prompts) == 1
    cand = prompts[0]
    assert cand["key"] == "aggregator.system" and cand["gatePassed"] is True
    assert cand["decision"] == "awaiting_admin"  # human mode: never self-promotes
    assert cand["evidence"]["source"] == ["heuristic"]
    assert ArtifactStore().get(cand["artifactId"]).status == "draft"


def test_budget_default_is_zero(monkeypatch):
    _seed_negatives()
    spy = SpyLLM("Be short.")
    summary = Optimizer("orgA", llm=spy).run()
    assert spy.calls == 0 and summary["llmBudget"] == 0


def test_llm_rephrase_is_used_only_when_clean_and_within_budget():
    _seed_negatives()
    spy = SpyLLM("Keep answers brief and to the point.")
    summary = Optimizer("orgA", llm=spy, budget=1).run()
    assert spy.calls == 1 and summary["llmCallsUsed"] <= summary["llmBudget"] == 1
    cand = next(c for c in summary["candidates"] if c["kind"] == "prompt")
    assert cand["evidence"]["source"] == ["llm"]
    assert "Keep answers brief and to the point." in ArtifactStore().get(cand["artifactId"]).text


def test_llm_output_with_digits_falls_back_to_the_heuristic():
    _seed_negatives()
    spy = SpyLLM("Always answer in under 50 words.")
    summary = Optimizer("orgA", llm=spy, budget=3).run()
    cand = next(c for c in summary["candidates"] if c["kind"] == "prompt")
    assert cand["evidence"]["source"] == ["heuristic"]
    assert "50" not in ArtifactStore().get(cand["artifactId"]).text.split("Keep every answer")[-1]
    assert summary["llmCallsUsed"] <= 3


def test_wrong_number_feedback_never_edits_a_prompt():
    _seed_negatives(reason="wrong_number")
    summary = Optimizer("orgA", budget=0).run()
    assert [c for c in summary["candidates"] if c["kind"] == "prompt"] == []
    assert any("wrong_number" in s for s in summary["skipped"])


def test_below_min_feedback_produces_no_candidates():
    _seed_negatives(n=2)
    assert Optimizer("orgA", budget=0).run()["candidates"] == []


def test_org_opt_out_skips_the_optimizer(monkeypatch):
    _seed_negatives()
    monkeypatch.setenv("AI_LEARNING_OPT_OUT_ORGS", "orgA")
    summary = Optimizer("orgA", budget=0).run()
    assert summary["candidates"] == [] and "opted out" in summary["note"]


def test_org_scope_requires_an_org_id():
    with pytest.raises(ValueError):
        Optimizer("", scope="org")
    with pytest.raises(ValueError):
        Optimizer("orgA", scope="weird")


# ---------------------------------------------------------------------------
# Tenant isolation
# ---------------------------------------------------------------------------
def test_org_b_optimizer_never_reads_org_a_runs(monkeypatch):
    _seed_negatives("orgA", n=6, correction="private hint")
    summary_b = Optimizer("orgB", budget=0).run()
    assert summary_b["candidates"] == []

    seen_orgs = set()
    from learning import run_store

    real = run_store.RunStore.for_org.__func__

    def spy_for_org(cls, org_id):
        seen_orgs.add(org_id)
        return real(cls, org_id)

    monkeypatch.setattr(run_store.RunStore, "for_org", classmethod(spy_for_org))
    Optimizer("orgB", budget=0).run()
    assert seen_orgs == {"orgB"}


def test_org_b_candidates_are_scoped_to_org_b_only():
    _seed_negatives("orgA", n=4)
    _seed_negatives("orgB", n=4, reason="unclear", prefix="b")
    a = Optimizer("orgA", budget=0).run()
    b = Optimizer("orgB", budget=0).run()
    art_a = ArtifactStore().get(a["candidates"][0]["artifactId"])
    art_b = ArtifactStore().get(b["candidates"][0]["artifactId"])
    assert art_a.org_id == "orgA" and art_b.org_id == "orgB"
    assert "concise" in art_a.text and "plain language" not in art_a.text
    assert "plain language" in art_b.text and "concise" not in art_b.text.split("Use plain language")[-1]


# ---------------------------------------------------------------------------
# Global scope: aggregated numeric signals only
# ---------------------------------------------------------------------------
def test_global_scope_needs_k_anonymity_and_carries_no_user_text(monkeypatch):
    monkeypatch.setenv("AI_GLOBAL_MIN_ORGS", "3")
    monkeypatch.setenv("AI_GLOBAL_MIN_EVENTS", "10")
    _seed_negatives("orgA", n=5, correction="my-secret-hint", prefix="a")
    _seed_negatives("orgB", n=5, prefix="b")
    summary = Optimizer(None, scope="global", budget=0).run()
    assert summary["candidates"] == [] and any("k-anonymity" in s for s in summary["skipped"])

    _seed_negatives("orgC", n=5, prefix="c")
    summary = Optimizer(None, scope="global", budget=0).run()
    kinds = {c["kind"] for c in summary["candidates"]}
    assert "prompt" in kinds
    for cand in summary["candidates"]:
        art = ArtifactStore().get(cand["artifactId"])
        assert art.scope == "global" and art.org_id is None
        blob = str(cand["evidence"]) + str(art.model_dump())
        for leaked in ("my-secret-hint", "orgA", "orgB", "orgC", "plan my savings"):
            assert leaked not in blob
        if cand["kind"] == "exemplar":
            assert art.synthetic is True


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------
def test_job_lifecycle_and_last_run():
    _seed_negatives()
    job_id = optimizer.create_job("orgA", "org")
    assert optimizer.get_job(job_id)["status"] == "queued"
    summary = optimizer.run_job(job_id, "orgA", "org", budget=0)
    job = optimizer.get_job(job_id)
    assert job["status"] == "done" and job["org_id"] == "orgA"
    last = optimizer.last_run("orgA")
    assert last["lastRunAt"] and [c["artifactId"] for c in last["lastCandidates"]] == [
        c["artifactId"] for c in summary["candidates"]
    ]
    assert optimizer.last_run("orgB") == {"lastRunAt": None, "lastCandidates": []}


# ---------------------------------------------------------------------------
# Bandit
# ---------------------------------------------------------------------------
MODELS = ["m1", "m2", "m3"]


def test_bandit_flag_off_keeps_caller_order():
    for _ in range(50):
        bandit.record_reward("master", "m3", 1.0)
    assert bandit.order_models("master", MODELS) == MODELS


def test_bandit_result_is_always_a_permutation_and_respects_health(monkeypatch):
    monkeypatch.setenv("LLM_BANDIT_ENABLED", "1")
    rng = random.Random(7)
    for _ in range(30):
        order = bandit.order_models("master", MODELS, healthy={"m2": False}, rng=rng)
        assert sorted(order) == sorted(MODELS) and order[-1] == "m2"


def test_bandit_prefers_rewarded_arm_and_demotes_below_quality_floor(monkeypatch):
    monkeypatch.setenv("LLM_BANDIT_ENABLED", "1")
    for _ in range(bandit.MIN_PULLS_FOR_FLOOR + 5):
        bandit.record_reward("master", "m1", 0.0)
        bandit.record_reward("master", "m2", 1.0)
    rng = random.Random(1)
    for _ in range(40):
        order = bandit.order_models("master", MODELS, rng=rng)
        assert order[-1] == "m1"  # floor demotion: never ahead of a healthy arm
    stats = {r["model"]: r for r in bandit.arm_stats("master")}
    assert stats["m2"]["mean"] > bandit.QUALITY_FLOOR > stats["m1"]["mean"]


def test_bandit_force_flag_and_single_model_passthrough():
    assert bandit.order_models("master", ["only"], force=True) == ["only"]
    assert sorted(bandit.order_models("master", MODELS, force=True)) == MODELS


# ---------------------------------------------------------------------------
# Memory consolidation (public MemoryStore API only)
# ---------------------------------------------------------------------------
@pytest.fixture
def mem(tmp_path):
    from memory.store import MemoryStore

    return MemoryStore(db_path=str(tmp_path / "mem.sqlite"))


def _conf(store, org, user):
    return {r.key: r.confidence for r in store.get_all(org_id=org, user_id=user, limit=100)}


def test_consolidation_demotes_duplicates(mem):
    mem.upsert_many(
        org_id="orgA", user_id="u1",
        records=[("risk_style", "Prefers low risk", 0.6, "inferred"), ("risk_profile", "prefers  low risk", 0.9, "explicit")],
    )
    report = memory_consolidation.consolidate_user("orgA", "u1", store=mem)
    conf = _conf(mem, "orgA", "u1")
    assert report["merged"] and conf["risk_profile"] >= 0.9
    assert conf["risk_style"] <= memory_consolidation.DEMOTED_CONFIDENCE


def test_consolidation_decays_stale_inferred_memories(mem):
    mem.upsert_many(org_id="orgA", user_id="u1", records=[("hobby", "likes hiking", 0.8, "inferred")])
    later = datetime.now(timezone.utc) + timedelta(days=memory_consolidation.STALE_DAYS + 90)
    report = memory_consolidation.consolidate_user("orgA", "u1", store=mem, now=later)
    assert report["decayed"] == ["hobby"]
    assert _conf(mem, "orgA", "u1")["hobby"] < 0.8
    # applying again at the same instant does not decay twice
    before = _conf(mem, "orgA", "u1")["hobby"]
    memory_consolidation.consolidate_user("orgA", "u1", store=mem, now=later)
    assert _conf(mem, "orgA", "u1")["hobby"] == pytest.approx(before, abs=0.011)


def test_consolidation_demotes_contradicted_memory(mem):
    mem.upsert_many(org_id="orgA", user_id="u1", records=[("employer_name", "works at Acme", 0.9, "inferred")])
    correction = (datetime.now(timezone.utc) + timedelta(minutes=5), "that employer is wrong now")
    report = memory_consolidation.consolidate_user("orgA", "u1", store=mem, corrections=[correction])
    assert report["contradicted"] == ["employer_name"]
    assert _conf(mem, "orgA", "u1")["employer_name"] <= memory_consolidation.CONTRADICTED_CONFIDENCE


def test_consolidation_dry_run_and_isolation(mem):
    mem.upsert_many(
        org_id="orgA", user_id="u1",
        records=[("a_key", "same value", 0.5, "inferred"), ("b_key", "same value", 0.7, "inferred")],
    )
    mem.upsert_many(org_id="orgB", user_id="u1", records=[("a_key", "same value", 0.5, "inferred")])
    report = memory_consolidation.consolidate_user("orgA", "u1", store=mem, apply=False)
    assert report["merged"] and _conf(mem, "orgA", "u1") == {"a_key": 0.5, "b_key": 0.7}
    memory_consolidation.consolidate_user("orgA", "u1", store=mem)
    assert _conf(mem, "orgB", "u1") == {"a_key": 0.5}
    with pytest.raises(ValueError):
        memory_consolidation.consolidate_user("", "u1", store=mem)
