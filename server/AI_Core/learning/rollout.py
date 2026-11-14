"""
learning/rollout.py - Canary rollout, promotion policy and auto-rollback
========================================================================

Lifecycle of a gated candidate::

    draft --(approval or auto_prompts)--> canary 5% -> 25% -> 100% --> active
                                              |                          |
                              guardrail breach (any time) -> rollback: retire the artifact,
                              restore the previous active artifact, write an audit entry

Promotion policy (``AI_PROMOTION_MODE``):

* ``suggest``      - candidates are only reported; ``promote`` returns 409
                     ``PROMOTION_SUGGEST_ONLY``.
* ``human`` (default) - an admin approves.  Approving a draft starts the canary;
                     approving a canary that has reached 100% (or any canary the
                     admin chooses to finish) makes it active.
* ``auto_prompts`` - passing *prompt / exemplar* candidates start their own canary
                     and are auto-promoted after a clean 100% step.  Routing (and
                     model) candidates ALWAYS need an admin; they only enter canary
                     automatically when ``AI_ROUTING_CANARY_AUTO`` is set and are
                     never auto-promoted.

Canary bucketing is sticky (``registry.loader.in_canary``: sha256(user-or-org:id)).
Guardrails compare the canary cohort with the baseline cohort over the current step
window: thumbs-down, fallback, verification-failure, latency, cost and error rates.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional

from registry.models import ArtifactBase, artifact_to_api, to_camel_json
from registry.store import ArtifactError, ArtifactStore, NotFound, TransitionError
from utils.mongo_client import get_mongo_db

from . import config

logger = logging.getLogger(__name__)

DECISIONS = "ai_rollout_decisions"
MONITOR_DAYS = 7

# Guardrail bounds (candidate cohort vs baseline cohort).
MAX_THUMBS_DOWN_DELTA = 0.10
MAX_THUMBS_DOWN_ABS = 0.40
MAX_FALLBACK_DELTA = 0.10
MAX_VERIFICATION_FAILURE_DELTA = 0.02  # number safety: effectively zero tolerance
MAX_ERROR_DELTA = 0.05
MAX_LATENCY_RATIO = 1.5
MAX_COST_RATIO = 1.25


# Base exception raised when artifact rollout or promotion transition fails.
# Subclasses ArtifactError providing specialized domain failure codes.
# Serves as root error class for all lifecycle promotion guardrail blocks.
class PromotionError(ArtifactError):
    code = "PROMOTION_ERROR"


# Exception raised when promotion is attempted while suggest-only policy is set.
# Signals that system configuration strictly permits advisory reporting.
# Prevents unauthorized candidate activation in observation-only mode.
class PromotionSuggestOnly(PromotionError):
    code = "PROMOTION_SUGGEST_ONLY"


# Exception indicating candidate promotion was denied due to failing gating checks.
# Prevents unvalidated candidates from progressing into canary deployment tiers.
# Enforces mandatory quality assertion compliance prior to rollout.
class GateNotPassed(PromotionError):
    code = "GATE_NOT_PASSED"


# Exception raised when actor lacks authority to modify target artifact scope.
# Protects multi-tenant isolation by restricting global actions to platform orgs.
# Enforces strict permissions across organization-scoped promotion requests.
class Forbidden(PromotionError):
    code = "FORBIDDEN"


# Obtains current timezone-aware UTC datetime for rollout lifecycle steps.
# Supplies standardized audit timestamps across promotion actions.
# Used in decision records, canary transitions, and guardrail intervals.
def _now() -> datetime:
    return datetime.now(timezone.utc)


# Ensures input datetime object carries explicit timezone information.
# Replaces naive timezone with UTC or returns value untouched if aware.
# Returns None when supplied value is not an instance of datetime.
def _aware(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return None


# ---------------------------------------------------------------------------
# Decision log
# ---------------------------------------------------------------------------
# Records audit log entry in database capturing rollout lifecycle decision.
# Documents targeted artifact, action taken, reason text, actor, and metrics.
# Suppresses database write errors to maintain uninterrupted rollout execution.
def record_decision(
    artifact: ArtifactBase,
    action: str,
    reason: str = "",
    *,
    actor: str = "system",
    auto: bool = True,
    metrics: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    doc = {
        "artifact_id": artifact.id,
        "kind": artifact.kind,
        "key": artifact.key,
        "version": artifact.version,
        "scope": artifact.scope,
        "org_id": artifact.org_id,
        "action": action,
        "reason": (reason or "")[:500],
        "actor": actor,
        "auto": bool(auto),
        "metrics": metrics or {},
        "at": _now(),
    }
    try:
        get_mongo_db()[DECISIONS].insert_one(dict(doc))
    except Exception as exc:  # pragma: no cover
        logger.warning("rollout_decision_failed", extra={"event": "rollout_decision_failed", "error": str(exc)[:200]})
    return doc


# Queries historical rollout decisions visible within organization context.
# Returns chronologically sorted decision records converted to camelCase JSON.
# Filters for organization-specific actions along with global system decisions.
def last_decisions(org_id: Optional[str], limit: int = 10) -> List[Dict[str, Any]]:
    flt: Dict[str, Any] = {}
    if org_id is not None:
        flt["$or"] = [{"org_id": org_id}, {"org_id": None}]
    rows = list(get_mongo_db()[DECISIONS].find(flt).sort("at", -1).limit(max(1, min(100, limit))))
    out = []
    for row in rows:
        row.pop("_id", None)
        out.append(to_camel_json(row))
    return out


# Lists all active canary artifacts currently being evaluated in an org.
# Scans ArtifactStore for records currently residing in canary deployment status.
# Formats output documents according to external API representation schemas.
def active_canaries(org_id: Optional[str]) -> List[Dict[str, Any]]:
    store = ArtifactStore()
    flt: Dict[str, Any] = {"status": "canary"}
    if org_id is not None:
        flt["$or"] = [{"scope": "global"}, {"scope": "org", "org_id": org_id}]
    from registry.models import artifact_from_doc

    docs = list(store.col.find(flt).sort("updated_at", -1).limit(100))
    return [artifact_to_api(artifact_from_doc(d)) for d in docs]


# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------
# Verifies that candidate artifact has passed required promotion gating checks.
# Raises GateNotPassed exception if gate_passed attribute evaluates to false.
# Guarantees that unverified artifacts cannot be transitioned or deployed.
def _require_gate(artifact: ArtifactBase) -> None:
    if not artifact.gate_passed:
        raise GateNotPassed(f"artifact {artifact.id} has not passed the promotion gate")


# Asserts whether caller organization possesses authority to modify artifact.
# Requires tenant match for org artifacts and platform membership for global ones.
# Protects multi-tenant isolation boundaries during rollout and promotion steps.
def can_act_on(artifact: ArtifactBase, org_id: str) -> bool:
    """Org admins act on their own org's artifacts; global ones need a platform org."""
    if artifact.scope == "org":
        return artifact.org_id == org_id
    platform = config.platform_org_ids()
    return org_id in platform


