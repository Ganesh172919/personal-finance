"""
evals/replay.py - Offline replay / candidate evaluation for the self-improvement loop
=====================================================================================

Evaluates a candidate artifact (prompt, routing config or exemplar set) WITHOUT
promoting it and without any network call:

* ``routing``  - golden-query routing agreement, determinism, and replay of logged
  (redacted) runs through the candidate routing config;
* ``prompt``   - renders the candidate through the real prompt composition path with a
  behaviour-responsive stub LLM, applies the production number-safety guard
  (``utils.agent_helpers.numbers_are_subset``) and measures guard leaks, raw LLM
  compliance, schema validity, determinism and a token-cost proxy;
* ``exemplar`` - the educator composition with the exemplar block.

The LLM judge is ADVISORY ONLY: ``judge`` scores are stored under ``advisory`` and
never read by the gate.

Metrics dictionaries are plain JSON (camelCase) so they can be stored in reports.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

from registry import loader
from registry.defaults import PROMPT_SPECS, render_prompt
from registry.models import ArtifactBase, RoutingConfig

# ---------------------------------------------------------------------------
# Golden routing set (mirrors evals/test_routing_accuracy.py; acceptable-route tuples)
# ---------------------------------------------------------------------------
EDU = "financial_education"
INC = "income_expense"
BUD = "budget_planning"
INV = "investment_advice"
DEBT = "debt_optimization"
COMP = "comprehensive"
DEC = "decompose"

REPLAY_PROFILE: Dict[str, Any] = {
    "age": 35,
    "annual_income": 1200000,
    "monthly_expenses": 60000,
    "savings": 300000,
    "debts": [{"name": "Home Loan", "balance": 3500000, "interest_rate": 8.5, "minimum_payment": 35000}],
    "financial_goals": [{"name": "Emergency Fund", "target": 500000, "timeline_months": 12, "priority": 1}],
    "risk_tolerance": "moderate",
    "time_horizon": 20,
    "transactions": [],
}


# Test scenario data model representing an intent routing benchmark case.
# Pairs user query strings with permissible specialist agent routing destinations.
# Specifies whether user financial profile data should accompany the routing query.
@dataclass(frozen=True)
class RoutingCase:
    query: str
    expected: Tuple[str, ...]
    with_profile: bool = True


GOLDEN_ROUTING_CASES: Tuple[RoutingCase, ...] = (
    RoutingCase("Show me my spending pattern this month", (INC,)),
    RoutingCase("Summarize my income vs expenses", (INC,)),
    RoutingCase("Detect anomalies in my transactions", (INC,)),
    RoutingCase("Create a monthly budget for me", (BUD,)),
    RoutingCase("Build a savings plan for my goals", (BUD,)),
    RoutingCase("Recommend a budget plan", (BUD,)),
    RoutingCase("Optimize my investment portfolio", (INV,)),
    RoutingCase("Suggest SIPs for long-term growth", (INV,)),
    RoutingCase("What ETFs should I buy?", (INV,)),
    RoutingCase("Help me pay off my credit card debt faster", (DEBT,)),
    RoutingCase("Create a debt repayment plan", (DEBT,)),
    RoutingCase("Help me manage my EMIs better", (DEBT,)),
    RoutingCase("What is compound interest?", (EDU,), with_profile=False),
    RoutingCase("Explain diversification", (EDU,), with_profile=False),
    RoutingCase("How does inflation work?", (EDU,), with_profile=False),
    RoutingCase("Analyze my finances and create a full plan", (COMP, DEC)),
    RoutingCase("Give me a comprehensive financial strategy", (COMP, DEC)),
    RoutingCase("Create a financial roadmap for me", (COMP, DEC)),
    RoutingCase("Analyze my income, budget, investments, and debt together", (COMP, DEC)),
    RoutingCase("Create a comprehensive plan for my finances", (COMP, DEC)),
    RoutingCase("Create a full financial plan covering budget investing and debt", (COMP, DEC)),
    RoutingCase("budget", (BUD,)),
    RoutingCase("invest", (INV,)),
    RoutingCase("debt", (DEBT,)),
)

# Cases whose ideal answer is a decomposition (informational "plan quality" signal).
DECOMPOSE_PREFERRED: Tuple[str, ...] = (
    "Analyze my income, budget, investments, and debt together",
    "Create a comprehensive plan for my finances",
    "Create a full financial plan covering budget investing and debt",
)

# ---------------------------------------------------------------------------
# Golden plans for prompt replay.  None of them contains the digit 7 (the stub's
# non-compliant output appends "7%" so a leak is always detectable).
# ---------------------------------------------------------------------------
GOLDEN_PLANS: Tuple[str, ...] = (
    "## Plan\n- Monthly surplus: INR 12,000\n- Emergency fund target: INR 300,000 in 24 months\n",
    "## Plan\n- Credit card APR: 36% on INR 100,000\n- Pay INR 5,000 extra each month\n",
    "## Plan\n- SIP: INR 10,000 per month for 20 years\n- Expected allocation: 60% equity, 40% debt\n",
    "## Plan\n- Needs 50%, wants 30%, savings 20%\n- Savings rate target: 20%\n",
    "## Plan\n- Home loan EMI: INR 35,000\n- Prepay INR 20,000 in month 3\n",
    "## Plan\n- Income: INR 100,000\n- Expenses: INR 60,000\n- Net: INR 40,000\n",
    "## Plan\n- Retirement corpus goal: INR 10,000,000 in 25 years\n",
    "## Plan\n- Rent is 25% of income\n- Cut dining by INR 2,000\n",
    "## Plan\n- Debt-free in 18 months\n- Interest saved: INR 45,000\n",
    "## Plan\n- Tax saving: INR 150,000 under section 80C\n",
    "## Plan\n- Goal: INR 100,000 vacation in 6 months\n- Save INR 16,000 monthly\n",
    "## Plan\n- Portfolio rebalance: move 10% from debt to equity\n",
)

_TEMPTING = re.compile(
    r"\b(illustrat\w*|worked example|concrete figures|quantif\w*|ballpark|sample figures?|estimate)\b", re.I
)

APPENDED_LEAK = "\nFor example, saving an extra 7% could help."

_NUMBER_RULE = "do not introduce any new numbers"


# Replaces redaction tokens in benchmark query texts with realistic sample values.
# Substitutes amounts and numerical placeholders to restore valid router syntax.
# Strips account and secret tags to ensure clean input parsing during re-routing.
def rehydrate(text: str) -> str:
    """Make redacted run text routable again (``<AMT>`` -> a rupee amount, ``<NUM>`` -> 1)."""
    out = text or ""
    out = out.replace("<AMT>", "₹1").replace("<NUM>", "1")
    out = re.sub(r"<(?:ACCT|EMAIL|PHONE|SECRET)>", "", out)
    return out


# Calculates an approximate token count across string segments using char heuristics.
# Divides cumulative character lengths by four to estimate prompt and output tokens.
# Enforces a minimum token floor of one for telemetry reporting accuracy.
def _tokens(*parts: str) -> int:
    return max(1, sum(len(p or "") for p in parts) // 4)


# ---------------------------------------------------------------------------
# Stub LLM
# ---------------------------------------------------------------------------
# Deterministic mock LLM stand-in used for offline prompt behavior validation.
# Simulates compliance with strict financial rules and detects prompt drift.
# Appends ungrounded figures when prompts omit numeric guard constraints.
class BehaviorStubLLM:
    """Deterministic, behaviour-responsive stand-in for a chat model.

    It is compliant (returns the plan unchanged inside friendlier framing) only
    when the prompt keeps the explicit no-new-numbers rule and carries no wording
    that tempts a model to add figures.  Otherwise it appends a new number, which
    is exactly the failure mode the production number-safety guard exists to catch.
    """

    # Initializes the behavior stub LLM with execution counters and cache strings.
    # Tracks cumulative call counts across offline prompt evaluation iterations.
    # Resets the last generated raw response buffer to empty state.
    def __init__(self) -> None:
        self.calls = 0
        self.last_raw = ""

    # Simulates language model generation based on system instructions and input prompts.
    # Returns structured subtask JSON or wraps plans within conversational framing.
    # Deliberately injects rule-breaking figures if numeric safety rules are missing.
    def __call__(self, system: str, user: str, *, plan: str = "") -> str:
        self.calls += 1
        blob = f"{system}\n{user}"
        if "assigned_agent" in user and "subtasks" in user:
            self.last_raw = json.dumps(
                {
                    "subtasks": [
                        {"id": "subtask_001", "description": "Analyse cash flow", "assigned_agent": "income_expense_analyzer", "priority": 1, "dependencies": []},
                        {"id": "subtask_002", "description": "Plan budget", "assigned_agent": "budget_planner", "priority": 2, "dependencies": ["subtask_001"]},
                    ],
                    "rationale": "two domains",
                }
            )
            return self.last_raw
        # Polishing calls (``plan`` given) must keep the explicit no-new-numbers rule;
        # every call must be free of wording that tempts a model to add figures.
        needs_rule = bool(plan)
        compliant = (not needs_rule or _NUMBER_RULE in blob.lower()) and not _TEMPTING.search(blob)
        body = plan if plan else "A short explanation of the concept."
        out = "Here is the refined version:\n" + body
        if not compliant:
            out += APPENDED_LEAK
        self.last_raw = out
        return out


# ---------------------------------------------------------------------------
# Metrics helpers
# ---------------------------------------------------------------------------
# Computes a floating-point ratio rounded to four decimal places.
# Safely handles zero-denominator boundary conditions to avoid division exceptions.
# Standardizes percentage calculations across evaluation metrics.
def _rate(num: float, den: float) -> float:
    return round(num / den, 4) if den else 0.0


# Constructs an initialized metrics dictionary populated with default baseline values.
# Standardizes metric keys for routing agreement, guard leaks, and token averages.
# Establishes uniform telemetry structures for report persistence and gating.
def _empty_metrics(kind: str, key: str) -> Dict[str, Any]:
    return {
        "kind": kind,
        "key": key,
        "n": 0,
        "routingAgreement": None,
        "decomposeCoverage": None,
        "guardLeaks": 0,
        "rawNumberCompliance": None,
        "schemaValidity": 1.0,
        "determinism": 1.0,
        "avgTokens": 0.0,
        "avgLatencyMs": 0.0,
        "caseScores": {},
        "advisory": {},
    }


# ---------------------------------------------------------------------------
# Routing evaluation
# ---------------------------------------------------------------------------
# Executes deterministic query routing against the master agent for a test case.
# Selects either full or empty profiles based on test case requirements.
# Normalizes resulting analysis type enum values into lowercase string tags.
def _route(master: Any, case: RoutingCase) -> str:
    profile = REPLAY_PROFILE if case.with_profile else {}
    result = master.determine_analysis_type(user_input=rehydrate(case.query), user_profile=profile)
    return result.value if hasattr(result, "value") else str(result).lower()


# Factory function instantiating a fresh master financial strategist agent.
# Provides isolated agent instances for routing benchmarks and replay tests.
# Avoids shared state contamination between distinct evaluation suites.
def _master() -> Any:
    from agents.master_agent import MasterFinancialStrategistAgent

    return MasterFinancialStrategistAgent()


# Evaluates routing agreement and decision stability for candidate configurations.
# Tests golden routing cases and checks decomposition coverage preferences.
# Computes average routing latencies and logs per-case score breakdowns.
def evaluate_routing(
    cfg: Optional[RoutingConfig],
    *,
    cases: Sequence[RoutingCase] = GOLDEN_ROUTING_CASES,
    master: Any = None,
    runs: Optional[Iterable[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Routing agreement + determinism for ``cfg`` (``None`` = baked-in defaults)."""
    metrics = _empty_metrics("routing", "routing")
    master = master or _master()
    ctx = loader.use_artifacts([cfg], exclusive=True) if cfg is not None else loader.use_defaults()
    ok = 0
    stable = 0
    decompose_hits = 0
    decompose_total = 0
    latencies: List[float] = []
    with ctx:
        for idx, case in enumerate(cases):
            start = time.perf_counter()
            first = _route(master, case)
            latencies.append((time.perf_counter() - start) * 1000.0)
            second = _route(master, case)
            good = first in case.expected
            ok += 1 if good else 0
            stable += 1 if first == second else 0
            metrics["caseScores"][f"route:{idx}"] = 1.0 if good else 0.0
            if case.query in DECOMPOSE_PREFERRED:
                decompose_total += 1
                decompose_hits += 1 if first == DEC else 0
        replay_scores = _replay_runs(master, runs) if runs is not None else None
    n = len(cases)
    metrics["n"] = n
    metrics["routingAgreement"] = _rate(ok, n)
    metrics["determinism"] = _rate(stable, n)
    metrics["decomposeCoverage"] = _rate(decompose_hits, decompose_total) if decompose_total else None
    metrics["avgLatencyMs"] = round(sum(latencies) / n, 3) if n else 0.0
    if replay_scores is not None:
        metrics["runReplay"] = replay_scores
        for key, score in replay_scores.pop("_scores", {}).items():
            metrics["caseScores"][key] = score
    return metrics


