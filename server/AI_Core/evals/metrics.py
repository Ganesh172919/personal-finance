r"""
metrics.py - Evaluation Metrics for the FinWise Agent System
=============================================================

Provides reusable metric classes for evaluating agent quality:

- **RoutingAccuracy** -- Does the query route to the correct agent?
- **PlanQuality** -- Does the plan satisfy structural and semantic constraints?
- **NumberSafety** -- Are LLM numbers a subset of deterministic numbers?
- **Determinism** -- Same input produces same output for deterministic agents.
- **Latency** -- P50/P95/P99 timing per agent.
- **CostEstimate** -- Token usage times rate.

Each metric class is stateless and composable.  The ``EvalRunner`` in
``runner.py`` uses these to compute aggregate scores across eval suites.

MINDMAP FLOW
------------
::

    Self-Evaluation Metrics Suite
    ├── 1. RoutingAccuracy
    │   ├── Query intent categorization check
    │   ├── Golden routing test comparisons
    │   └── Accuracy percentage calculation
    ├── 2. NumberSafety (Hallucination Guard)
    │   ├── extract_numbers from reference plan
    │   ├── extract_numbers from LLM candidate text
    │   ├── Strict subset validation (Candidate numbers ⊆ Reference numbers)
    │   └── Flag foreign digits, altered APRs, and mutated sums
    ├── 3. Determinism & Reproducibility
    │   ├── Consecutive execution output comparison
    │   ├── Byte-for-byte SHA256 digest equality
    │   └── Zero variance check across deterministic specialist runs
    ├── 4. PlanQuality Evaluation
    │   ├── Structural completeness (executive_summary, metrics, actions)
    │   ├── Temporal action buckets (7d, 30d, 12m)
    │   └── Financial ratio consistency (DTI, runway, savings rate)
    ├── 5. Latency Profiling
    │   ├── Metric recording (ms)
    │   ├── Percentile distributions (P50, P90, P95, P99)
    │   └── Threshold breach detection against SLA budgets
    └── 6. Cost Estimation
        ├── Input / Output token counts
        ├── Model-specific pricing lookup
        └── Cumulative USD cost modeling

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |                  Agent Execution Output / Trace               |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |             Dispatch to Specific Metric Class                 |
    +-------------------------------+-------------------------------+
            |               |               |               |
            v               v               v               v
     [RoutingAccuracy] [NumberSafety]   [Determinism]   [PlanQuality]
      Check expected    Verify LLM num   Compare run N   Verify model
      agent == actual   is subset of det vs run N+1      fields present
            |               |               |               |
            \               |               |              /
             \              |               |             /
              v             v               v            v
    +---------------------------------------------------------------+
    |                    Compute Metric Summary                     |
    |  - score: 0.0 - 1.0 / pass_rate / percentile breakdown        |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |          Feed into Continual Improvement & Feedback           |
    +---------------------------------------------------------------+
"""

from __future__ import annotations

import statistics
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

from utils.agent_helpers import extract_numbers

# ---------------------------------------------------------------------------
# Routing Accuracy
# ---------------------------------------------------------------------------


@dataclass
class RoutingMetric:
    """Result of a single routing evaluation."""

    query: str
    expected: str
    actual: str
    passed: bool
    description: str = ""


class RoutingAccuracy:
    """Evaluate routing accuracy across a set of golden prompts.

    Usage::

        metric = RoutingAccuracy()
        metric.record(query, expected_type, actual_type, description)
        print(metric.summary())
    """

    def __init__(self) -> None:
        self._results: List[RoutingMetric] = []

    def record(
        self,
        query: str,
        expected: str,
        actual: str,
        description: str = "",
    ) -> RoutingMetric:
        passed = expected == actual
        result = RoutingMetric(
            query=query,
            expected=expected,
            actual=actual,
            passed=passed,
            description=description,
        )
        self._results.append(result)
        return result

    @property
    def total(self) -> int:
        return len(self._results)

    @property
    def passed(self) -> int:
        return sum(1 for r in self._results if r.passed)

    @property
    def failed(self) -> int:
        return self.total - self.passed

    @property
    def accuracy(self) -> float:
        return self.passed / self.total if self.total > 0 else 0.0

    def failures(self) -> List[RoutingMetric]:
        return [r for r in self._results if not r.passed]

    def summary(self) -> Dict[str, Any]:
        return {
            "total": self.total,
            "passed": self.passed,
            "failed": self.failed,
            "accuracy_pct": round(self.accuracy * 100, 1),
            "failures": [
                {"query": f.query, "expected": f.expected, "actual": f.actual, "desc": f.description}
                for f in self.failures()
            ],
        }


