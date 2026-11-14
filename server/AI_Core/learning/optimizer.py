"""
learning/optimizer.py - Offline candidate generation (prompt / exemplar / routing / cache)
========================================================================================

Turns logged feedback into *draft* artifacts, runs the promotion gate on each and
hands survivors to the rollout policy.  It works with ZERO LLM calls
(``AI_OPTIMIZER_LLM_BUDGET`` defaults to 0): every proposer is heuristic.  When a
budget is configured an LLM may only *rephrase* a style instruction; its output is
linted and silently replaced by the heuristic text if it is unsafe.

Tenant isolation: an org-scope run reads ONLY ``RunStore.for_org(org_id)`` (the org
filter is injected in the store and cannot be overridden).  Global-scope runs use
``run_store.global_signals()``: k-anonymous aggregated counts plus synthetic
exemplars, never user text.

The learner changes only non-numeric surfaces: prompt wording, exemplars, routing
thresholds and cache TTL.  ``wrong_number`` feedback never produces a prompt edit -
it is reported for engineering review because numbers are computed deterministically.
"""

from __future__ import annotations

import itertools
import logging
import re
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from registry import loader
from registry.defaults import PROMPT_SPECS, SYNTHETIC_EXEMPLARS, default_routing_config
from registry.models import (
    ROUTING_KEY,
    ArtifactBase,
    ExemplarExample,
    ExemplarSet,
    PromptArtifact,
    RoutingConfig,
)
from registry.store import ArtifactError, ArtifactStore
from utils.mongo_client import get_mongo_db

from . import config, rollout
from .gate import run_gate
from .redact import contains_sensitive
from .run_store import RunStore, days_ago, global_signals

logger = logging.getLogger(__name__)

JOBS = "ai_optimizer_jobs"
LOOKBACK_DAYS = 30

# route -> system-prompt slot a style edit applies to
_ROUTE_SLOT = {
    "financial_education": "educator.system",
    "decompose": "aggregator.system",
    "comprehensive": "aggregator.system",
}
_DEFAULT_SLOT = "master.system"

# reason code -> deterministic, non-numeric style instruction.
_INSTRUCTIONS = {
    "too_long": "Keep every answer concise and focused; prefer short sentences.",
    "unclear": "Use plain language and explain any jargon in a few words.",
    "irrelevant": "Stay on the user's question and avoid unrelated topics.",
    "unsafe": "Present this as general information and mention that a professional can give personal advice.",
}
_NEEDS_ENGINEERING = ("wrong_number",)


# Retrieves current timezone-aware UTC datetime for optimizer events.
# Provides standard timestamp reference for job lifecycle records.
# Ensures consistent temporal tracking across candidate evaluations.
def _now() -> datetime:
    return datetime.now(timezone.utc)


# Enforces strict limit on external LLM queries during candidate optimization.
# Tracks consumption count against configured maximum allowed call budget.
# Restricts model usage to prevent unforeseen inference expense spikes.
class LLMBudget:
    """Hard cap on optimizer LLM calls (0 = never call an LLM)."""

    # Initialises LLM budget counter with maximum call threshold limit.
    # Clamps input limit at non-negative value and clears usage counter.
    # Prepares tracking object for rate-limiting optimization LLM calls.
    def __init__(self, calls: int):
        self.limit = max(0, int(calls))
        self.used = 0

    # Attempts to acquire single LLM execution token from available budget.
    # Increments usage counter and returns true if under configured limit.
    # Returns false when total allowed query volume has been exhausted.
    def take(self) -> bool:
        if self.used >= self.limit:
            return False
        self.used += 1
        return True


# Instantiates default LLM invocation callable wrapping master agent model.
# Catches provider import or initialization exceptions and returns None.
# Enforces non-blocking fallback behaviour if primary model inference fails.
def _default_llm() -> Optional[Callable[[str, str], str]]:  # pragma: no cover - needs a real provider
    try:
        from langchain_core.messages import HumanMessage, SystemMessage

        from utils.llm_wrapper import create_llm

        llm = create_llm("master")

        def call(system: str, user: str) -> str:
            response, fallback_used = llm.invoke_with_fallback([SystemMessage(content=system), HumanMessage(content=user)], "")
            return "" if fallback_used else str(getattr(response, "content", response) or "")

        return call
    except Exception:
        return None


