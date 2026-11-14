"""
learning/config.py - Env-driven settings for the self-improvement loop
=====================================================================

Read lazily (every call) so tests can monkeypatch the environment.  This module
deliberately does not touch ``config/settings.py``.
"""

from __future__ import annotations

import os
from typing import FrozenSet

PROMOTION_MODES = ("suggest", "human", "auto_prompts")
DEFAULT_PROMOTION_MODE = "human"


# Parses integer environment variables clamped between minimum and maximum bounds.
# Catches value parsing exceptions and returns provided fallback default integer.
# Ensures numeric bounds enforcement for runtime resource limits and timeouts.
def _int(name: str, default: int, lo: int = 0, hi: int = 10**9) -> int:
    try:
        value = int(float(os.getenv(name, "") or default))
    except ValueError:
        value = default
    return max(lo, min(hi, value))


# Parses floating point environment variables clamped within boundary limits.
# Falls back to default float value if parsing fails or environment is unset.
# Safeguards ratio and budget configurations against malformed values.
def _float(name: str, default: float, lo: float = 0.0, hi: float = 1e9) -> float:
    try:
        value = float(os.getenv(name, "") or default)
    except ValueError:
        value = default
    return max(lo, min(hi, value))


# Evaluates truthy boolean values from environment variable string flags.
# Matches common boolean representations such as true, 1, yes, and on.
# Returns default boolean if environment variable is blank or absent.
def _flag(name: str, default: bool = False) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


# Splits comma-separated values from environment string into a frozen set.
# Strips extraneous whitespace and eliminates empty or blank substrings.
# Provides immutable lookup collections for organization ID whitelists.
def _csv(name: str) -> FrozenSet[str]:
    return frozenset(p.strip() for p in (os.getenv(name) or "").split(",") if p.strip())


# Resolves active self-improvement candidate promotion policy from environment.
# Validates mode against allowed set of suggest, human, or auto_prompts.
# Defaults to human review mode when unset or unrecognized value given.
def promotion_mode() -> str:
    """``suggest`` | ``human`` (default) | ``auto_prompts``; unknown -> human."""
    mode = (os.getenv("AI_PROMOTION_MODE") or DEFAULT_PROMOTION_MODE).strip().lower()
    return mode if mode in PROMOTION_MODES else DEFAULT_PROMOTION_MODE


# Determines time-to-live retention lifespan in days for logged run traces.
# Reads environment configuration clamped between 1 day and 365 days.
# Supplies retention limits for automated database TTL index expiration.
def run_ttl_days() -> int:
    return _int("AI_RUN_TTL_DAYS", 30, 1, 365)


# Configures capacity limit for asynchronous learning analytics write queue.
# Clamps queue size between 10 items and 100,000 items to protect memory.
# Prevents memory exhaustion during unexpected telemetry logging spikes.
def run_buffer_size() -> int:
    return _int("AI_RUN_BUFFER_SIZE", 2000, 10, 100000)


# Sets upper ceiling of LLM inference queries permitted per optimization run.
# Clamps call budget between zero and twenty inferences to restrict costs.
# Defaults to zero which enforces pure heuristic optimization strategies.
def optimizer_llm_budget() -> int:
    """Max LLM calls per optimizer run; 0 (default) = heuristics only."""
    return _int("AI_OPTIMIZER_LLM_BUDGET", 0, 0, 20)


# Checks whether multi-armed bandit model selection is enabled in environment.
# Reads LLM_BANDIT_ENABLED flag defaulting to false for deterministic order.
# Governs dynamic Thompson sampling reordering for model endpoint candidates.
def bandit_enabled() -> bool:
    return _flag("LLM_BANDIT_ENABLED", False)


# Determines whether model routing candidates enter canary rollout automatically.
# Controls autonomous staging of candidate configurations without manual triggers.
# Returns boolean flag defaulting to false for strict human approval.
def routing_canary_auto() -> bool:
    """Routing/model candidates may enter canary automatically (never promote)."""
    return _flag("AI_ROUTING_CANARY_AUTO", False)