# Initiates canary deployment phase for an evaluated candidate artifact.
# Configures initial percentage traffic slice and records start timestamps.
# Emits canary start transition event into decision tracking repository.
def start_canary(artifact_id: str, *, actor: str = "system", auto: bool = True, reason: str = "") -> ArtifactBase:
    store = ArtifactStore()
    artifact = store.get(artifact_id)
    if artifact is None:
        raise NotFound(artifact_id)
    _require_gate(artifact)
    first = config.canary_steps()[0]
    now = _now()
    updated = store.set_status(
        artifact_id,
        "canary",
        actor=actor,
        reason=reason or "canary start",
        auto=auto,
        extra={"rollout": {"percent": first, "step": 0, "startedAt": now, "stepStartedAt": now}},
    )
    record_decision(updated, "canary_start", reason or f"canary at {first}%", actor=actor, auto=auto)
    return updated


# Activates shadow evaluation mode for candidate artifact without serving traffic.
# Validates system shadow mode enable flag before permitting transition.
# Registers shadow status transition in artifact store and audit logs.
def start_shadow(artifact_id: str, *, actor: str = "system") -> ArtifactBase:
    """Shadow state is OFF by default (``AI_SHADOW_ENABLED``)."""
    if not config.shadow_enabled():
        raise PromotionError("shadow mode is disabled (AI_SHADOW_ENABLED)")
    store = ArtifactStore()
    artifact = store.get(artifact_id)
    if artifact is None:
        raise NotFound(artifact_id)
    _require_gate(artifact)
    updated = store.set_status(artifact_id, "shadow", actor=actor, reason="shadow start", auto=False)
    record_decision(updated, "shadow_start", "", actor=actor, auto=False)
    return updated


