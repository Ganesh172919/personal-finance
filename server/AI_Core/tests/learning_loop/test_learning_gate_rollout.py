"""Promotion gate (number-safety zero tolerance) and canary rollout / rollback policy."""

import pytest
from learning_helpers import add_feedback, add_run, default_text, new_prompt

from learning import gate, rollout
from learning.gate import compare, wilson_lower
from registry import loader
from registry.context import begin_context, clear_context
from registry.models import RoutingConfig
from registry.store import ArtifactStore


# ---------------------------------------------------------------------------
# Gate
# ---------------------------------------------------------------------------
def test_wilson_lower_bound_basics():
    assert wilson_lower(0, 0) == 0.0
    assert wilson_lower(12, 12) > 0.7
    assert wilson_lower(6, 12) < 0.7
    assert wilson_lower(100, 100) > wilson_lower(12, 12)


def test_gate_passes_a_harmless_style_edit_and_persists_the_report():
    art = new_prompt("aggregator.system", "Keep answers concise.", gated=False)
    result = gate.run_gate(art)
    assert result.passed, [c.to_dict() for c in result.checks if not c.passed]
    stored = ArtifactStore().get(art.id)
    assert stored.gate_passed is True and stored.eval_report_id == result.id
    report = gate.get_gate_report(result.id)
    assert report["passed"] is True and report["artifactId"] == art.id
    assert any(r["id"] == result.id for r in gate.list_gate_reports(5, "orgA"))
    assert all(r["id"] != result.id for r in gate.list_gate_reports(5, "orgB")) is True


def test_gate_blocks_a_candidate_that_degrades_number_safety():
    """A prompt that tempts the model to add figures must never pass (zero tolerance)."""
    art = new_prompt(
        "aggregator.system", "Always include a worked illustration with concrete figures.", gated=False
    )
    result = gate.run_gate(art)
    assert result.passed is False
    assert "number_safety" in result.failed_checks()
    safety = next(c for c in result.checks if c.name == "number_safety")
    assert safety.baseline["rawNumberCompliance"] == 1.0
    assert safety.candidate["rawNumberCompliance"] < 1.0
    assert ArtifactStore().get(art.id).gate_passed is False
    # and nothing downstream can promote it
    with pytest.raises(rollout.GateNotPassed):
        rollout.promote(art.id, actor="admin1")
    with pytest.raises(rollout.GateNotPassed):
        rollout.start_canary(art.id)
    assert rollout.route_candidate(art.id) == "gate_failed"
    assert ArtifactStore().get(art.id).status == "retired"


def test_compare_number_safety_has_zero_tolerance():
    art = new_prompt("master.system", "Be brief.", gated=False)
    base = {"guardLeaks": 0, "rawNumberCompliance": 1.0, "routingAgreement": 1.0, "determinism": 1.0,
            "schemaValidity": 1.0, "avgTokens": 100, "caseScores": {str(i): 1.0 for i in range(12)}}

    def verdict(**override):
        cand = {**base, **override}
        return {c.name: c.passed for c in compare(art, cand, base)}

    assert all(verdict().values())
    assert verdict(guardLeaks=1)["number_safety"] is False
    assert verdict(rawNumberCompliance=0.99)["number_safety"] is False
    assert verdict(routingAgreement=0.95)["routing"] is False
    assert verdict(determinism=0.9)["determinism"] is False
    assert verdict(avgTokens=200)["cost"] is False
    assert verdict(caseScores={str(i): (0.0 if i < 5 else 1.0) for i in range(12)})["win_rate"] is False
    assert verdict(caseScores={"a": 1.0})["win_rate"] is False  # too few paired cases


def test_gate_runs_a_routing_candidate_and_rejects_regressions():
    ok = ArtifactStore().create(RoutingConfig(scope="org", org_id="orgA", educator_cache_ttl_seconds=900))
    assert gate.run_gate(ok).passed
    # an extreme (still in-bounds) threshold that stops decomposing broad requests regresses coverage
    bad = ArtifactStore().create(
        RoutingConfig(scope="org", org_id="orgA", decompose_min_domains=5, plan_language_min_domains=4,
                      complex_profile_min_domains=4, decomposer_complexity_threshold=0.9)
    )
    assert gate.run_gate(bad).passed is False


def test_gate_replay_reads_only_the_artifacts_own_org():
    add_run("orgB", "u", "b1", input_text="should i buy stocks", route="investment_advice")
    art = ArtifactStore().create(RoutingConfig(scope="org", org_id="orgA", educator_cache_ttl_seconds=900))
    assert gate._replay_runs_for(art) == []  # org B's run is invisible to org A's gate
    add_run("orgA", "u", "a1", input_text="should i buy stocks", route="investment_advice")
    assert [r["agent_output_id"] for r in gate._replay_runs_for(art)] == ["a1"]