# Determines if shadow inference evaluation traffic is active in the system.
# Reads AI_SHADOW_ENABLED environment flag with safe default of false.
# Controls parallel background evaluation of candidate configurations.
def shadow_enabled() -> bool:
    return _flag("AI_SHADOW_ENABLED", False)


# Returns immutable set of platform administrative organization identifiers.
# Reads comma-delimited environment variable list into a frozen set.
# Designates organizations permitted to inspect and alter global artifacts.
def platform_org_ids() -> FrozenSet[str]:
    """Orgs whose admins may act on global artifacts."""
    return _csv("AI_PLATFORM_ORG_IDS")


# Retrieves frozen set of organization IDs that opted out of learning data.
# Parses comma-separated list from AI_LEARNING_OPT_OUT_ORGS environment.
# Ensures data governance by excluding specified tenant runs from optimization.
def opt_out_orgs() -> FrozenSet[str]:
    return _csv("AI_LEARNING_OPT_OUT_ORGS")


# Asserts whether a given organization has opted out from learning collection.
# Checks organization identifier membership within the opt-out registry set.
# Safeguards proprietary tenant telemetry from model improvement ingestion.
def org_opted_out(org_id: str) -> bool:
    return bool(org_id) and org_id in opt_out_orgs()


# Computes absolute filesystem target path for saving evaluation reports.
# Respects AI_EVAL_REPORT_DIR if specified or falls back to docs evaluations.
# Resolves normalized destination directory across development environments.
def report_dir() -> str:
    explicit = (os.getenv("AI_EVAL_REPORT_DIR") or "").strip()
    if explicit:
        return explicit
    here = os.path.dirname(os.path.abspath(__file__))
    # <repo>/server/AI_Core/learning -> <repo>/docs/records/evaluations
    return os.path.normpath(os.path.join(here, "..", "..", "..", "docs", "records", "evaluations"))


# Specifies minimum volume of user feedback required to generate candidate.
# Clamps sample count requirement between 1 and 1000 feedback events.
# Ensures statistical substance before proposing revised prompt variations.
def min_feedback_for_candidate() -> int:
    return _int("AI_OPTIMIZER_MIN_FEEDBACK", 5, 1, 1000)


# Returns staged percentage traffic milestones for canary rollouts.
# Progresses traffic allocation through 5%, 25%, and 100% phases.
# Standardizes incremental validation progression across prompt versions.
def canary_steps() -> tuple:
    return (5, 25, 100)


# Returns minimum sample size required before progressing a canary phase.
# Reads AI_CANARY_MIN_SAMPLES configuration bounded between 1 and 100,000.
# Guards against premature promotion based on insufficient sample volume.
def canary_min_samples() -> int:
    return _int("AI_CANARY_MIN_SAMPLES", 30, 1, 100000)


# Specifies minimum distinct organizations needed to graduate global prompts.
# Ensures cross-tenant generalization rather than overfitting one organization.
# Reads AI_GLOBAL_MIN_ORGS setting defaulting to a minimum of three orgs.
def global_min_orgs() -> int:
    return _int("AI_GLOBAL_MIN_ORGS", 3, 1, 1000)


# Returns minimum aggregate feedback events needed for global promotion.
# Protects against low-traffic artifact changes by enforcing volume thresholds.
# Clamps requirement between 10 events and 100,000 feedback points.
def global_min_events() -> int:
    return _int("AI_GLOBAL_MIN_EVENTS", 10, 1, 100000)


# Calculates allowable token consumption expansion ceiling for candidates.
# Caps candidate token cost ratio between 1.0 and 10.0 times baseline cost.
# Prevents prompt optimization from silently triggering runaway token expenses.
def gate_cost_cap_ratio() -> float:
    """Candidate average tokens may exceed baseline by at most this ratio."""
    return _float("AI_GATE_COST_CAP_RATIO", 1.15, 1.0, 10.0)
