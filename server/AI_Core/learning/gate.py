"""
learning/gate.py - Promotion gate for learned artifacts
=======================================================

A candidate artifact may only advance (shadow/canary/active) after passing the
gate.  The gate replays the candidate and its baseline (the active artifact for
the slot, or the baked-in default) through ``evals.replay`` and requires:

1. ``lint``          - the candidate passes prompt/exemplar/routing lint.
2. ``number_safety`` - ZERO guard leaks and no drop in raw number compliance.
                       Tolerance is exactly zero.  The guard itself is never
                       modified by the learner.
3. ``routing``       - routing agreement on the golden set (and on replayed,
                       non-downvoted logged runs) does not regress.
4. ``plan_quality``  - decomposition coverage / schema validity do not regress.
5. ``determinism``   - repeated replays stay identical.
6. ``win_rate``      - Wilson lower bound of the paired non-loss rate (candidate
                       not worse than baseline per case) clears a threshold with
                       a minimum case count (non-inferiority).
7. ``cost``          - average token proxy within ``AI_GATE_COST_CAP_RATIO``.

The LLM judge, when supplied, is advisory: it is stored but never gates.
Reports persist to Mongo ``ai_eval_reports`` (listed by ``GET /reports``).
"""

from __future__ import annotations

import logging
import math
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Iterable, List, Optional

from registry.lint import lint_artifact
from registry.models import ArtifactBase, RoutingConfig
from registry.store import ArtifactStore
from utils.mongo_client import get_mongo_db

from . import config

logger = logging.getLogger(__name__)

REPORTS = "ai_eval_reports"

MIN_CASES = 12
NON_LOSS_LOWER_BOUND = 0.70
RUN_REPLAY_TOLERANCE = 0.15
MAX_REPLAY_RUNS = 200


# Calculates Wilson score confidence interval lower bound for binomial samples.
# Accounts for small sample uncertainty without asymptotic normality bias.
# Returns lower bound float clamped at zero for statistical non-loss gating.
def wilson_lower(successes: int, n: int, z: float = 1.96) -> float:
    """Wilson score interval lower bound for a binomial proportion."""
    if n <= 0:
        return 0.0
    p = successes / n
    denom = 1.0 + z * z / n
    centre = p + z * z / (2 * n)
    margin = z * math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)
    return max(0.0, (centre - margin) / denom)


# Data class storing evaluation outcome for an individual gating assertion.
# Captures check name, boolean status, diagnostic details, and comparisons.
# Compares candidate metric values directly against corresponding baseline data.
@dataclass
class GateCheck:
    name: str
    passed: bool
    detail: str = ""
    baseline: Any = None
    candidate: Any = None

    # Serialises individual gate check result into structured dictionary.
    # Formats pass status, detail strings, and candidate-baseline metrics.
    # Produces plain dictionary suitable for JSON serialization and storage.
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "passed": bool(self.passed),
            "detail": self.detail,
            "baseline": self.baseline,
            "candidate": self.candidate,
        }


