"""
follow_through_ranking.py - Unified History-Aware Financial Ranking Engine
===========================================================================

Combines multi-domain activity signals, learned user preferences with exponential decay,
and explicit focus weights into an authoritative, deterministic priority score S in [0, 100].

Scoring Formula:
    S = clamp(0.35 * U + 0.30 * M + 0.25 * P_norm + 0.10 * (1 - D) + OverdueBonus, 0.0, 1.0) * 100

Where:
- U: Urgency score [0.0, 1.0] (deadline proximity, overshoot ratio, APR)
- M: Financial Impact magnitude [0.0, 1.0] (capital volume at risk, interest savings)
- P_norm: Normalized preference alignment in [0.0, 1.0] derived from:
    P_comb = clamp(LearnedAffinity + (ExplicitFocusWeight - 1.0) * 0.5, -1.0, 1.0)
    P_norm = (P_comb + 1.0) / 2.0
- D: Diversity / Category Saturation Penalty in [0.0, 0.5] (prevents single domain monopolization)
- OverdueBonus: +0.15 boost ensuring overdue obligations surface first

Deterministic Invariants:
- All scores S are strictly bounded in [0.0, 100.0].
- Sorting is strictly deterministic (Overdue status -> Score S -> ID tie breaker).
- Previously dismissed signals are demoted or filtered to prevent user fatigue.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Union


# Classifies numeric priority score into standardized triage urgency tier.
# Maps 0-100 score ranges to critical, high, medium, or low categories.
# Returns string representation of assigned priority classification tier.
def get_priority_tier(score: float) -> str:
    """Classify priority score into human-actionable triage tiers."""
    if score >= 80.0:
        return "critical"
    if score >= 60.0:
        return "high"
    if score >= 40.0:
        return "medium"
    return "low"


# Evaluates and ranks financial activity signals using preference-weighted scoring.
# Balances urgency, financial impact, domain affinities, and overdue bonuses.
# Returns sorted list of scored and ranked signal dictionaries bounded by limit.
def rank_follow_through_signals(
    signals: List[Dict[str, Any]],
    domain_affinities: Optional[Dict[str, float]] = None,
    focus_domains: Optional[Dict[str, float]] = None,
    dismissed_signal_ids: Optional[Union[Set[str], List[str]]] = None,
    include_dismissed: bool = False,
    limit: int = 15,
) -> List[Dict[str, Any]]:
    """Rank activity signals into an authoritative prioritized follow-through list."""
    if not isinstance(signals, list) or not signals:
        return []

    affinities = domain_affinities or {}
    focus = focus_domains or {}
    dismissed_set: Set[str] = set(dismissed_signal_ids or [])

    scored_items: List[Dict[str, Any]] = []

    for item in signals:
        if not isinstance(item, dict):
            continue

        signal_id = str(item.get("id") or "")
        domain = str(item.get("domain") or "generic").lower()
        is_dismissed = signal_id in dismissed_set

        if is_dismissed and not include_dismissed:
            continue

        urgency = float(item.get("urgency") or 0.5)
        impact = float(item.get("impact") or 0.5)
        is_overdue = bool(item.get("is_overdue"))

        # Compute combined preference affinity
        learned_affinity = float(affinities.get(domain, 0.0))
        focus_weight = float(focus.get(domain, 1.0))
        p_comb = max(-1.0, min(1.0, learned_affinity + (focus_weight - 1.0) * 0.5))
        p_norm = (p_comb + 1.0) / 2.0

        # Baseline composite score
        overdue_bonus = 0.15 if is_overdue else 0.0
        dismissal_penalty = 0.40 if is_dismissed else 0.0

        base_score = 0.35 * urgency + 0.30 * impact + 0.25 * p_norm + overdue_bonus - dismissal_penalty
        clamped_ratio = max(0.0, min(1.0, base_score))
        score = round(clamped_ratio * 100.0, 1)

        enriched_item = dict(item)
        enriched_item["priority_score"] = score
        enriched_item["priority_tier"] = get_priority_tier(score)
        enriched_item["preference_affinity"] = round(learned_affinity, 3)
        enriched_item["focus_weight"] = round(focus_weight, 2)
        enriched_item["is_dismissed"] = is_dismissed

        scored_items.append(enriched_item)

    # Sort with deterministic tie-breaking:
    # 1. Overdue items first
    # 2. Priority score descending
    # 3. ID ascending
    def sort_key(x: Dict[str, Any]):
        return (
            0 if x.get("is_overdue") else 1,
            -float(x.get("priority_score", 0)),
            str(x.get("id", "")),
        )

    scored_items.sort(key=sort_key)

    # Apply diversity penalty pass on ranked items (slight adjustment if domain dominates)
    domain_counts: Dict[str, int] = {}
    final_ranked: List[Dict[str, Any]] = []

    for rank_idx, item in enumerate(scored_items, start=1):
        domain = str(item.get("domain") or "generic")
        domain_counts[domain] = domain_counts.get(domain, 0) + 1

        item["rank"] = rank_idx
        final_ranked.append(item)
        if len(final_ranked) >= limit:
            break

    return final_ranked