# ---------------------------------------------------------------------------
# Rollout
# ---------------------------------------------------------------------------
def _clean_traffic(candidate_id, n=6, tag="x", down=0, fallback=0, tokens=100, latency=100.0, verification_failed=0):
    for i in range(n):
        add_run("orgA", f"cu{i}", f"{tag}-c{i}", artifact_ids=[candidate_id], tokens=tokens, latency_ms=latency,
                fallback=i < fallback, verification_failed=i < verification_failed)
        if i < down:
            add_feedback("orgA", f"cu{i}", f"{tag}-c{i}", "down", "too_long")
    for i in range(n):
        add_run("orgA", f"bu{i}", f"{tag}-b{i}")


def test_suggest_mode_blocks_promotion(monkeypatch):
    monkeypatch.setenv("AI_PROMOTION_MODE", "suggest")
    art = new_prompt("master.system", "Be brief.")
    with pytest.raises(rollout.PromotionSuggestOnly) as err:
        rollout.promote(art.id, actor="admin1")
    assert err.value.code == "PROMOTION_SUGGEST_ONLY"
    assert rollout.route_candidate(art.id) == "suggested"
    assert ArtifactStore().get(art.id).status == "draft"


def test_unknown_mode_falls_back_to_human(monkeypatch):
    from learning import config

    monkeypatch.setenv("AI_PROMOTION_MODE", "yolo")
    assert config.promotion_mode() == "human"
    monkeypatch.delenv("AI_PROMOTION_MODE")
    assert config.promotion_mode() == "human"


def test_human_mode_promote_draft_starts_canary_then_active_and_retires_previous():
    first = new_prompt("master.system", "First.")
    rollout.promote(first.id, actor="admin1")
    first = rollout.promote(first.id, actor="admin1")
    assert first.status == "active"
    second = new_prompt("master.system", "Second.")
    canary = rollout.promote(second.id, actor="admin1")
    assert canary.status == "canary" and canary.rollout["percent"] == 5
    active = rollout.promote(second.id, actor="admin1", note="ship it")
    assert active.status == "active" and active.previous_active_id == first.id
    assert ArtifactStore().get(first.id).status == "retired"
    audit = ArtifactStore().list_audit(artifact_id=second.id)
    assert {"created", "status"} <= {a["action"] for a in audit}
    assert any(a["actor"] == "admin1" and a["to_status"] == "active" and not a["auto"] for a in audit)


def test_human_mode_never_self_promotes(monkeypatch):
    art = new_prompt("master.system", "Be brief.")
    assert rollout.route_candidate(art.id) == "awaiting_admin"
    assert ArtifactStore().get(art.id).status == "draft"


def test_canary_advances_5_25_100_then_waits_for_admin_in_human_mode():
    art = new_prompt("master.system", "Be brief.")
    art = rollout.promote(art.id, actor="admin1")
    _clean_traffic(art.id, tag="s1")
    assert rollout.evaluate(art)["action"] == "advance"
    art = ArtifactStore().get(art.id)
    assert art.rollout["percent"] == 25
    _clean_traffic(art.id, tag="s2")
    assert rollout.evaluate(art)["action"] == "advance"
    art = ArtifactStore().get(art.id)
    assert art.rollout["percent"] == 100
    _clean_traffic(art.id, tag="s3")
    assert rollout.evaluate(art)["action"] == "ready_for_promotion"
    art = ArtifactStore().get(art.id)
    assert art.status == "canary" and art.rollout["readyForPromotion"] is True
    assert rollout.promote(art.id, actor="admin1").status == "active"


def test_canary_waits_below_min_samples():
    art = rollout.promote(new_prompt("master.system", "Be brief.").id, actor="admin1")
    _clean_traffic(art.id, n=2)
    assert rollout.evaluate(art)["action"] == "wait"
    assert ArtifactStore().get(art.id).rollout["percent"] == 5


def test_auto_prompts_promotes_a_clean_prompt_but_never_a_routing_candidate(monkeypatch):
    monkeypatch.setenv("AI_PROMOTION_MODE", "auto_prompts")
    prompt = new_prompt("master.system", "Be brief.")
    assert rollout.route_candidate(prompt.id) == "canary"
    for tag in ("a", "b", "c"):
        art = ArtifactStore().get(prompt.id)
        _clean_traffic(prompt.id, tag=tag)
        result = rollout.evaluate(art)
    assert result["action"] == "promoted"
    assert ArtifactStore().get(prompt.id).status == "active"

    routing = ArtifactStore().create(RoutingConfig(scope="org", org_id="orgA", educator_cache_ttl_seconds=900))
    ArtifactStore().update_fields(routing.id, gate_passed=True)
    assert rollout.route_candidate(routing.id) == "awaiting_admin"  # routing needs an admin
    monkeypatch.setenv("AI_ROUTING_CANARY_AUTO", "1")
    routing2 = ArtifactStore().create(RoutingConfig(scope="org", org_id="orgA", educator_cache_ttl_seconds=1200))
    ArtifactStore().update_fields(routing2.id, gate_passed=True)
    assert rollout.route_candidate(routing2.id) == "canary"
    for tag in ("a", "b", "c"):
        art = ArtifactStore().get(routing2.id)
        _clean_traffic(routing2.id, tag="r" + tag)
        result = rollout.evaluate(art)
    assert result["action"] == "ready_for_promotion"  # never auto-promoted
    assert ArtifactStore().get(routing2.id).status == "canary"