# Encapsulates comprehensive artifact promotion gate evaluation report.
# Tracks pass status, constituent check results, win rates, and timestamps.
# Provides reporting methods for persistence and brief status summarisation.
@dataclass
class GateResult:
    id: str
    artifact_id: str
    kind: str
    key: str
    org_id: Optional[str]
    passed: bool
    checks: List[GateCheck]
    candidate: Dict[str, Any]
    baseline: Dict[str, Any]
    win_rate: Dict[str, Any]
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    # Returns list of names identifying checks that failed gate assertions.
    # Filters check instances where passed boolean flag evaluates to false.
    # Supplies targeted diagnostic check failure identifiers for reviewers.
    def failed_checks(self) -> List[str]:
        return [c.name for c in self.checks if not c.passed]

    # Converts gate evaluation result into full structured dictionary format.
    # Includes serialized checks list, win-rate metrics, and stripped scores.
    # Provides complete persistence record document for database storage.
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "source": "gate",
            "artifactId": self.artifact_id,
            "kind": self.kind,
            "key": self.key,
            "orgId": self.org_id,
            "passed": self.passed,
            "failedChecks": self.failed_checks(),
            "checks": [c.to_dict() for c in self.checks],
            "candidate": _strip_scores(self.candidate),
            "baseline": _strip_scores(self.baseline),
            "winRate": self.win_rate,
            "createdAt": self.created_at.isoformat(),
        }

    # Generates concise summary dictionary of evaluation gate outcome.
    # Extracts primary identifiers, overall pass status, and failed check keys.
    # Provides lightweight payload for inclusion in artifact metadata evidence.
    def summary(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "source": "gate",
            "artifactId": self.artifact_id,
            "kind": self.kind,
            "key": self.key,
            "passed": self.passed,
            "failedChecks": self.failed_checks(),
            "createdAt": self.created_at.isoformat(),
        }


# Strips granular case scores from metrics dictionary for clean reporting.
# Removes per-case score mapping while retaining aggregate metric summaries.
# Produces compact payload suitable for report presentation and indexing.
def _strip_scores(metrics: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in (metrics or {}).items() if k != "caseScores"}


# Computes paired win, loss, and tie statistics between candidate and baseline.
# Calculates empirical non-loss rate and Wilson score interval lower bound.
# Returns comprehensive comparative benchmark statistics against thresholds.
def _paired(candidate: Dict[str, Any], baseline: Dict[str, Any]) -> Dict[str, Any]:
    cand = candidate.get("caseScores") or {}
    base = baseline.get("caseScores") or {}
    keys = [k for k in cand if k in base]
    wins = sum(1 for k in keys if cand[k] > base[k])
    losses = sum(1 for k in keys if cand[k] < base[k])
    ties = len(keys) - wins - losses
    n = len(keys)
    non_loss = n - losses
    return {
        "n": n,
        "wins": wins,
        "losses": losses,
        "ties": ties,
        "nonLossRate": round(non_loss / n, 4) if n else 0.0,
        "nonLossLowerBound": round(wilson_lower(non_loss, n), 4),
        "threshold": NON_LOSS_LOWER_BOUND,
        "minCases": MIN_CASES,
    }


# Safely extracts numeric floating point metric from dictionary with default.
# Guards against null or missing values by converting output to float.
# Ensures dependable numeric comparisons across evaluation metric keys.
def _num(metrics: Dict[str, Any], key: str, default: float = 0.0) -> float:
    value = metrics.get(key)
    return default if value is None else float(value)