# Offline candidate generator proposing prompt, exemplar, and routing edits.
# Evaluates logged user feedback clusters to propose incremental improvements.
# Submits generated candidate artifacts to gating benchmarks before deployment.
class Optimizer:
    # Initialises optimizer instance with organization scope and LLM call budget.
    # Configures target tenant scope, evaluator callables, and artifact store.
    # Validates scope parameter requirements for org-specific or global runs.
    def __init__(
        self,
        org_id: Optional[str],
        *,
        scope: str = "org",
        llm: Optional[Callable[[str, str], str]] = None,
        budget: Optional[int] = None,
        gate_llm: Optional[Callable[..., str]] = None,
        master: Any = None,
        auto_route: bool = True,
    ):
        if scope not in ("org", "global"):
            raise ValueError("scope must be 'org' or 'global'")
        if scope == "org" and not (org_id or "").strip():
            raise ValueError("org-scope optimization requires an org id")
        self.org_id = (org_id or "").strip() or None
        self.scope = scope
        self.budget = LLMBudget(config.optimizer_llm_budget() if budget is None else budget)
        self._llm = llm
        self._gate_llm = gate_llm
        self._master = master
        self.auto_route = auto_route
        self.store = ArtifactStore()
        self.skipped: List[str] = []

    # -- helpers -------------------------------------------------------------
    # Retrieves active LLM callable if remaining budget permits inferences.
    # Returns None immediately if call limit is exhausted or configured at zero.
    # Yields injected LLM callable or default master model wrapper.
    def _llm_callable(self) -> Optional[Callable[[str, str], str]]:
        if self.budget.limit <= 0:
            return None
        return self._llm or _default_llm()

    # Resolves currently active serving prompt text across scoped precedence.
    # Checks organization-level overrides before falling back to global active.
    # Returns default compiled prompt specification text if no artifact active.
    def _serving_text(self, key: str) -> str:
        if self.scope == "org" and self.org_id:
            art = self.store.active_for("prompt", key, "org", self.org_id)
            if isinstance(art, PromptArtifact) and art.text.strip():
                return art.text
        art = self.store.active_for("prompt", key, "global", None)
        if isinstance(art, PromptArtifact) and art.text.strip():
            return art.text
        return PROMPT_SPECS[key].default

    # Retrieves active routing configuration artifact respecting scoping tiers.
    # Evaluates tenant-specific routing overrides before global defaults.
    # Yields active RoutingConfig instance or baseline static default settings.
    def _serving_routing(self) -> RoutingConfig:
        if self.scope == "org" and self.org_id:
            art = self.store.active_for("routing", ROUTING_KEY, "org", self.org_id)
            if isinstance(art, RoutingConfig):
                return art
        art = self.store.active_for("routing", ROUTING_KEY, "global", None)
        return art if isinstance(art, RoutingConfig) else default_routing_config()

    # Constructs standardized scoping dictionary for artifact instantiation.
    # Associates current execution scope and organization identifier.
    # Returns dictionary parameters ensuring proper tenant isolation keys.
    def _scope_kwargs(self) -> Dict[str, Any]:
        return {"scope": self.scope, "org_id": self.org_id if self.scope == "org" else None}

    # -- proposers -------------------------------------------------------------
    # Formulates candidate prompt instruction addressing specific negative feedback.
    # Attempts budgeted LLM rephrasing with strict safety and formatting linting.
    # Falls back reliably to deterministic heuristic text when LLM is withheld.
    def _instruction(self, reason: str, route: str, corrections: List[str]) -> Tuple[str, str]:
        """(text, source) - heuristic text, optionally rephrased by a budgeted LLM."""
        base = _INSTRUCTIONS[reason]
        llm = self._llm_callable()
        if llm is None or not self.budget.take():
            return base, "heuristic"
        sample = "; ".join(c for c in corrections[:3] if c and not contains_sensitive(c))[:300]
        try:
            raw = llm(
                "You rewrite one short style instruction for a financial assistant. Reply with a single sentence "
                "containing no digits.",
                f"Problem: users report answers are '{reason}' on route '{route}'. Current instruction: {base} "
                f"Redacted user hints: {sample or 'none'}",
            )
        except Exception:
            return base, "heuristic"
        text = re.sub(r"\s+", " ", (raw or "").strip())[:200]
        if not text or re.search(r"\d", text) or "\n" in (raw or "").strip():
            return base, "heuristic"
        return text, "llm"

    # Clusters negative user feedback by failure code to formulate prompt candidates.
    # Groups feedback clusters exceeding minimum threshold counts per slot.
    # Generates PromptArtifact candidate instances enriched with feedback evidence.
    def propose_prompts(self, negatives: List[Dict[str, Any]]) -> List[ArtifactBase]:
        """Cluster negative feedback by (reason, route); one prompt candidate per slot."""
        clusters: Dict[Tuple[str, str], List[Dict[str, Any]]] = defaultdict(list)
        for fb in negatives:
            clusters[(fb.get("reason_code") or "other", fb.get("route") or "")].append(fb)
        min_n = config.min_feedback_for_candidate()
        by_slot: Dict[str, List[Tuple[str, str, int, List[str]]]] = defaultdict(list)
        for (reason, route), items in sorted(clusters.items(), key=lambda kv: -len(kv[1])):
            if len(items) < min_n:
                continue
            if reason in _NEEDS_ENGINEERING:
                self.skipped.append(f"{reason}/{route or 'any'}: numbers are deterministic; needs engineering review")
                continue
            if reason not in _INSTRUCTIONS:
                self.skipped.append(f"{reason}/{route or 'any'}: no heuristic remedy")
                continue
            slot = _ROUTE_SLOT.get(route, _DEFAULT_SLOT)
            by_slot[slot].append((reason, route, len(items), [i.get("correction", "") for i in items]))

        out: List[ArtifactBase] = []
        for slot, entries in by_slot.items():
            text = self._serving_text(slot)
            added: List[str] = []
            evidence_clusters = []
            sources = set()
            for reason, route, count, corrections in entries[:2]:
                instruction, source = self._instruction(reason, route, corrections)
                if instruction.lower() in text.lower() or instruction in added:
                    continue
                added.append(instruction)
                sources.add(source)
                evidence_clusters.append({"reason": reason, "route": route, "count": count})
            if not added:
                continue
            candidate_text = text.rstrip() + " " + " ".join(added)
            active = self.store.active_for("prompt", slot, **{"scope": self.scope, "org_id": self.org_id})
            out.append(
                PromptArtifact(
                    key=slot,
                    text=candidate_text,
                    parent=active.id if active else None,
                    created_by="optimizer",
                    evidence={"clusters": evidence_clusters, "source": sorted(sources)},
                    **self._scope_kwargs(),
                )
            )
        return out

    # Mines verified positive exemplars from rated educational runs in an org.
    # Filters out instances with verification issues, digits, or long answers.
    # Constructs ExemplarSet artifact containing curated few-shot demonstrations.
    def mine_exemplars(self, store: RunStore) -> Optional[ExemplarSet]:
        """High-rated, verified, redacted, digit-free educator examples (org only)."""
        if self.scope != "org":
            return None
        ups = store.positive_feedback(since=days_ago(LOOKBACK_DAYS), limit=500)
        examples: List[ExemplarExample] = []
        seen = set()
        for fb in ups:
            if (fb.get("route") or "") != "financial_education":
                continue
            run = store.run_for_output(fb.get("agent_output_id", ""))
            if not run or run.get("fallback_used") or run.get("error"):
                continue
            verification = run.get("verification") or {}
            if verification.get("failures", 0):
                continue
            q, a = (run.get("input_text") or "").strip(), (run.get("output_text") or "").strip()
            if not q or not a or q in seen:
                continue
            if re.search(r"\d|<[A-Z]+>", q + a) or len(a) > 700 or len(q) > 400:
                continue
            seen.add(q)
            examples.append(ExemplarExample(input=q, output=a))
            if len(examples) >= 3:
                break
        if len(examples) < 2:
            return None
        active = self.store.active_for("exemplar", "educator.explain", "org", self.org_id)
        if active is not None and [e.model_dump() for e in active.examples] == [e.model_dump() for e in examples]:  # type: ignore[attr-defined]
            return None
        return ExemplarSet(
            key="educator.explain",
            examples=examples,
            parent=active.id if active else None,
            created_by="optimizer",
            evidence={"source": "rated_runs", "count": len(examples)},
            **self._scope_kwargs(),
        )

    # Builds synthetic exemplar set for global scope without cross-tenant data.
    # Uses pre-authored demonstrative pairs to avoid exposing tenant queries.
    # Returns ExemplarSet candidate flagged as synthetic for global rollouts.
    def synthetic_exemplars(self) -> Optional[ExemplarSet]:
        """Global candidate: hand-written exemplars only (no user text crosses tenants)."""
        if self.store.active_for("exemplar", "educator.explain", "global", None) is not None:
            return None
        pairs = SYNTHETIC_EXEMPLARS.get("educator.explain", ())
        if not pairs:
            return None
        return ExemplarSet(
            key="educator.explain",
            examples=[ExemplarExample(input=q, output=a) for q, a in pairs[:3]],
            synthetic=True,
            created_by="optimizer",
            evidence={"source": "synthetic"},
            scope="global",
        )

    # Executes grid search optimization over domain thresholds and cache TTL.
    # Evaluates agreement on historical runs and rewards flip of downvoted runs.
    # Emits optimized RoutingConfig candidate when score improvement is found.
    def tune_routing(self, store: RunStore) -> Optional[RoutingConfig]:
        """Bounded grid search over routing thresholds + cache TTL (org runs only)."""
        from evals import replay

        since = days_ago(LOOKBACK_DAYS)
        negatives = store.negative_feedback(since=since, limit=1000)
        down_ids = {f.get("agent_output_id") for f in negatives}
        if len(down_ids) < config.min_feedback_for_candidate():
            return None
        runs = [r for r in store.runs(since=since, limit=500) if r.get("input_text") and r.get("route")]
        down_runs = [r for r in runs if r.get("agent_output_id") in down_ids]
        liked_runs = [r for r in runs if r.get("agent_output_id") not in down_ids]
        if not down_runs:
            return None

        base_cfg = self._serving_routing()
        master = self._master or replay._master()
        base_metrics = replay.evaluate_routing(base_cfg, master=master)

        def route_changes(cfg: RoutingConfig) -> Tuple[int, int]:
            changed_down = changed_liked = 0
            with loader.use_artifacts([cfg], exclusive=True):
                for run in down_runs:
                    if replay._route(master, replay.RoutingCase(run["input_text"], (run["route"],))) != run["route"]:
                        changed_down += 1
                for run in liked_runs:
                    if replay._route(master, replay.RoutingCase(run["input_text"], (run["route"],))) != run["route"]:
                        changed_liked += 1
            return changed_down, changed_liked

        best: Optional[Tuple[float, int, RoutingConfig, Tuple[int, int]]] = None
        grid = itertools.product((2, 3, 4), (1, 2, 3), (1, 2, 3), (0.4, 0.5, 0.6))
        for dm, pl, cp, thr in grid:
            cfg = RoutingConfig(
                decompose_min_domains=dm,
                plan_language_min_domains=pl,
                complex_profile_min_domains=cp,
                decomposer_complexity_threshold=thr,
                extra_broad_phrases=list(base_cfg.extra_broad_phrases),
                extra_plan_phrases=list(base_cfg.extra_plan_phrases),
                educator_cache_ttl_seconds=base_cfg.educator_cache_ttl_seconds,
                created_by="optimizer",
                **self._scope_kwargs(),
            )
            if cfg.params() == base_cfg.params():
                continue
            metrics = replay.evaluate_routing(cfg, master=master)
            if metrics["routingAgreement"] < base_metrics["routingAgreement"]:
                continue
            if (metrics.get("decomposeCoverage") or 0) < (base_metrics.get("decomposeCoverage") or 0):
                continue
            changed_down, changed_liked = route_changes(cfg)
            score = changed_down - 2.0 * changed_liked
            distance = sum(1 for k, v in cfg.params().items() if v != base_cfg.params()[k])
            if score <= 0:
                continue
            key = (score, -distance)
            if best is None or key > (best[0], -best[1]):
                best = (score, distance, cfg, (changed_down, changed_liked))
        ttl = self._tune_cache_ttl(runs, down_ids, base_cfg)
        if best is None and ttl is None:
            return None
        params = dict(best[2].params() if best else base_cfg.params())
        evidence: Dict[str, Any] = {}
        if best:
            evidence["routing"] = {"changedDownvoted": best[3][0], "changedLiked": best[3][1], "score": best[0]}
        if ttl is not None:
            params["educator_cache_ttl_seconds"] = ttl[0]
            evidence["cache"] = ttl[1]
        active = self.store.active_for("routing", ROUTING_KEY, self.scope, self.org_id)
        return RoutingConfig(
            **params,
            parent=active.id if active else None,
            created_by="optimizer",
            evidence=evidence,
            **self._scope_kwargs(),
        )

    # Analyzes educational run telemetry to propose optimal cache TTL adjustments.
    # Evaluates cache hit ratios, downvote rates on hits, and duplicate queries.
    # Adjusts expiration intervals to balance response freshness against latency.
    @staticmethod
    def _tune_cache_ttl(runs: List[Dict[str, Any]], down_ids: set, base: RoutingConfig) -> Optional[Tuple[int, Dict[str, Any]]]:
        edu = [r for r in runs if r.get("route") == "financial_education"]
        if len(edu) < 10:
            return None
        hits = [r for r in edu if r.get("cache_hit")]
        hit_down = sum(1 for r in hits if r.get("agent_output_id") in down_ids)
        counts = Counter((r.get("input_text") or "") for r in edu)
        duplicate_share = sum(c - 1 for c in counts.values() if c > 1) / len(edu)
        hit_rate = len(hits) / len(edu)
        ttl = base.educator_cache_ttl_seconds
        info = {"hitRate": round(hit_rate, 3), "duplicateShare": round(duplicate_share, 3), "hitDownvotes": hit_down}
        if hits and hit_down / len(hits) > 0.3 and ttl > 600:
            return 600, {**info, "reason": "stale cached answers downvoted"}
        if duplicate_share > 0.3 and hit_rate < duplicate_share / 2 and ttl < 7200:
            return min(7200, ttl * 2), {**info, "reason": "repeat questions are missing the cache"}
        return None

    # -- pipeline ------------------------------------------------------------
    # Aggregates candidate artifacts from scoped negative feedback and runs.
    # Collects prompt updates, mined few-shot exemplars, and routing adjustments.
    # Dispatches to dedicated global collector when scope is set to global.
    def _collect(self) -> List[ArtifactBase]:
        if self.scope == "global":
            return self._collect_global()
        store = RunStore.for_org(self.org_id or "")
        since = days_ago(LOOKBACK_DAYS)
        negatives = store.negative_feedback(since=since, limit=1000)
        candidates: List[ArtifactBase] = []
        candidates.extend(self.propose_prompts(negatives))
        exemplars = self.mine_exemplars(store)
        if exemplars is not None:
            candidates.append(exemplars)
        routing = self.tune_routing(store)
        if routing is not None:
            candidates.append(routing)
        return candidates

    # Aggregates cross-tenant learning signals adhering to k-anonymity rules.
    # Synthesizes candidate prompt and exemplar proposals without private text.
    # Skips execution safely if minimum organization threshold is not reached.
    def _collect_global(self) -> List[ArtifactBase]:
        signals = global_signals(since=days_ago(LOOKBACK_DAYS))
        if not signals.get("eligible"):
            self.skipped.append(
                f"global: k-anonymity not met (orgs={signals.get('orgs', 0)}, events={signals.get('events', 0)})"
            )
            return []
        negatives: List[Dict[str, Any]] = []
        for route, slot in signals.get("byRoute", {}).items():
            # Aggregated counts only: re-expand into synthetic reason/route rows (no text, no ids).
            total_down = int(slot.get("down", 0))
            reasons = signals.get("byReason", {})
            reason_total = sum(reasons.values()) or 1
            for reason, count in reasons.items():
                share = int(round(total_down * count / reason_total))
                negatives.extend({"reason_code": reason, "route": route, "correction": ""} for _ in range(share))
        candidates = self.propose_prompts(negatives)
        synthetic = self.synthetic_exemplars()
        if synthetic is not None:
            candidates.append(synthetic)
        return candidates

    # Main execution cycle running candidate collection, gating, and rollout.
    # Evaluates candidates through promotion gates and determines rollout state.
    # Consolidates tenant user memory and returns structured execution summary.
    def run(self) -> Dict[str, Any]:
        """Generate, gate and route candidates.  Returns a JSON-safe summary."""
        started = _now()
        if self.scope == "org" and config.org_opted_out(self.org_id or ""):
            return self._summary(started, [], note="org opted out of learning")
        summaries: List[Dict[str, Any]] = []
        for candidate in self._collect():
            try:
                created = self.store.create(candidate, actor="optimizer")
            except ArtifactError as exc:
                self.skipped.append(f"{candidate.kind}/{candidate.key}: {exc}")
                continue
            result = run_gate(created, llm=self._gate_llm, master=self._master, store=self.store)
            decision = rollout.route_candidate(created.id) if self.auto_route else "gated"
            summaries.append(
                {
                    "artifactId": created.id,
                    "kind": created.kind,
                    "key": created.key,
                    "scope": created.scope,
                    "version": created.version,
                    "gatePassed": result.passed,
                    "failedChecks": result.failed_checks(),
                    "reportId": result.id,
                    "decision": decision,
                    "evidence": created.evidence,
                }
            )
        self._consolidate_memory()
        return self._summary(started, summaries)

    # Triggers periodic memory consolidation for users in the current organization.
    # Executes deduplication, decay, and contradiction checks across memories.
    # Safely catches and logs errors without failing the overall optimizer run.
    def _consolidate_memory(self) -> None:
        if self.scope != "org" or not self.org_id:
            return
        try:
            from . import memory_consolidation

            memory_consolidation.consolidate_org(self.org_id)
        except Exception as exc:  # memory is optional here
            logger.debug("optimizer_memory_consolidation_skipped: %s", exc)

    # Compiles execution summary payload documenting candidate proposals.
    # Records execution interval timestamps, budget usage, and skipped entries.
    # Returns serializable dictionary formatted for job persistence or logging.
    def _summary(self, started: datetime, candidates: List[Dict[str, Any]], note: str = "") -> Dict[str, Any]:
        return {
            "orgId": self.org_id,
            "scope": self.scope,
            "startedAt": started.isoformat(),
            "finishedAt": _now().isoformat(),
            "candidates": candidates,
            "skipped": list(self.skipped),
            "llmCallsUsed": self.budget.used,
            "llmBudget": self.budget.limit,
            "note": note,
        }