# Promotes artifact to active serving status, superseding existing active version.
# Updates rollout percentage allocation to 100% and marks timestamp.
# Retires previous active artifact for the slot and records promotion audit event.
def finalize(artifact_id: str, *, actor: str, auto: bool, reason: str = "") -> ArtifactBase:
    """Make ``artifact_id`` the active artifact for its slot, retiring the previous one."""
    store = ArtifactStore()
    artifact = store.get(artifact_id)
    if artifact is None:
        raise NotFound(artifact_id)
    _require_gate(artifact)
    previous = store.active_for(artifact.kind, artifact.key, artifact.scope, artifact.org_id)
    previous_id = previous.id if previous is not None and previous.id != artifact.id else None
    rollout = dict(artifact.rollout or {})
    rollout.update({"percent": 100, "promotedAt": _now()})
    updated = store.set_status(
        artifact_id,
        "active",
        actor=actor,
        reason=reason or "promoted",
        auto=auto,
        extra={"previous_active_id": previous_id, "rollout": rollout},
    )
    if previous_id:
        try:
            store.set_status(previous_id, "retired", actor=actor, reason=f"superseded by {artifact_id}", auto=auto)
        except ArtifactError:  # pragma: no cover
            pass
    record_decision(updated, "promoted", reason, actor=actor, auto=auto)
    return updated


# Processes explicit administrator approval promoting candidate through stages.
# Moves drafts or shadow artifacts into canary and promotes 100% canaries to active.
# Enforces promotion policy constraints and verifies gating status before advancing.
def promote(artifact_id: str, *, actor: str, note: str = "") -> ArtifactBase:
    """Admin approval.  draft/shadow -> canary (5%); canary -> active."""
    mode = config.promotion_mode()
    if mode == "suggest":
        raise PromotionSuggestOnly("AI_PROMOTION_MODE=suggest: promotion is disabled")
    store = ArtifactStore()
    artifact = store.get(artifact_id)
    if artifact is None:
        raise NotFound(artifact_id)
    _require_gate(artifact)
    if artifact.status in ("draft", "shadow"):
        return start_canary(artifact_id, actor=actor, auto=False, reason=note or "admin approved")
    if artifact.status == "canary":
        return finalize(artifact_id, actor=actor, auto=False, reason=note or "admin promoted")
    raise TransitionError(f"cannot promote an artifact in status {artifact.status}")


# Retires specified artifact and reactivates its predecessor active version.
# Reverts slot to previous stable artifact state when regression is detected.
# Logs audit entry capturing reason note and associated regression metrics.
def rollback(
    artifact_id: str,
    *,
    actor: str,
    note: str = "",
    auto: bool = False,
    metrics: Optional[Dict[str, Any]] = None,
) -> ArtifactBase:
    """Retire ``artifact_id`` and restore the previous active artifact (if it was retired)."""
    store = ArtifactStore()
    artifact = store.get(artifact_id)
    if artifact is None:
        raise NotFound(artifact_id)
    if artifact.status == "retired":
        return artifact
    retired = store.set_status(
        artifact_id, "retired", actor=actor, reason=note or "rollback", auto=auto, metrics=metrics
    )
    restored_id = None
    previous_id = artifact.previous_active_id
    if previous_id:
        previous = store.get(previous_id)
        if previous is not None and previous.status == "retired":
            store.set_status(previous_id, "active", actor=actor, reason=f"restored after rollback of {artifact_id}", auto=auto)
            restored_id = previous_id
    record_decision(
        retired,
        "rollback",
        note or "rollback",
        actor=actor,
        auto=auto,
        metrics={**(metrics or {}), "restored": restored_id},
    )
    return retired