# Evaluates pure metric assertions comparing candidate against baseline data.
# Verifies linting, number safety, routing agreement, and plan consistency.
# Enforces determinism preservation, non-loss win rate, and token cost caps.
def compare(artifact: ArtifactBase, candidate: Dict[str, Any], baseline: Dict[str, Any]) -> List[GateCheck]:
    """Pure comparison of candidate vs baseline metrics (no I/O) -> gate checks."""
    checks: List[GateCheck] = []

    lint = lint_artifact(artifact)
    checks.append(GateCheck("lint", lint.ok, "; ".join(lint.errors) if not lint.ok else "ok"))

    leaks = int(candidate.get("guardLeaks", 0) or 0)
    base_leaks = int(baseline.get("guardLeaks", 0) or 0)
    cand_raw = candidate.get("rawNumberCompliance")
    base_raw = baseline.get("rawNumberCompliance")
    raw_ok = True
    if cand_raw is not None and base_raw is not None:
        raw_ok = float(cand_raw) >= float(base_raw)
    safe = leaks <= base_leaks and leaks == 0 and raw_ok
    checks.append(
        GateCheck(
            "number_safety",
            safe,
            "zero tolerance: no guard leaks and raw LLM number compliance must not drop",
            baseline={"guardLeaks": base_leaks, "rawNumberCompliance": base_raw},
            candidate={"guardLeaks": leaks, "rawNumberCompliance": cand_raw},
        )
    )

    base_agree = baseline.get("routingAgreement")
    cand_agree = candidate.get("routingAgreement")
    routing_ok = True
    if cand_agree is not None and base_agree is not None:
        routing_ok = float(cand_agree) >= float(base_agree)
    replay = candidate.get("runReplay")
    base_replay = baseline.get("runReplay")
    replay_ok = True
    if replay and base_replay and replay.get("runs"):
        replay_ok = float(replay.get("agreement", 1.0)) >= float(base_replay.get("agreement", 1.0)) - RUN_REPLAY_TOLERANCE
    checks.append(
        GateCheck(
            "routing",
            routing_ok and replay_ok,
            "golden-set agreement must not regress; replayed runs within tolerance",
            baseline={"agreement": base_agree, "runReplay": (base_replay or {}).get("agreement")},
            candidate={"agreement": cand_agree, "runReplay": (replay or {}).get("agreement")},
        )
    )

    coverage_ok = True
    if candidate.get("decomposeCoverage") is not None and baseline.get("decomposeCoverage") is not None:
        coverage_ok = float(candidate["decomposeCoverage"]) >= float(baseline["decomposeCoverage"])
    schema_ok = _num(candidate, "schemaValidity", 1.0) >= _num(baseline, "schemaValidity", 1.0)
    checks.append(
        GateCheck(
            "plan_quality",
            coverage_ok and schema_ok,
            "decomposition coverage and schema validity must not regress",
            baseline={"decomposeCoverage": baseline.get("decomposeCoverage"), "schemaValidity": baseline.get("schemaValidity")},
            candidate={"decomposeCoverage": candidate.get("decomposeCoverage"), "schemaValidity": candidate.get("schemaValidity")},
        )
    )

    checks.append(
        GateCheck(
            "determinism",
            _num(candidate, "determinism", 1.0) >= _num(baseline, "determinism", 1.0),
            "identical replays must stay identical",
            baseline=baseline.get("determinism"),
            candidate=candidate.get("determinism"),
        )
    )

    win = _paired(candidate, baseline)
    win_ok = win["n"] >= MIN_CASES and win["nonLossLowerBound"] >= NON_LOSS_LOWER_BOUND
    detail = (
        f"{win['losses']} loss(es) in {win['n']} paired cases; Wilson lower bound {win['nonLossLowerBound']}"
        f" (need >= {NON_LOSS_LOWER_BOUND} with >= {MIN_CASES} cases)"
    )
    checks.append(GateCheck("win_rate", win_ok, detail, candidate=win))

    ratio = config.gate_cost_cap_ratio()
    base_tokens = _num(baseline, "avgTokens")
    cand_tokens = _num(candidate, "avgTokens")
    cost_ok = base_tokens <= 0 or cand_tokens <= base_tokens * ratio
    checks.append(
        GateCheck(
            "cost",
            cost_ok,
            f"average tokens must be <= {ratio}x baseline",
            baseline=base_tokens,
            candidate=cand_tokens,
        )
    )
    return checks


# Fetches logged historical execution runs strictly scoped to artifact org.
# Annotates historical runs with negative feedback flags from downvote sets.
# Returns bounded run collection for routing replay without cross-tenant leak.
def _replay_runs_for(artifact: ArtifactBase) -> Optional[List[Dict[str, Any]]]:
    """Org-scoped logged runs for routing replay (never another org's)."""
    if not isinstance(artifact, RoutingConfig) or artifact.scope != "org" or not artifact.org_id:
        return None
    try:
        from .run_store import RunStore

        store = RunStore.for_org(artifact.org_id)
        downvoted = {f.get("agent_output_id") for f in store.negative_feedback(limit=1000)}
        runs = store.runs(limit=MAX_REPLAY_RUNS)
        for run in runs:
            run["_downvoted"] = run.get("agent_output_id") in downvoted
        return runs
    except Exception as exc:  # pragma: no cover
        logger.debug("gate_replay_runs_failed: %s", exc)
        return None


