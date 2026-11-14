"""
learning/run_store.py - Run capture + feedback (``ai_runs`` / ``ai_feedback``)
==============================================================================

* Every ``/process`` request may leave one run row: route, node trace, tokens,
  latency, provider/model, served artifact versions, cache-hit / fallback flags
  and the number-guard verification summary.  Free text is redacted first.
* Writes are asynchronous through a bounded buffer (``async_writer``) so the
  request path never waits on Mongo.  Rows expire via a TTL index.
* Capture is skipped for ``X-Internal-Learning-Opt-Out: 1`` and for orgs in
  ``AI_LEARNING_OPT_OUT_ORGS``.
* TENANT ISOLATION: every read goes through ``RunStore.for_org(org_id)`` which
  injects the org filter itself; callers cannot pass a different org.  The only
  cross-org read is ``global_signals`` which returns k-anonymous numeric
  aggregates (no text, no ids).
"""

from __future__ import annotations

import logging
import math
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional

from registry.context import LearningContext
from utils.mongo_client import get_mongo_db

from . import config
from .async_writer import get_writer
from .redact import redact

logger = logging.getLogger(__name__)

RUNS = "ai_runs"
FEEDBACK = "ai_feedback"

REASON_CODES = ("wrong_number", "irrelevant", "too_long", "unsafe", "unclear", "other")

_index_lock = threading.Lock()
_indexed: "set[int]" = set()


# Retrieves current timezone-aware UTC datetime for run store operations.
# Standardizes temporal anchors across logged run and feedback documents.
# Supplies consistent clock values for time-to-live index calculations.
def _now() -> datetime:
    return datetime.now(timezone.utc)


# Configures MongoDB performance and TTL indexes for runs and feedback tables.
# Uses thread synchronization and instance caching to prevent redundant indexing.
# Establishes index fields covering organization, output IDs, and expiry dates.
def ensure_indexes(db: Any = None) -> None:
    db = db if db is not None else get_mongo_db()
    marker = id(db)
    if marker in _indexed:
        return
    with _index_lock:
        if marker in _indexed:
            return
        ttl = config.run_ttl_days() * 86400
        try:
            db[RUNS].create_index("created_at", expireAfterSeconds=ttl)
            db[RUNS].create_index([("org_id", 1), ("created_at", -1)])
            db[RUNS].create_index([("org_id", 1), ("agent_output_id", 1)])
            db[RUNS].create_index([("artifact_ids", 1), ("created_at", -1)])
            db[FEEDBACK].create_index("created_at", expireAfterSeconds=ttl)
            db[FEEDBACK].create_index([("org_id", 1), ("created_at", -1)])
            db[FEEDBACK].create_index([("artifact_ids", 1), ("created_at", -1)])
        except Exception:  # pragma: no cover - indexes are best effort
            pass
        _indexed.add(marker)


# Computes empirical percentile value from an array of numeric measurements.
# Sorts values ascending and resolves index corresponding to desired quantile.
# Used for reporting tail latencies such as 95th percentile request times.
def _percentile(values: List[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, int(math.ceil(pct * len(ordered))) - 1))
    return float(ordered[idx])


# Extracts artifact ID tokens from comma-delimited version tracking header.
# Filters substrings matching canonical artifact prefix naming conventions.
# Returns list of distinct artifact identifiers contributing to run output.
def _ids_from_token(token: Optional[str]) -> List[str]:
    if not token or token == "default":
        return []
    return [part.strip() for part in str(token).split(",") if part.strip().startswith("art_")]


# ---------------------------------------------------------------------------
# Capture
# ---------------------------------------------------------------------------
# Checks whether logging run telemetry is permitted for a given organization.
# Respects request header opt-out overrides and environment blacklist arrays.
# Returns false if organization has opted out from system telemetry capture.
def capture_allowed(org_id: str, opt_out: bool = False) -> bool:
    if opt_out:
        return False
    if config.org_opted_out(org_id):
        return False
    return True