# ---------------------------------------------------------------------------
# Guardrails
# ---------------------------------------------------------------------------
# Calculates minimum sample threshold required before assessing guardrail breaches.
# Defaults to one third of the full sample size with a hard lower bound of three.
# Prevents erratic rollback triggers from sparse preliminary observation noise.
def breach_min_samples(min_samples: Optional[int] = None) -> int:
    ms = min_samples if min_samples is not None else config.canary_min_samples()
    return max(3, ms // 3)


# Evaluates candidate cohort metrics against baseline across safety guardrails.
# Checks thumbs down rates, fallback occurrences, verification flags, and costs.
# Returns breach indicators and booleans signifying whether sample size suffices.
def assess(cand: Dict[str, Any], base: Dict[str, Any], *, min_samples: Optional[int] = None) -> Dict[str, Any]:
    """Pure guardrail evaluation -> ``{breaches, runs, enoughForBreach, enoughToAdvance}``."""
    min_samples = min_samples if min_samples is not None else config.canary_min_samples()
    runs = int(cand.get("runs", 0) or 0)
    breaches: List[str] = []
    if runs >= breach_min_samples(min_samples):
        down = float(cand.get("thumbsDownRate", 0.0))
        if down > MAX_THUMBS_DOWN_ABS or down > float(base.get("thumbsDownRate", 0.0)) + MAX_THUMBS_DOWN_DELTA:
            breaches.append("thumbs_down_rate")
        if float(cand.get("fallbackRate", 0.0)) > float(base.get("fallbackRate", 0.0)) + MAX_FALLBACK_DELTA:
            breaches.append("fallback_rate")
        if (
            float(cand.get("verificationFailureRate", 0.0))
            > float(base.get("verificationFailureRate", 0.0)) + MAX_VERIFICATION_FAILURE_DELTA
        ):
            breaches.append("verification_failure_rate")
        if float(cand.get("errorRate", 0.0)) > float(base.get("errorRate", 0.0)) + MAX_ERROR_DELTA:
            breaches.append("error_rate")
        base_latency = float(base.get("avgLatencyMs", 0.0))
        if base_latency > 0 and float(cand.get("avgLatencyMs", 0.0)) > base_latency * MAX_LATENCY_RATIO:
            breaches.append("latency")
        base_tokens = float(base.get("avgTokens", 0.0))
        if base_tokens > 0 and float(cand.get("avgTokens", 0.0)) > base_tokens * MAX_COST_RATIO:
            breaches.append("cost")
    return {
        "breaches": breaches,
        "runs": runs,
        "enoughForBreach": runs >= breach_min_samples(min_samples),
        "enoughToAdvance": runs >= min_samples,
    }


# Evaluates canary artifact performance against baseline to trigger actions.
# Initiates automated rollback upon detecting any guardrail violation breach.
# Advances canary step percentages or promotes clean candidate on 100% rollout.
def evaluate(artifact: ArtifactBase, *, advance: bool = True) -> Dict[str, Any]:
    """Evaluate one canary (or freshly promoted active) artifact; act on the verdict."""
    from . import run_store

    store = ArtifactStore()
    rollout = dict(artifact.rollout or {})
    since = _aware(rollout.get("stepStartedAt")) or _aware(rollout.get("promotedAt")) or _aware(artifact.updated_at)
    cand = run_store.artifact_stats(artifact.id, since=since)
    base = run_store.baseline_stats(artifact.id, artifact.org_id, since=since)
    verdict = assess(cand, base)
    metrics = {"candidate": cand, "baseline": base, "breaches": verdict["breaches"]}

    if verdict["breaches"]:
        reason = "guardrail breach: " + ", ".join(verdict["breaches"])
        rollback(artifact.id, actor="system", note=reason, auto=True, metrics=metrics)
        return {"artifactId": artifact.id, "action": "rollback", "reason": reason, "metrics": metrics}

    if not advance or artifact.status != "canary" or not verdict["enoughToAdvance"]:
        return {"artifactId": artifact.id, "action": "wait", "runs": verdict["runs"], "metrics": metrics}

    steps = list(config.canary_steps())
    current = float(rollout.get("percent", steps[0]))
    nxt = next((s for s in steps if s > current), None)
    if nxt is not None:
        now = _now()
        rollout.update({"percent": nxt, "step": int(rollout.get("step", 0)) + 1, "stepStartedAt": now})
        store.update_fields(artifact.id, rollout=rollout)
        record_decision(artifact, "canary_advance", f"{current:g}% -> {nxt}%", metrics=metrics)
        return {"artifactId": artifact.id, "action": "advance", "percent": nxt, "metrics": metrics}

    # Clean 100% step.
    if config.promotion_mode() == "auto_prompts" and artifact.kind in ("prompt", "exemplar"):
        finalize(artifact.id, actor="system", auto=True, reason="auto_prompts: clean canary")
        return {"artifactId": artifact.id, "action": "promoted", "metrics": metrics}
    if not rollout.get("readyForPromotion"):
        rollout["readyForPromotion"] = True
        store.update_fields(artifact.id, rollout=rollout)
        record_decision(artifact, "ready_for_promotion", "awaiting admin approval", metrics=metrics)
    return {"artifactId": artifact.id, "action": "ready_for_promotion", "metrics": metrics}


# Determines whether artifact is subject to continuous guardrail monitoring.
# Monitors all active canaries and freshly promoted active artifacts.
# Restricts active monitoring window to configured post-promotion monitor days.
def _monitored(artifact: ArtifactBase) -> bool:
    if artifact.status == "canary":
        return True
    if artifact.status != "active" or not artifact.previous_active_id:
        return False
    promoted = _aware((artifact.rollout or {}).get("promotedAt"))
    return promoted is not None and _now() - promoted < timedelta(days=MONITOR_DAYS)


# Periodic scheduled sweep evaluating guardrails across monitored artifacts.
# Scans canaries and recent promotions to trigger auto-advancement or rollback.
# Collects execution evaluation results while isolating per-artifact failures.
def tick() -> List[Dict[str, Any]]:
    """Evaluate every canary / recently promoted artifact (periodic job)."""
    from registry.models import artifact_from_doc

    store = ArtifactStore()
    docs = list(store.col.find({"status": {"$in": ["canary", "active"]}}).limit(500))
    results: List[Dict[str, Any]] = []
    for doc in docs:
        try:
            artifact = artifact_from_doc(doc)
            if _monitored(artifact):
                results.append(evaluate(artifact))
        except Exception as exc:  # one broken artifact must not stop the sweep
            logger.warning("rollout_tick_failed", extra={"event": "rollout_tick_failed", "error": str(exc)[:200]})
    return results


# Rapid-response guardrail check evaluated immediately upon negative user feedback.
# Re-evaluates involved artifacts to trigger instant rollback on breach.
# Disables canary stage advancement during emergency negative reaction checks.
def check_artifacts_after_feedback(artifact_ids: Iterable[str]) -> List[Dict[str, Any]]:
    """Fast guard after a thumbs-down: rollback only (never advance)."""
    store = ArtifactStore()
    results = []
    for aid in dict.fromkeys(artifact_ids):
        artifact = store.get(aid)
        if artifact is not None and _monitored(artifact):
            result = evaluate(artifact, advance=False)
            if result["action"] == "rollback":
                results.append(result)
    return results


# ---------------------------------------------------------------------------
# Candidate intake (called after the gate)
# ---------------------------------------------------------------------------
# Dispatches freshly gated candidate into appropriate rollout lifecycle stage.
# Retires failing candidates and honors suggest-only policy configurations.
# Automatically launches canaries under auto_prompts or awaits administrator review.
def route_candidate(artifact_id: str) -> str:
    """Apply the promotion policy to a freshly gated draft; returns the decision tag."""
    store = ArtifactStore()
    artifact = store.get(artifact_id)
    if artifact is None:
        raise NotFound(artifact_id)
    if not artifact.gate_passed:
        store.set_status(artifact_id, "retired", actor="system", reason="gate failed", auto=True)
        record_decision(artifact, "gate_failed", "candidate retired after failing the gate")
        return "gate_failed"
    mode = config.promotion_mode()
    if mode == "suggest":
        record_decision(artifact, "suggested", "suggest mode: report only")
        return "suggested"
    if mode == "auto_prompts":
        if artifact.kind in ("prompt", "exemplar"):
            start_canary(artifact_id, actor="system", auto=True, reason="auto_prompts: gate passed")
            return "canary"
        if config.routing_canary_auto():
            start_canary(artifact_id, actor="system", auto=True, reason="routing canary auto (never auto-promoted)")
            return "canary"
    record_decision(artifact, "awaiting_admin", "gate passed; admin approval required")
    return "awaiting_admin"