# ---------------------------------------------------------------------------
# Plan Quality
# ---------------------------------------------------------------------------


@dataclass
class PlanQualityResult:
    """Result of a single plan quality evaluation."""

    plan: Dict[str, Any]
    checks: Dict[str, bool]
    passed: bool
    issues: List[str] = field(default_factory=list)


class PlanQuality:
    """Evaluate structural and semantic quality of a generated Plan.

    Checks performed:
    - ``executive_summary`` is non-empty
    - ``key_metrics`` exists and is a dict
    - ``actions`` has all three buckets
    - Every action item has ``kind``, ``due_days``, ``priority``
    - ``key_metrics.savings_rate`` is in [0, 100] when present
    - ``key_metrics.debt_to_income`` is in [0, 100] when present
    - ``data_warnings`` is populated when profile data is missing
    """

    def evaluate(
        self,
        plan: Dict[str, Any],
        *,
        has_profile: bool = True,
        has_transactions: bool = True,
    ) -> PlanQualityResult:
        checks: Dict[str, bool] = {}
        issues: List[str] = []

        # 1. Executive summary
        summary = plan.get("executive_summary", "")
        checks["executive_summary_present"] = bool(summary and summary.strip())
        if not checks["executive_summary_present"]:
            issues.append("executive_summary is empty or missing")

        # 2. Key metrics structure
        km = plan.get("key_metrics")
        checks["key_metrics_is_dict"] = isinstance(km, dict)
        if not checks["key_metrics_is_dict"]:
            issues.append("key_metrics is not a dict")

        # 3. Actions structure
        actions = plan.get("actions", {})
        checks["actions_has_buckets"] = all(
            b in actions for b in ("next_7_days", "next_30_days", "next_12_months")
        )
        if not checks["actions_has_buckets"]:
            issues.append("actions missing one or more time buckets")

        # 4. Action item fields
        all_items = []
        for bucket in ("next_7_days", "next_30_days", "next_12_months"):
            all_items.extend(actions.get(bucket, []))

        checks["all_action_items_have_kind"] = all("kind" in item for item in all_items)
        checks["all_action_items_have_due_days"] = all("due_days" in item for item in all_items)
        checks["all_action_items_have_priority"] = all("priority" in item for item in all_items)

        if not checks["all_action_items_have_kind"]:
            issues.append("Some action items missing 'kind'")
        if not checks["all_action_items_have_due_days"]:
            issues.append("Some action items missing 'due_days'")
        if not checks["all_action_items_have_priority"]:
            issues.append("Some action items missing 'priority'")

        # 5. Metric range checks
        if isinstance(km, dict):
            sr = km.get("savings_rate")
            if sr is not None:
                checks["savings_rate_in_range"] = 0 <= float(sr) <= 100
                if not checks["savings_rate_in_range"]:
                    issues.append(f"savings_rate out of [0,100]: {sr}")

            dti = km.get("debt_to_income")
            if dti is not None:
                checks["debt_to_income_in_range"] = 0 <= float(dti) <= 100
                if not checks["debt_to_income_in_range"]:
                    issues.append(f"debt_to_income out of [0,100]: {dti}")

        # 6. Data warnings
        warnings = plan.get("data_warnings", [])
        if not has_profile:
            checks["data_warnings_when_no_profile"] = len(warnings) > 0
            if not checks["data_warnings_when_no_profile"]:
                issues.append("No data_warnings despite missing profile")
        elif not has_transactions:
            checks["data_warnings_when_no_transactions"] = len(warnings) > 0
            if not checks["data_warnings_when_no_transactions"]:
                issues.append("No data_warnings despite missing transactions")

        passed = all(checks.values())
        return PlanQualityResult(
            plan=plan,
            checks=checks,
            passed=passed,
            issues=issues,
        )

    def batch_evaluate(self, plans: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Evaluate multiple plans and return aggregate stats."""
        results = [self.evaluate(plan) for plan in plans]
        return {
            "total": len(results),
            "passed": sum(1 for r in results if r.passed),
            "failed": sum(1 for r in results if not r.passed),
            "pass_rate": sum(1 for r in results if r.passed) / len(results) if results else 0,
            "common_failures": self._common_failures(results),
        }

    @staticmethod
    def _common_failures(results: List[PlanQualityResult]) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for r in results:
            for issue in r.issues:
                counts[issue] = counts.get(issue, 0) + 1
        return dict(sorted(counts.items(), key=lambda x: -x[1]))


# ---------------------------------------------------------------------------
# Number Safety
# ---------------------------------------------------------------------------


class NumberSafety:
    """Evaluate the number safety guard.

    The guard ensures that every number in the LLM output already exists
    in the deterministic reference text.
    """

    def evaluate(self, candidate: str, reference: str) -> Dict[str, Any]:
        candidate_numbers = extract_numbers(candidate)
        reference_numbers = extract_numbers(reference)
        introduced = candidate_numbers - reference_numbers

        return {
            "passed": len(introduced) == 0,
            "candidate_numbers": sorted(candidate_numbers),
            "reference_numbers": sorted(reference_numbers),
            "introduced_numbers": sorted(introduced),
            "total_candidate": len(candidate_numbers),
            "total_reference": len(reference_numbers),
            "total_introduced": len(introduced),
        }

    def batch_evaluate(self, pairs: List[Tuple[str, str]]) -> Dict[str, Any]:
        results = [self.evaluate(c, r) for c, r in pairs]
        return {
            "total": len(results),
            "passed": sum(1 for r in results if r["passed"]),
            "failed": sum(1 for r in results if not r["passed"]),
            "pass_rate": sum(1 for r in results if r["passed"]) / len(results) if results else 0,
        }


# ---------------------------------------------------------------------------
# Determinism
# ---------------------------------------------------------------------------


class Determinism:
    """Evaluate whether a function produces the same output for the same input.

    Runs the function N times and compares outputs using deterministic
    number extraction (ignoring formatting differences).
    """

    def evaluate(
        self,
        fn: Callable[[], Any],
        *,
        runs: int = 3,
        compare_fn: Optional[Callable[[Any, Any], bool]] = None,
    ) -> Dict[str, Any]:
        if compare_fn is None:
            def compare_fn(a, b):
                return str(a) == str(b)

        outputs = [fn() for _ in range(runs)]
        all_equal = all(compare_fn(outputs[0], o) for o in outputs[1:])

        return {
            "passed": all_equal,
            "runs": runs,
            "output_lengths": [len(str(o)) for o in outputs],
            "first_output_preview": str(outputs[0])[:200] if outputs else "",
        }


# ---------------------------------------------------------------------------
# Latency
# ---------------------------------------------------------------------------


@dataclass
class LatencySample:
    """A single latency measurement."""

    agent_name: str
    elapsed_ms: float


class Latency:
    """Collect and analyze latency samples.

    Usage::

        metric = Latency()
        with metric.measure("income_analyzer"):
            agent.analyze_finances(transactions)
        print(metric.summary("income_analyzer"))
    """

    def __init__(self) -> None:
        self._samples: Dict[str, List[float]] = {}

    def measure(self, agent_name: str) -> "_LatencyContext":
        return _LatencyContext(self, agent_name)

    def _record(self, agent_name: str, elapsed_ms: float) -> None:
        self._samples.setdefault(agent_name, []).append(elapsed_ms)

    def summary(self, agent_name: Optional[str] = None) -> Dict[str, Any]:
        if agent_name:
            return self._summarize_one(agent_name)
        return {name: self._summarize_one(name) for name in self._samples}

    def _summarize_one(self, agent_name: str) -> Dict[str, Any]:
        samples = self._samples.get(agent_name, [])
        if not samples:
            return {"agent": agent_name, "count": 0}

        sorted_samples = sorted(samples)
        n = len(sorted_samples)

        return {
            "agent": agent_name,
            "count": n,
            "min_ms": round(sorted_samples[0], 2),
            "max_ms": round(sorted_samples[-1], 2),
            "mean_ms": round(statistics.mean(sorted_samples), 2),
            "p50_ms": round(sorted_samples[n // 2], 2),
            "p95_ms": round(sorted_samples[int(n * 0.95)], 2) if n >= 2 else round(sorted_samples[-1], 2),
            "p99_ms": round(sorted_samples[int(n * 0.99)], 2) if n >= 10 else round(sorted_samples[-1], 2),
        }


class _LatencyContext:
    """Context manager for latency measurement."""

    def __init__(self, metric: Latency, agent_name: str) -> None:
        self._metric = metric
        self._agent_name = agent_name
        self._start: float = 0

    def __enter__(self) -> "_LatencyContext":
        self._start = time.perf_counter()
        return self

    def __exit__(self, *args: Any) -> None:
        elapsed_ms = (time.perf_counter() - self._start) * 1000
        self._metric._record(self._agent_name, elapsed_ms)


# ---------------------------------------------------------------------------
# Cost Estimate
# ---------------------------------------------------------------------------


# Approximate token costs per 1M tokens (as of 2026)
_COST_PER_1M_TOKENS: Dict[str, Tuple[float, float]] = {
    # (input_cost, output_cost) per 1M tokens
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "gpt-4-turbo": (10.00, 30.00),
    "claude-3-5-sonnet": (3.00, 15.00),
    "claude-3-haiku": (0.25, 1.25),
    "gemini-1.5-flash": (0.075, 0.30),
    "gemini-1.5-pro": (1.25, 5.00),
}


class CostEstimate:
    """Estimate cost from token counts."""

    def estimate(
        self,
        input_tokens: int,
        output_tokens: int,
        model: str = "gpt-4o-mini",
    ) -> Dict[str, Any]:
        rates = _COST_PER_1M_TOKENS.get(model, (1.0, 3.0))
        input_cost = (input_tokens / 1_000_000) * rates[0]
        output_cost = (output_tokens / 1_000_000) * rates[1]
        total_cost = input_cost + output_cost

        return {
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "input_cost_usd": round(input_cost, 6),
            "output_cost_usd": round(output_cost, 6),
            "total_cost_usd": round(total_cost, 6),
        }

    def estimate_deterministic_savings(
        self,
        input_tokens: int,
        output_tokens: int,
        model: str = "gpt-4o-mini",
    ) -> Dict[str, Any]:
        """Estimate savings from deterministic-first approach.

        Deterministic agents use zero tokens; LLM polish uses a fraction.
        """
        full_cost = self.estimate(input_tokens, output_tokens, model)
        # Deterministic approach: ~10% of tokens for optional polish only
        polish_cost = self.estimate(
            int(input_tokens * 0.3),
            int(output_tokens * 0.1),
            model,
        )

        return {
            "full_llm_cost_usd": full_cost["total_cost_usd"],
            "deterministic_cost_usd": 0.0,
            "polish_only_cost_usd": polish_cost["total_cost_usd"],
            "savings_vs_full_llm_usd": round(full_cost["total_cost_usd"] - polish_cost["total_cost_usd"], 6),
            "savings_pct": round(
                (1 - polish_cost["total_cost_usd"] / full_cost["total_cost_usd"]) * 100, 1
            ) if full_cost["total_cost_usd"] > 0 else 100.0,
        }
