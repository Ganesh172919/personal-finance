"""
preference_learning.py - Adaptive Preference Learning with Exponential Time Decay
================================================================================

Learns user affinity and aversion toward financial follow-through categories
based on real interaction signals (upvotes/prioritize, dismissals, completions).

Mathematical Properties:
- Half-life Exponential Time Decay:
    w(Delta_t) = exp(- ln(2) * Delta_t / T_half)
    Recent user feedback heavily shapes priority; older interactions attenuate smoothly.
- Domain Affinity Score P_domain in [-1.0, 1.0]:
    +1.0 = Highly preferred focus area (reinforced by upvotes/completions)
    -1.0 = Heavily suppressed / disliked area (penalized by repeated dismissals)
- Signal-level suppression:
    Recently dismissed signals are tracked to prevent nagging repetition.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

DEFAULT_HALF_LIFE_DAYS = 14.0


# Parses ISO 8601 formatted datetime string into timezone-aware UTC datetime.
# Normalizes UTC offsets and assigns UTC timezone if string lacks tzinfo.
# Falls back to current UTC datetime if parsing fails or input is missing.
def _parse_dt(iso_str: Any) -> datetime:
    if not iso_str:
        return datetime.now(timezone.utc)
    s = str(iso_str).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return datetime.now(timezone.utc)


# Calculates exponential time decay weighting factor based on elapsed days.
# Applies mathematical half-life formula to attenuate older feedback signals.
# Returns bounded decay weight factor between 0.001 and 1.0.
def compute_time_decay(
    event_time_iso: Any,
    current_time_iso: Any = None,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
) -> float:
    """Compute exponential decay factor w in (0, 1] given elapsed days."""
    event_dt = _parse_dt(event_time_iso)
    curr_dt = _parse_dt(current_time_iso)

    delta_seconds = max(0.0, (curr_dt - event_dt).total_seconds())
    delta_days = delta_seconds / 86400.0

    if half_life_days <= 0:
        return 1.0

    # w = exp(- ln(2) * delta_days / half_life_days)
    decay = math.exp(-0.69314718056 * (delta_days / half_life_days))
    return max(0.001, min(1.0, decay))


# Infers user domain affinities and suppressed signals from feedback history.
# Aggregates weighted interactions with exponential decay across financial domains.
# Returns dictionary containing clamped affinity scores and dismissed signal IDs.
def learn_preferences_from_feedback(
    feedback_history: Optional[List[Dict[str, Any]]],
    current_time_iso: Optional[str] = None,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
) -> Dict[str, Any]:
    """Analyze feedback event history and return learned domain affinities and suppressed IDs.

    Returns:
        {
            "domain_affinities": { "budget": 0.35, "debt": -0.60, ... },
            "dismissed_signal_ids": set of signal IDs dismissed within recent window,
            "total_events": int,
            "summary": str,
        }
    """
    if not isinstance(feedback_history, list) or not feedback_history:
        return {
            "domain_affinities": {},
            "dismissed_signal_ids": set(),
            "total_events": 0,
            "summary": "No feedback history; using baseline priorities.",
        }

    raw_scores: Dict[str, float] = {}
    dismissed_ids: Set[str] = set()

    for event in feedback_history:
        if not isinstance(event, dict):
            continue

        domain = str(event.get("domain") or "").lower().strip()
        action = str(event.get("action") or "").lower().strip()
        signal_id = str(event.get("signal_id") or event.get("signalId") or "").strip()
        created_at = event.get("created_at") or event.get("createdAt")

        decay = compute_time_decay(created_at, current_time_iso, half_life_days)

        # Action weights
        if action in {"upvote", "prioritize", "boost"}:
            delta = +0.40 * decay
        elif action in {"complete", "applied"}:
            delta = +0.25 * decay
        elif action in {"dismiss", "hide", "downvote"}:
            delta = -0.50 * decay
            if signal_id:
                dismissed_ids.add(signal_id)
        else:
            delta = 0.0

        if domain:
            raw_scores[domain] = raw_scores.get(domain, 0.0) + delta

    # Clamp domain affinities to [-1.0, 1.0]
    affinities: Dict[str, float] = {}
    for dom, score in raw_scores.items():
        affinities[dom] = round(max(-1.0, min(1.0, score)), 3)

    return {
        "domain_affinities": affinities,
        "dismissed_signal_ids": dismissed_ids,
        "total_events": len(feedback_history),
        "summary": f"Learned preferences from {len(feedback_history)} feedback events.",
    }
