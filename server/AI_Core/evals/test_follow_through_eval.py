"""
test_follow_through_eval.py - Automated Unit & Integration Tests for Follow-Through Engine
========================================================================================
"""

from __future__ import annotations

from evals.follow_through_evaluator import (
    GOLDEN_FOLLOW_THROUGH_CASES,
    FollowThroughEvaluator,
)
from utils.activity_signals import extract_activity_signals
from utils.follow_through_ranking import rank_follow_through_signals
from utils.preference_learning import (
    compute_time_decay,
    learn_preferences_from_feedback,
)


def test_follow_through_evaluator_golden_cases():
    evaluator = FollowThroughEvaluator()
    result = evaluator.evaluate_all()

    assert result.failed_cases == 0, f"Evaluation failures: {result.details}"
    assert result.passed_cases == result.total_cases
    assert result.all_scores_bounded
    assert result.overdue_invariance_satisfied
    assert result.decay_attenuation_verified


def test_multi_domain_signal_extraction_structure():
    case = GOLDEN_FOLLOW_THROUGH_CASES[0]
    signals = extract_activity_signals(case.context, case.profile)

    domains = {s["domain"] for s in signals}
    assert {"task", "goal", "budget", "reminder", "recurring", "debt"}.issubset(domains)

    for s in signals:
        assert s["id"]
        assert s["title"]
        assert s["action_url"].startswith("/")
        assert 0.0 <= s["urgency"] <= 1.0
        assert 0.0 <= s["impact"] <= 1.0


def test_preference_learning_upvote_and_dismissal():
    feedback = [
        {"domain": "debt", "signal_id": "debt:1", "action": "upvote", "created_at": "2026-11-01T12:00:00Z"},
        {"domain": "recurring", "signal_id": "recurring:1", "action": "dismiss", "created_at": "2026-11-01T12:00:00Z"},
    ]
    pref = learn_preferences_from_feedback(feedback, current_time_iso="2026-11-01T12:00:00Z")

    affinities = pref["domain_affinities"]
    assert affinities["debt"] > 0.3
    assert affinities["recurring"] < -0.4
    assert "recurring:1" in pref["dismissed_signal_ids"]


def test_exponential_time_decay_attenuation():
    # 14-day half-life: at delta = 14 days, weight should be approx 0.50
    w_0 = compute_time_decay("2026-11-01T00:00:00Z", "2026-11-01T00:00:00Z", half_life_days=14.0)
    w_14 = compute_time_decay("2026-10-18T00:00:00Z", "2026-11-01T00:00:00Z", half_life_days=14.0)
    w_28 = compute_time_decay("2026-10-04T00:00:00Z", "2026-11-01T00:00:00Z", half_life_days=14.0)

    assert abs(w_0 - 1.0) < 0.01
    assert abs(w_14 - 0.50) < 0.02
    assert abs(w_28 - 0.25) < 0.02


def test_ranking_determinism_and_overdue_priority():
    signals = [
        {"id": "s1", "domain": "task", "title": "Normal task", "urgency": 0.5, "impact": 0.5, "is_overdue": False},
        {"id": "s2", "domain": "task", "title": "Overdue bill", "urgency": 0.9, "impact": 0.8, "is_overdue": True},
        {"id": "s3", "domain": "budget", "title": "Overshot budget", "urgency": 0.8, "impact": 0.6, "is_overdue": False},
    ]

    ranked_1 = rank_follow_through_signals(signals)
    ranked_2 = rank_follow_through_signals(signals)

    # Identical deterministic output
    assert [x["id"] for x in ranked_1] == [x["id"] for x in ranked_2]
    # Overdue is first
    assert ranked_1[0]["id"] == "s2"
    assert ranked_1[0]["is_overdue"] is True