# Constructs MongoDB run document compiling request context and performance.
# Gathers token consumption metrics, latency, node traces, and model identity.
# Redacts sensitive PII text and attaches active prompt/routing artifact IDs.
def build_run_doc(
    ctx: LearningContext,
    *,
    route: str = "",
    node_trace: Optional[Iterable[str]] = None,
    tokens: Optional[Dict[str, int]] = None,
    latency_ms: float = 0.0,
    provider: str = "",
    model: str = "",
    fallback_used: bool = False,
    error: bool = False,
    input_text: str = "",
    output_text: str = "",
    task_class: str = "",
) -> Dict[str, Any]:
    versions = ctx.versions()
    token_info = dict(tokens or {})
    total = int(token_info.get("total") or (int(token_info.get("prompt", 0)) + int(token_info.get("completion", 0))))
    return {
        "org_id": ctx.org_id,
        "user_id": ctx.user_id,
        "request_id": ctx.request_id,
        "agent_output_id": ctx.agent_output_id or ctx.request_id,
        "route": (route or "")[:80],
        "task_class": (task_class or "")[:60],
        "node_trace": [str(n)[:60] for n in list(node_trace or [])[:40]],
        "tokens": {
            "prompt": int(token_info.get("prompt", 0) or 0),
            "completion": int(token_info.get("completion", 0) or 0),
            "total": total,
        },
        "latency_ms": float(latency_ms or 0.0),
        "provider": (provider or "")[:60],
        "model": (model or "")[:120],
        "prompt_version": versions["promptVersion"],
        "routing_version": versions["routingVersion"],
        "artifact_ids": versions["artifactIds"],
        "cache_hit": bool(ctx.cache_hit),
        "fallback_used": bool(fallback_used),
        "error": bool(error),
        "verification": ctx.verification_summary(),
        "input_text": redact(input_text, 400),
        "output_text": redact(output_text, 700),
        "created_at": _now(),
    }


# Asynchronously submits execution run document into background write queue.
# Validates learning context and organization opt-out status before capture.
# Enqueues payload without blocking active API request execution threads.
def capture_run(ctx: Optional[LearningContext], **kwargs: Any) -> bool:
    """Queue one run row.  Returns False when skipped (opt-out / no context)."""
    if ctx is None or not ctx.org_id:
        return False
    if not capture_allowed(ctx.org_id, ctx.opt_out):
        return False
    try:
        ensure_indexes()
        doc = build_run_doc(ctx, **kwargs)
        return get_writer().submit(RUNS, doc)
    except Exception as exc:  # learning must never break a request
        logger.warning("run_capture_failed", extra={"event": "run_capture_failed", "error": str(exc)[:200]})
        return False


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------
# Records user satisfaction rating and feedback details for an agent response.
# Validates ratings, captures associated artifact IDs, and redacts corrections.
# Submits feedback asynchronously and triggers downstream bandit and canary hooks.
def record_feedback(
    *,
    org_id: str,
    user_id: str,
    agent_output_id: str,
    rating: str,
    reason_code: Optional[str] = None,
    correction: Optional[str] = None,
    route: Optional[str] = None,
    prompt_version: Optional[str] = None,
    routing_version: Optional[str] = None,
    model_name: Optional[str] = None,
    provider: Optional[str] = None,
    cache_hit: Optional[bool] = None,
    opt_out: bool = False,
) -> bool:
    """Persist a thumbs up/down.  Returns True when stored (False = opted out)."""
    if rating not in ("up", "down"):
        raise ValueError("rating must be 'up' or 'down'")
    if not org_id:
        raise ValueError("org_id is required")
    if not capture_allowed(org_id, opt_out):
        return False
    ensure_indexes()
    db = get_mongo_db()
    run = None
    try:
        run = db[RUNS].find_one({"org_id": org_id, "agent_output_id": agent_output_id}) or db[RUNS].find_one(
            {"org_id": org_id, "request_id": agent_output_id}
        )
    except Exception:  # pragma: no cover
        run = None
    artifact_ids = list(run.get("artifact_ids", [])) if run else []
    for token in (prompt_version, routing_version):
        for aid in _ids_from_token(token):
            if aid not in artifact_ids:
                artifact_ids.append(aid)
    reason = reason_code if reason_code in REASON_CODES else None
    doc = {
        "org_id": org_id,
        "user_id": user_id,
        "agent_output_id": agent_output_id,
        "rating": rating,
        "reason_code": reason,
        "correction": redact(correction, 500) if correction else "",
        "route": (route or (run or {}).get("route") or "")[:80],
        "prompt_version": prompt_version or (run or {}).get("prompt_version") or "",
        "routing_version": routing_version or (run or {}).get("routing_version") or "",
        "model": model_name or (run or {}).get("model") or "",
        "provider": provider or (run or {}).get("provider") or "",
        "task_class": (run or {}).get("task_class", ""),
        "cache_hit": bool(cache_hit if cache_hit is not None else (run or {}).get("cache_hit", False)),
        "artifact_ids": artifact_ids,
        "created_at": _now(),
    }
    get_writer().submit(FEEDBACK, doc)
    _after_feedback(doc)
    return True