# ---------------------------------------------------------------------------
# Jobs (``POST /api/learning/optimize/run``)
# ---------------------------------------------------------------------------
# Enqueues a new optimizer job record in MongoDB for background processing.
# Generates unique job identifier and initializes record status to queued.
# Returns generated job ID for status monitoring and execution dispatch.
def create_job(org_id: str, scope: str) -> str:
    job_id = "job_" + uuid.uuid4().hex[:12]
    get_mongo_db()[JOBS].insert_one(
        {"_id": job_id, "org_id": org_id, "scope": scope, "status": "queued", "created_at": _now(), "candidates": []}
    )
    return job_id


# Executes optimization cycle for specified job ID and records outcome.
# Updates status to running, invokes Optimizer pipeline, and marks completion.
# Catches exceptions to record failure state and error message in database.
def run_job(job_id: str, org_id: str, scope: str = "org", **kwargs: Any) -> Dict[str, Any]:
    col = get_mongo_db()[JOBS]
    col.update_one({"_id": job_id}, {"$set": {"status": "running", "started_at": _now()}})
    try:
        summary = Optimizer(org_id, scope=scope, **kwargs).run()
        col.update_one(
            {"_id": job_id},
            {"$set": {"status": "done", "finished_at": _now(), "candidates": summary["candidates"], "summary": summary}},
        )
        return summary
    except Exception as exc:
        logger.warning("optimizer_job_failed", extra={"event": "optimizer_job_failed", "error": str(exc)[:200]})
        col.update_one({"_id": job_id}, {"$set": {"status": "failed", "finished_at": _now(), "error": str(exc)[:300]}})
        return {"error": str(exc)}


# Queries database for the most recent completed optimizer job in an org.
# Sorts finished jobs by timestamp descending and extracts candidate records.
# Returns dictionary containing finish timestamp and generated candidates list.
def last_run(org_id: str) -> Dict[str, Any]:
    """``{lastRunAt, lastCandidates}`` for the org's most recent finished job."""
    rows = list(
        get_mongo_db()[JOBS].find({"org_id": org_id, "status": "done"}).sort("finished_at", -1).limit(1)
    )
    if not rows:
        return {"lastRunAt": None, "lastCandidates": []}
    row = rows[0]
    finished = row.get("finished_at")
    return {
        "lastRunAt": finished.isoformat() if isinstance(finished, datetime) else None,
        "lastCandidates": row.get("candidates", []),
    }


# Fetches details of a specific optimizer job from MongoDB by identifier.
# Normalizes MongoDB primary key field into standard id dictionary attribute.
# Returns job status document or None if no matching record is found.
def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    row = get_mongo_db()[JOBS].find_one({"_id": job_id})
    if not row:
        return None
    row["id"] = row.pop("_id")
    return row
