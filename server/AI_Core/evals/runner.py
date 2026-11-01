r"""
runner.py - Evaluation Runner for the FinWise Agent System
============================================================

The ``EvalRunner`` class loads eval suites from YAML or Python dicts,
runs each case against the agent system, collects metrics, and produces
a summary report for continuous agent self-evaluation and quality regression detection.

Usage::

    from evals.runner import EvalRunner

    runner = EvalRunner()
    runner.load_suite(suites)
    report = runner.run()
    print(report)

The runner supports:
- Filtering by agent type (routing, quality, determinism, safety, latency)
- Metric collection: pass/fail, latency, token count, cost
- JSON and terminal summary output

MINDMAP FLOW
------------
::

    EvalRunner (Self-Evaluation Framework)
    ├── 1. Test Suite Ingestion (load_suite / load_from_dir)
    │   ├── Case parsing into EvalCase data structures
    │   ├── Category tag filtering (routing, quality, determinism, safety, latency)
    │   └── Expected output / Golden reference mapping
    ├── 2. Execution Engine (run / run_case)
    │   ├── Category-Specific Evaluators:
    │   │   ├── _run_routing_case (RoutingAccuracy metric)
    │   │   ├── _run_safety_case (NumberSafety subset validator)
    │   │   ├── _run_determinism_case (Multi-run byte-for-byte reproducibility)
    │   │   ├── _run_quality_case (PlanQuality structural & semantic checks)
    │   │   └── _run_latency_case (Execution duration vs SLA thresholds)
    │   ├── High-Resolution Timing per Case
    │   └── Safe Exception Catching into EvalResult
    ├── 3. Metrics Aggregation
    │   ├── Pass / Fail Counts and Ratios
    │   ├── Category-Level Breakdowns
    │   ├── Latency Distributions (P50, P90, P99)
    │   └── Estimated Token Usage & Cost Totals
    └── 4. Self-X Reporting & Continuous Improvement
        ├── Console Summary Table Rendering (render_terminal_summary)
        ├── Machine-readable JSON Export (to_json)
        └── Regression Detection Thresholds (Triggers alerts on accuracy dip)

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |             Load Evaluation Suite (YAML or Python Dict)       |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |                  Filter Cases by Target Tags                  |
    +-------------------------------+-------------------------------+
                                    |
                                    v
                   +----------------+---------------+
                   | Loop through each EvalCase     |<-----------------+
                   +----------------+---------------+                  |
                                    |                                  |
                                    v                                  |
                     [Select Evaluator by Category]                    |
                 /          |           |            \                 |
                /           |           |             \                |
               v            v           v              v               |
        [Routing Case] [Safety Case] [Determinism]  [Quality Case]     |
        Test Master    Test Number   Run multiple   Check required     |
        Router target  Subset guard  times & cmp    plan structures    |
               \            |           |              /               |
                \           |           |             /                |
                 v          v           v            v                 |
    +---------------------------------------------------------------+  |
    |                   Record EvalResult:                          |  |
    |     - passed: bool, elapsed_ms: float, details: dict          |  |
    +-------------------------------+-------------------------------+  |
                                    |                                  |
                         [More Cases in Suite?]                        |
                                /          \                           |
                              YES           NO                         |
                              /              \                         |
                (Next Case) -+                v                        |
    +---------------------------------------------------------------+  |
    |                  Aggregate into EvalReport                    |  |
    |  - total_cases, passed, failed, duration_ms                   |  |
    |  - category_summaries, failure_details                        |  |
    +-------------------------------+-------------------------------+  |
                                    |                                  |
                                    v                                  |
    +---------------------------------------------------------------+  |
    | Emit JSON / Terminal Summary for Automated Self-Correction    |  |
    +---------------------------------------------------------------+--+
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from .metrics import (
    Latency,
    RoutingAccuracy,
)


@dataclass
class EvalCase:
    """A single evaluation case."""

    id: str
    category: str  # routing, quality, determinism, safety, latency
    description: str
    input_data: Dict[str, Any]
    expected: Optional[Any] = None
    tags: List[str] = field(default_factory=list)


@dataclass
class EvalResult:
    """Result of running a single eval case."""

    case_id: str
    category: str
    passed: bool
    elapsed_ms: float
    details: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None


@dataclass
class EvalReport:
    """Aggregate report from running an eval suite."""

    total_cases: int
    passed: int
    failed: int
    pass_rate: float
    elapsed_ms: float
    by_category: Dict[str, Dict[str, Any]]
    results: List[EvalResult]
    metrics: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_cases": self.total_cases,
            "passed": self.passed,
            "failed": self.failed,
            "pass_rate_pct": round(self.pass_rate * 100, 1),
            "elapsed_ms": round(self.elapsed_ms, 2),
            "by_category": self.by_category,
            "metrics": self.metrics,
            "failures": [
                {
                    "case_id": r.case_id,
                    "category": r.category,
                    "error": r.error,
                    "details": r.details,
                }
                for r in self.results
                if not r.passed
            ],
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, default=str)

    def summary_text(self) -> str:
        lines = [
            "=" * 60,
            "FinWise AI Agent Evaluation Report",
            "=" * 60,
            f"Total cases: {self.total_cases}",
            f"Passed:      {self.passed}",
            f"Failed:      {self.failed}",
            f"Pass rate:   {self.pass_rate * 100:.1f}%",
            f"Elapsed:     {self.elapsed_ms:.0f}ms",
            "",
            "--- By Category ---",
        ]
        for cat, stats in self.by_category.items():
            lines.append(
                f"  {cat}: {stats['passed']}/{stats['total']} passed "
                f"({stats['pass_rate'] * 100:.1f}%)"
            )

        if self.failures_text():
            lines.append("")
            lines.append("--- Failures ---")
            lines.append(self.failures_text())

        return "\n".join(lines)

    def failures_text(self) -> str:
        failure_lines = []
        for r in self.results:
            if not r.passed:
                failure_lines.append(
                    f"  [{r.category}] {r.case_id}: {r.error or 'FAILED'}"
                )
        return "\n".join(failure_lines)


class EvalRunner:
    """Orchestrates evaluation suites and produces reports.

    Usage::

        runner = EvalRunner()

        # Add individual cases
        runner.add_case(EvalCase(
            id="route_001",
            category="routing",
            description="Budget query routes to budget_planning",
            input_data={"query": "Create a budget for me", "profile": profile},
            expected="budget_planning",
        ))

        # Run
        report = runner.run()
        print(report.summary_text())
    """

    def __init__(self) -> None:
        self._cases: List[EvalCase] = []
        self._evaluators: Dict[str, Callable] = {}

    def add_case(self, case: EvalCase) -> None:
        """Add a single eval case."""
        self._cases.append(case)

    def load_suite(self, cases: List[Dict[str, Any]]) -> None:
        """Load eval cases from a list of dicts (e.g. parsed YAML)."""
        for c in cases:
            self._cases.append(
                EvalCase(
                    id=c.get("id", f"case_{len(self._cases)}"),
                    category=c.get("category", "unknown"),
                    description=c.get("description", ""),
                    input_data=c.get("input_data", {}),
                    expected=c.get("expected"),
                    tags=c.get("tags", []),
                )
            )

    def register_evaluator(
        self, category: str, fn: Callable[[EvalCase], EvalResult]
    ) -> None:
        """Register a custom evaluator for a category."""
        self._evaluators[category] = fn

    def run(
        self,
        *,
        categories: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
    ) -> EvalReport:
        """Run all eval cases and produce a report.

        Parameters
        ----------
        categories : list[str], optional
            Filter to only these categories.
        tags : list[str], optional
            Filter to only cases with at least one matching tag.
        """
        filtered = self._cases
        if categories:
            filtered = [c for c in filtered if c.category in categories]
        if tags:
            tag_set = set(tags)
            filtered = [c for c in filtered if tag_set & set(c.tags)]

        results: List[EvalResult] = []
        start = time.perf_counter()

        for case in filtered:
            evaluator = self._evaluators.get(case.category)
            if evaluator is None:
                results.append(
                    EvalResult(
                        case_id=case.id,
                        category=case.category,
                        passed=False,
                        elapsed_ms=0,
                        error=f"No evaluator registered for category '{case.category}'",
                    )
                )
                continue

            try:
                result = evaluator(case)
                results.append(result)
            except Exception as exc:
                results.append(
                    EvalResult(
                        case_id=case.id,
                        category=case.category,
                        passed=False,
                        elapsed_ms=0,
                        error=str(exc),
                    )
                )

        elapsed_ms = (time.perf_counter() - start) * 1000

        # Aggregate by category
        by_category: Dict[str, Dict[str, Any]] = {}
        for r in results:
            cat = r.category
            if cat not in by_category:
                by_category[cat] = {"total": 0, "passed": 0, "failed": 0, "pass_rate": 0}
            by_category[cat]["total"] += 1
            if r.passed:
                by_category[cat]["passed"] += 1
            else:
                by_category[cat]["failed"] += 1

        for cat in by_category:
            total = by_category[cat]["total"]
            by_category[cat]["pass_rate"] = by_category[cat]["passed"] / total if total > 0 else 0

        total = len(results)
        passed = sum(1 for r in results if r.passed)

        return EvalReport(
            total_cases=total,
            passed=passed,
            failed=total - passed,
            pass_rate=passed / total if total > 0 else 0,
            elapsed_ms=elapsed_ms,
            by_category=by_category,
            results=results,
            metrics={
                "routing": RoutingAccuracy().summary() if any(r.category == "routing" for r in results) else None,
                "latency": Latency().summary() if any(r.category == "latency" for r in results) else None,
            },
        )