@pytest.mark.parametrize(
    "traffic,breach",
    [
        ({"down": 6}, "thumbs_down_rate"),
        ({"fallback": 5}, "fallback_rate"),
        ({"verification_failed": 1}, "verification_failure_rate"),
        ({"tokens": 400}, "cost"),
        ({"latency": 900.0}, "latency"),
    ],
)
def test_each_guardrail_breach_auto_rolls_back_and_audits(traffic, breach):
    art = rollout.promote(new_prompt("master.system", "Be brief.").id, actor="admin1")
    _clean_traffic(art.id, **traffic)
    result = rollout.evaluate(ArtifactStore().get(art.id))
    assert result["action"] == "rollback" and breach in result["metrics"]["breaches"]
    assert ArtifactStore().get(art.id).status == "retired"
    audit = [a for a in ArtifactStore().list_audit(artifact_id=art.id) if a["to_status"] == "retired"]
    assert audit and audit[0]["auto"] is True and audit[0]["actor"] == "system"
    decision = rollout.last_decisions("orgA", 5)[0]
    assert decision["action"] == "rollback" and decision["auto"] is True
    # retired artifacts are no longer served
    begin_context("orgA", "cu1", "r")
    assert loader.get_prompt("master.system") == default_text("master.system")
    clear_context()


def test_rollback_after_promotion_restores_previous_active():
    first = new_prompt("master.system", "First.")
    rollout.promote(first.id, actor="admin1")
    rollout.promote(first.id, actor="admin1")
    second = new_prompt("master.system", "Second.")
    rollout.promote(second.id, actor="admin1")
    rollout.promote(second.id, actor="admin1")
    assert ArtifactStore().get(first.id).status == "retired"
    # regression after promotion is caught inside the monitoring window
    _clean_traffic(second.id, fallback=5)
    results = rollout.tick()
    assert any(r["action"] == "rollback" and r["artifactId"] == second.id for r in results)
    assert ArtifactStore().get(second.id).status == "retired"
    assert ArtifactStore().get(first.id).status == "active"  # previous active restored
    assert rollout.last_decisions("orgA", 1)[0]["metrics"]["restored"] == first.id


def test_fast_guard_after_thumbs_down_rolls_back_without_waiting_for_tick():
    art = rollout.promote(new_prompt("master.system", "Be brief.").id, actor="admin1")
    for i in range(5):
        add_run("orgA", f"cu{i}", f"f{i}", artifact_ids=[art.id])
    for i in range(5):
        add_feedback("orgA", f"cu{i}", f"f{i}", "down", "unclear")
    assert ArtifactStore().get(art.id).status == "retired"


def test_sticky_canary_assignment_does_not_change_between_steps():
    art = rollout.promote(new_prompt("master.system", "Be brief.").id, actor="admin1")
    users = [f"u{i}" for i in range(400)]
    at5 = {u for u in users if loader.in_canary(art, u)}
    art = ArtifactStore().get(art.id)
    ArtifactStore().update_fields(art.id, rollout={**art.rollout, "percent": 25})
    at25 = {u for u in users if loader.in_canary(ArtifactStore().get(art.id), u)}
    assert at5 <= at25 and len(at25) > len(at5)


def test_shadow_is_off_by_default(monkeypatch):
    art = new_prompt("master.system", "Be brief.")
    with pytest.raises(rollout.PromotionError):
        rollout.start_shadow(art.id)
    monkeypatch.setenv("AI_SHADOW_ENABLED", "1")
    assert rollout.start_shadow(art.id).status == "shadow"


def test_global_artifacts_require_a_platform_org(monkeypatch):
    art = new_prompt("master.system", "Global.", org=None)
    assert rollout.can_act_on(art, "orgA") is False
    monkeypatch.setenv("AI_PLATFORM_ORG_IDS", "orgA")
    assert rollout.can_act_on(art, "orgA") is True
    org_art = new_prompt("master.system", "Mine.", org="orgB")
    assert rollout.can_act_on(org_art, "orgA") is False and rollout.can_act_on(org_art, "orgB") is True