# Replays historical production queries through a candidate routing configuration.
# Excludes downvoted interaction records to prevent reinforcing historical flaws.
# Calculates route agreement percentages between original and replayed outputs.
def _replay_runs(master: Any, runs: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    """Re-route logged (redacted) runs; agreement = same route as originally served.

    Runs with a thumbs-down are excluded: a changed route there is not a regression.
    """
    scores: Dict[str, float] = {}
    total = 0
    same = 0
    for run in runs:
        text = run.get("input_text") or ""
        logged = (run.get("route") or "").strip()
        if not text or not logged or run.get("_downvoted"):
            continue
        case = RoutingCase(text, (logged,))
        routed = _route(master, case)
        good = routed == logged
        total += 1
        same += 1 if good else 0
        scores[f"run:{run.get('request_id') or total}"] = 1.0 if good else 0.0
    return {"runs": total, "agreement": _rate(same, total), "_scores": scores}


# ---------------------------------------------------------------------------
# Prompt / exemplar evaluation
# ---------------------------------------------------------------------------
# Validates structural integrity of JSON decomposition plans from language models.
# Parses raw text blocks and tests subtask graphs for acyclicity and known agents.
# Returns boolean indicators confirming whether candidate plans are executable.
def _decomposer_valid(raw: str) -> bool:
    from agents.task_decomposer import TaskDecomposerAgent

    decomposer = TaskDecomposerAgent()
    parsed = decomposer._parse_llm_output(raw)
    return bool(decomposer._validate_subtasks(parsed.get("subtasks", [])))


# Evaluates candidate prompt or exemplar artifacts against baseline plans.
# Renders templates through mock model environments to verify number safety.
# Assesses raw LLM compliance, token consumption, and schema validity.
def evaluate_prompt_artifact(
    artifact: ArtifactBase,
    *,
    llm: Optional[Callable[..., str]] = None,
    plans: Sequence[str] = GOLDEN_PLANS,
    judge: Optional[Callable[[str, str], float]] = None,
) -> Dict[str, Any]:
    """Evaluate a prompt or exemplar candidate (or defaults when ``artifact`` is None-like key)."""
    return _evaluate_text_slot(artifact.kind, artifact.key, [artifact], llm=llm, plans=plans, judge=judge)


# Generates baseline performance metrics using hardcoded system default prompts.
# Dispatches to routing benchmarks or text slot evaluation routines as appropriate.
# Serves as the comparison benchmark when evaluating proposed learning artifacts.
def evaluate_defaults(kind: str, key: str, **kwargs: Any) -> Dict[str, Any]:
    """Baseline metrics for a slot served by the baked-in defaults."""
    if kind == "routing":
        return evaluate_routing(None, **{k: v for k, v in kwargs.items() if k in ("cases", "master", "runs")})
    return _evaluate_text_slot(kind, key, [], **kwargs)


# Evaluates prompt template slots by simulating generation and applying safety guards.
# Tests candidate templates across golden financial plans for numeric leakages.
# Records token consumption, generation latency, and optional advisory judge scores.
def _evaluate_text_slot(
    kind: str,
    key: str,
    artifacts: Sequence[ArtifactBase],
    *,
    llm: Optional[Callable[..., str]] = None,
    plans: Sequence[str] = GOLDEN_PLANS,
    judge: Optional[Callable[[str, str], float]] = None,
) -> Dict[str, Any]:
    metrics = _empty_metrics(kind, key)
    llm = llm or BehaviorStubLLM()
    spec = PROMPT_SPECS.get(key)
    if spec is None:
        metrics["error"] = f"unknown slot {key}"
        return metrics

    ctx = loader.use_artifacts(list(artifacts), exclusive=True)
    guard_leaks = 0
    raw_ok = 0
    valid = 0
    stable = 0
    tokens: List[int] = []
    latencies: List[float] = []
    judge_scores: List[float] = []
    family = key.split(".", 1)[0]

    from utils.agent_helpers import numbers_are_subset

    with ctx:
        system_text = loader.get_prompt(f"{family}.system")
        template = loader.get_prompt(key) if spec.is_template else loader.get_prompt(f"{family}.polish" if family in ("master", "aggregator") else f"{family}.explain" if family == "educator" else f"{family}.decompose")
        exemplar_block = ""
        if family == "educator":
            examples = loader.get_exemplars("educator.explain")
            if examples:
                exemplar_block = "\n".join(
                    ["", "Examples of the expected style (illustrative wording only):"]
                    + [f"Q: {e.input}\nA: {e.output}" for e in examples]
                ) + "\n"

        for idx, plan in enumerate(plans):
            start = time.perf_counter()
            if family in ("master", "aggregator"):
                user = render_prompt(template, session_summary="", recent_messages=[], plan=plan)
                raw = _call(llm, system_text, user, plan)
                again = _call(llm, system_text, user, plan)
                reference = plan
                final = raw.strip() + "\n" if numbers_are_subset(raw.strip() + "\n", reference) else plan
                case_valid = bool(raw.strip())
            elif family == "educator":
                user = render_prompt(template, concept="diversification", profile_context="Age and goals on file", user_input="Explain diversification") + exemplar_block
                raw = _call(llm, system_text, user, "")
                again = _call(llm, system_text, user, "")
                reference = user
                final = raw if numbers_are_subset(raw, reference) else "fallback"
                case_valid = bool(raw.strip())
            else:  # decomposer
                user = render_prompt(template, user_input=f"Plan my finances {idx}", profile_summary="n/a")
                raw = _call(llm, system_text, user, "")
                again = _call(llm, system_text, user, "")
                reference = raw
                final = raw
                case_valid = _decomposer_valid(raw)
            latencies.append((time.perf_counter() - start) * 1000.0)
            compliant = numbers_are_subset(raw, reference) if family != "decomposer" else True
            leak = family != "decomposer" and not numbers_are_subset(final, reference)
            guard_leaks += 1 if leak else 0
            raw_ok += 1 if compliant else 0
            valid += 1 if case_valid else 0
            stable += 1 if raw == again else 0
            tokens.append(_tokens(system_text, user, raw))
            metrics["caseScores"][f"{key}:{idx}"] = 1.0 if (compliant and case_valid and not leak) else 0.0
            if judge is not None:
                try:
                    judge_scores.append(float(judge(user, raw)))
                except Exception:  # advisory only; never fatal
                    pass

    n = len(plans)
    metrics["n"] = n
    metrics["guardLeaks"] = guard_leaks
    metrics["rawNumberCompliance"] = _rate(raw_ok, n) if family != "decomposer" else None
    metrics["schemaValidity"] = _rate(valid, n)
    metrics["determinism"] = _rate(stable, n)
    metrics["avgTokens"] = round(sum(tokens) / n, 2) if n else 0.0
    metrics["avgLatencyMs"] = round(sum(latencies) / n, 3) if n else 0.0
    if judge_scores:
        metrics["advisory"] = {"judgeMean": round(sum(judge_scores) / len(judge_scores), 4), "note": "advisory only"}
    return metrics


# Dispatches invocation requests to language model callables with fallback signatures.
# Attempts invocation with plan keyword arguments before falling back to basic pairs.
# Normalizes model interface differences across custom stubs and real clients.
def _call(llm: Callable[..., str], system: str, user: str, plan: str) -> str:
    try:
        return llm(system, user, plan=plan)
    except TypeError:
        return llm(system, user)


# Evaluates candidate learning artifacts based on their specific kind classification.
# Routes routing configurations to route evaluation suites and prompts to text suites.
# Returns standardized metric dictionaries for automated gate promotion checks.
def evaluate_artifact(
    artifact: ArtifactBase,
    *,
    llm: Optional[Callable[..., str]] = None,
    master: Any = None,
    runs: Optional[Iterable[Dict[str, Any]]] = None,
    judge: Optional[Callable[[str, str], float]] = None,
) -> Dict[str, Any]:
    """Candidate metrics for any artifact kind."""
    if isinstance(artifact, RoutingConfig):
        return evaluate_routing(artifact, master=master, runs=runs)
    return evaluate_prompt_artifact(artifact, llm=llm, judge=judge)


# Resolves and evaluates active baseline artifacts for a given target slot.
# Identifies currently active production artifacts or falls back to system defaults.
# Provides reference metrics to ensure candidate artifacts represent true improvements.
def evaluate_baseline(
    artifact: ArtifactBase,
    *,
    llm: Optional[Callable[..., str]] = None,
    master: Any = None,
    runs: Optional[Iterable[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Baseline metrics for the slot ``artifact`` would replace.

    When an active artifact exists for the slot it is the baseline; otherwise the
    baked-in default is.
    """
    from registry.store import ArtifactStore

    try:
        active = ArtifactStore().active_for(artifact.kind, artifact.key, artifact.scope, artifact.org_id)
    except Exception:
        active = None
    if active is not None and active.id != artifact.id:
        return evaluate_artifact(active, llm=llm, master=master, runs=runs)
    if artifact.kind == "routing":
        return evaluate_routing(None, master=master, runs=runs)
    return _evaluate_text_slot(artifact.kind, artifact.key, [], llm=llm)