# Executes end-to-end promotion gating pipeline for candidate artifact.
# Replays evaluation benchmarks, checks assertions, and tallies win rates.
# Optionally persists evaluation report and updates store artifact metadata.
def run_gate(
    artifact: ArtifactBase,
    *,
    llm: Optional[Callable[..., str]] = None,
    master: Any = None,
    runs: Optional[Iterable[Dict[str, Any]]] = None,
    judge: Optional[Callable[[str, str], float]] = None,
    persist: bool = True,
    store: Optional[ArtifactStore] = None,
) -> GateResult:
    """Evaluate ``artifact`` against its baseline and (optionally) persist the report."""
    from evals import replay

    store = store or ArtifactStore()
    runs_list = list(runs) if runs is not None else _replay_runs_for(artifact)
    candidate = replay.evaluate_artifact(artifact, llm=llm, master=master, runs=runs_list, judge=judge)
    baseline = replay.evaluate_baseline(artifact, llm=llm, master=master, runs=runs_list)
    checks = compare(artifact, candidate, baseline)
    win = _paired(candidate, baseline)
    result = GateResult(
        id="gate-" + uuid.uuid4().hex[:16],
        artifact_id=artifact.id,
        kind=artifact.kind,
        key=artifact.key,
        org_id=artifact.org_id,
        passed=all(c.passed for c in checks),
        checks=checks,
        candidate=candidate,
        baseline=baseline,
        win_rate=win,
    )
    if persist:
        persist_report(result)
        try:
            evidence = dict(artifact.evidence or {})
            evidence["gate"] = result.summary()
            store.update_fields(
                artifact.id,
                gate_passed=result.passed,
                eval_report_id=result.id,
                evidence=evidence,
            )
        except Exception as exc:  # pragma: no cover
            logger.warning("gate_update_failed", extra={"event": "gate_update_failed", "error": str(exc)[:200]})
    return result


# Persists serialized gate evaluation report into MongoDB collection.
# Replaces existing report document with upsert matching unique report ID.
# Logs error event warnings without re-raising database persistence errors.
def persist_report(result: GateResult) -> None:
    try:
        doc = result.to_dict()
        doc["_id"] = result.id
        doc["created_at"] = result.created_at
        get_mongo_db()[REPORTS].replace_one({"_id": result.id}, doc, upsert=True)
    except Exception as exc:  # pragma: no cover
        logger.warning("gate_report_persist_failed", extra={"event": "gate_report_persist_failed", "error": str(exc)[:200]})


# Lists gate evaluation reports accessible to specified organization context.
# Filters records by tenant ownership while including global system reports.
# Returns clean serialized report document dictionaries sorted chronologically.
def list_gate_reports(limit: int = 20, org_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Gate report summaries visible to ``org_id`` (its artifacts + global)."""
    flt: Dict[str, Any] = {}
    if org_id is not None:
        flt["$or"] = [{"orgId": org_id}, {"orgId": None}]
    docs = list(get_mongo_db()[REPORTS].find(flt).sort("created_at", -1).limit(max(1, min(200, limit))))
    out = []
    for doc in docs:
        doc.pop("_id", None)
        doc.pop("created_at", None)
        out.append(doc)
    return out


# Retrieves individual gate evaluation report document matching target ID.
# Queries MongoDB reports collection and strips internal Mongo metadata keys.
# Returns report dictionary or None if requested report identifier is not found.
def get_gate_report(report_id: str) -> Optional[Dict[str, Any]]:
    doc = get_mongo_db()[REPORTS].find_one({"_id": report_id})
    if not doc:
        return None
    doc.pop("_id", None)
    doc.pop("created_at", None)
    return doc