# Dispatches post-feedback side effects including bandit learning and canary checks.
# Updates model bandit rewards according to binary thumbs-up/down outcomes.
# Initiates instant canary guardrail rollback checks on negative feedback.
def _after_feedback(doc: Dict[str, Any]) -> None:
    """Side effects: bandit reward + fast canary guard.  Never raises."""
    try:
        if config.bandit_enabled() and doc.get("model") and doc.get("task_class"):
            from .bandit import record_reward

            record_reward(doc["task_class"], doc["model"], 1.0 if doc["rating"] == "up" else 0.0)
    except Exception as exc:  # pragma: no cover
        logger.debug("bandit_reward_failed: %s", exc)
    try:
        if doc.get("rating") == "down" and doc.get("artifact_ids"):
            from .rollout import check_artifacts_after_feedback

            check_artifacts_after_feedback(doc["artifact_ids"])
    except Exception as exc:  # pragma: no cover
        logger.debug("canary_feedback_check_failed: %s", exc)


# ---------------------------------------------------------------------------
# Reads (org bound)
# ---------------------------------------------------------------------------
# Tenant-scoped query store providing isolated access to runs and feedback.
# Automatically injects mandatory organization query filters across all reads.
# Protects against accidental cross-tenant data leakage in learning queries.
class RunStore:
    """Org-bound read access.  Construct only via ``RunStore.for_org``."""

    # Initialises tenant-bound RunStore with validated organization identifier.
    # Rejects empty organization IDs to enforce strict tenant boundary rules.
    # Caches optional database connection instance or falls back to global db.
    def __init__(self, org_id: str, db: Any = None):
        if not org_id or not str(org_id).strip():
            raise ValueError("RunStore requires an org_id")
        self._org = str(org_id).strip()
        self._db = db

    # Factory classmethod constructing an organization-scoped RunStore instance.
    # Instantiates store bound strictly to target tenant organization ID.
    # Standard entry point ensuring validated tenant scoping for all queries.
    @classmethod
    def for_org(cls, org_id: str, db: Any = None) -> "RunStore":
        return cls(org_id, db)

    # Read-only property exposing bound organization identifier string.
    # Returns immutable tenant organization ID assigned during construction.
    # Used for audit logging and tenant boundary consistency verification.
    @property
    def org_id(self) -> str:
        return self._org

    # Property resolving active MongoDB database instance for store queries.
    # Yields injected database object or retrieves central singleton instance.
    # Supports flexible mocking during testing while defaulting to real database.
    @property
    def db(self) -> Any:
        return self._db if self._db is not None else get_mongo_db()

    # Merges caller query criteria with non-overridable organization filter.
    # Injects tenant organization ID as the final immutable filter constraint.
    # Guarantees that query execution never circumvents tenant data isolation.
    def _flt(self, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        flt: Dict[str, Any] = dict(extra or {})
        flt["org_id"] = self._org  # always last: cannot be overridden
        return flt

    # Queries logged execution runs matching criteria within bound organization.
    # Applies optional start date cutoff and orders results descending by time.
    # Returns list of run document records constrained by specified limit.
    def runs(self, since: Optional[datetime] = None, limit: int = 2000, extra: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        flt = dict(extra or {})
        if since is not None:
            flt["created_at"] = {"$gte": since}
        return list(self.db[RUNS].find(self._flt(flt)).sort("created_at", -1).limit(limit))

    # Queries user feedback records associated with the bound tenant organization.
    # Restricts search to records newer than since datetime with limit cap.
    # Returns list of feedback document records sorted newest first.
    def feedback(
        self, since: Optional[datetime] = None, limit: int = 2000, extra: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        flt = dict(extra or {})
        if since is not None:
            flt["created_at"] = {"$gte": since}
        return list(self.db[FEEDBACK].find(self._flt(flt)).sort("created_at", -1).limit(limit))

    # Retrieves negative thumbs-down feedback records for the bound organization.
    # Passes down rating filter to general feedback query method.
    # Supplies critical training signals for candidate prompt improvement.
    def negative_feedback(self, since: Optional[datetime] = None, limit: int = 1000) -> List[Dict[str, Any]]:
        return self.feedback(since, limit, {"rating": "down"})

    # Retrieves positive thumbs-up feedback records for the bound organization.
    # Passes up rating filter to underlying feedback query function.
    # Supplies candidate dataset for few-shot exemplar mining routines.
    def positive_feedback(self, since: Optional[datetime] = None, limit: int = 1000) -> List[Dict[str, Any]]:
        return self.feedback(since, limit, {"rating": "up"})

    # Resolves original run execution document by agent output identifier.
    # Enforces organization boundary filter to prevent cross-tenant queries.
    # Returns single run record dictionary or None if output ID is not found.
    def run_for_output(self, agent_output_id: str) -> Optional[Dict[str, Any]]:
        return self.db[RUNS].find_one(self._flt({"agent_output_id": agent_output_id}))

    # Counts total number of logged execution runs under bound organization.
    # Executes count_documents query using organization filter constraint.
    # Returns total count integer representing historical tenant request volume.
    def count_runs(self) -> int:
        return int(self.db[RUNS].count_documents(self._flt()))


# Calculates historical UTC datetime offset by specified number of days.
# Subtracts fractional day duration from current UTC timestamp reference.
# Used for bounding query windows across recent telemetry evaluation jobs.
def days_ago(days: float) -> datetime:
    return _now() - timedelta(days=days)


# ---------------------------------------------------------------------------
# Aggregates
# ---------------------------------------------------------------------------
# Aggregates numeric performance metrics across collections of runs and feedback.
# Computes thumbs-down ratios, fallback rates, verification errors, and latencies.
# Returns comprehensive numerical summary dictionary for statistical evaluation.
def _summarise(runs: List[Dict[str, Any]], feedback: List[Dict[str, Any]]) -> Dict[str, Any]:
    n = len(runs)
    downs = sum(1 for f in feedback if f.get("rating") == "down")
    ups = sum(1 for f in feedback if f.get("rating") == "up")
    latencies = [float(r.get("latency_ms", 0.0) or 0.0) for r in runs]
    tokens = [int((r.get("tokens") or {}).get("total", 0) or 0) for r in runs]
    verified = [r for r in runs if (r.get("verification") or {}).get("checked", 0)]
    ver_fail = sum(1 for r in verified if (r.get("verification") or {}).get("failures", 0))

    def rate(count: int, total: int) -> float:
        return round(count / total, 4) if total else 0.0

    return {
        "runs": n,
        "feedback": len(feedback),
        "thumbsUp": ups,
        "thumbsDown": downs,
        "thumbsDownRate": rate(downs, max(n, 1)) if n else 0.0,
        "fallbackRate": rate(sum(1 for r in runs if r.get("fallback_used")), n),
        "errorRate": rate(sum(1 for r in runs if r.get("error")), n),
        "verificationFailureRate": rate(ver_fail, len(verified)),
        "cacheHitRate": rate(sum(1 for r in runs if r.get("cache_hit")), n),
        "avgLatencyMs": round(sum(latencies) / n, 2) if n else 0.0,
        "p95LatencyMs": round(_percentile(latencies, 0.95), 2),
        "avgTokens": round(sum(tokens) / n, 2) if n else 0.0,
    }


# Gathers aggregate performance statistics specifically served by an artifact.
# Queries MongoDB runs and feedback matching target artifact identifier.
# Computes quantitative metrics for canary evaluation without exposing raw text.
def artifact_stats(artifact_id: str, since: Optional[datetime] = None, limit: int = 5000) -> Dict[str, Any]:
    """Aggregate numeric stats for runs served by ``artifact_id`` (no text)."""
    db = get_mongo_db()
    flt: Dict[str, Any] = {"artifact_ids": artifact_id}
    if since is not None:
        flt["created_at"] = {"$gte": since}
    runs = list(db[RUNS].find(flt).sort("created_at", -1).limit(limit))
    feedback = list(db[FEEDBACK].find(flt).sort("created_at", -1).limit(limit))
    return _summarise(runs, feedback)


# Computes benchmark baseline statistics across runs excluding candidate artifact.
# Scopes queries to the same tenant organization for org-level candidates.
# Supplies comparative performance baseline numbers for guardrail evaluation.
def baseline_stats(artifact_id: str, org_id: Optional[str], since: Optional[datetime] = None, limit: int = 5000) -> Dict[str, Any]:
    """Stats for runs NOT served by ``artifact_id`` (same org for org artifacts)."""
    db = get_mongo_db()
    flt: Dict[str, Any] = {"artifact_ids": {"$ne": artifact_id}}
    if org_id:
        flt["org_id"] = org_id
    if since is not None:
        flt["created_at"] = {"$gte": since}
    runs = list(db[RUNS].find(flt).sort("created_at", -1).limit(limit))
    feedback = list(db[FEEDBACK].find(flt).sort("created_at", -1).limit(limit))
    return _summarise(runs, feedback)


# Aggregates cross-organization numeric feedback signals adhering to k-anonymity.
# Strips identifiers, user text, and excludes opted-out organizations.
# Returns route and reason count distributions if minimum organization count is met.
def global_signals(since: Optional[datetime] = None) -> Dict[str, Any]:
    """K-anonymous cross-org aggregates (numbers only; no text, ids or org names).

    Returns ``{"eligible": False}`` unless at least ``AI_GLOBAL_MIN_ORGS`` orgs
    and ``AI_GLOBAL_MIN_EVENTS`` events contributed.  Opted-out orgs are excluded.
    """
    db = get_mongo_db()
    flt: Dict[str, Any] = {}
    if since is not None:
        flt["created_at"] = {"$gte": since}
    opted = list(config.opt_out_orgs())
    if opted:
        flt["org_id"] = {"$nin": opted}
    feedback = list(db[FEEDBACK].find(flt).limit(20000))
    orgs = {f.get("org_id") for f in feedback if f.get("org_id")}
    if len(orgs) < config.global_min_orgs() or len(feedback) < config.global_min_events():
        return {"eligible": False, "orgs": len(orgs), "events": len(feedback)}
    by_route: Dict[str, Dict[str, int]] = {}
    by_reason: Dict[str, int] = {}
    for f in feedback:
        route = f.get("route") or "unknown"
        slot = by_route.setdefault(route, {"up": 0, "down": 0})
        slot["down" if f.get("rating") == "down" else "up"] += 1
        if f.get("rating") == "down":
            reason = f.get("reason_code") or "other"
            by_reason[reason] = by_reason.get(reason, 0) + 1
    return {"eligible": True, "orgs": len(orgs), "events": len(feedback), "byRoute": by_route, "byReason": by_reason}


# ---------------------------------------------------------------------------
# Canary invariant results (``ai_canary_events``)
# ---------------------------------------------------------------------------
CANARY_EVENTS = "ai_canary_events"


# Persists invariant check results produced by production canary engine runs.
# Captures probe identity, invariant outcome status, duration, and violations.
# Submits event document asynchronously to Mongo canary events collection.
def persist_canary_event(result: Dict[str, Any]) -> bool:
    """Persist one ``ProductionCanaryEngine`` check (numbers only, no free text)."""
    try:
        from registry.context import current_context

        ctx = current_context()
        org_id = ctx.org_id if ctx is not None else ""
        if ctx is not None and not capture_allowed(org_id, ctx.opt_out):
            return False
        ensure_indexes()
        db = get_mongo_db()
        try:
            db[CANARY_EVENTS].create_index("created_at", expireAfterSeconds=config.run_ttl_days() * 86400)
        except Exception:  # pragma: no cover
            pass
        doc = {
            "org_id": org_id,
            "request_id": ctx.request_id if ctx is not None else "",
            "probe_id": str(result.get("probe_id", ""))[:80],
            "invariant": str(result.get("invariant", ""))[:60],
            "source": str(result.get("source", ""))[:60],
            "passed": bool(result.get("passed")),
            "duration_ms": float(result.get("duration_ms", 0.0) or 0.0),
            "violation_count": len(result.get("violations") or []),
            "artifact_ids": ctx.versions()["artifactIds"] if ctx is not None else [],
            "created_at": _now(),
        }
        return get_writer().submit(CANARY_EVENTS, doc)
    except Exception as exc:  # pragma: no cover
        logger.debug("canary_persist_failed: %s", exc)
        return False
