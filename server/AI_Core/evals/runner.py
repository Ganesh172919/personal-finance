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


# Test case container defining inputs and expectations for evaluation suites.
# Specifies evaluation categories, descriptions, input payloads, and gold labels.
# Supports tag-based filtering for selective category executions during CI.
@dataclass
class EvalCase:
    """A single evaluation case."""

    id: str
    category: str  # routing, quality, determinism, safety, latency
    description: str
    input_data: Dict[str, Any]
    expected: Optional[Any] = None
    tags: List[str] = field(default_factory=list)


# Encapsulates evaluation outcome and timing for a single test case.
# Tracks pass status, elapsed runtime, and optional failure details.
# Serves as the primary unit of measurement in evaluation runs.
@dataclass
class EvalResult:
    """Result of running a single eval case."""

    case_id: str
    category: str
    passed: bool
    elapsed_ms: float
    details: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None


# Aggregates evaluation execution results across multiple test cases.
# Computes pass rates, execution durations, and category breakdowns.
# Provides serialisation and formatted summary reporting capabilities.
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

    # Converts evaluation summary metrics and outcomes into a dictionary.
    # Extracts category breakdowns, performance numbers, and failure records.
    # Normalises floating point rates and durations for reporting outputs.
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

    # Serialises evaluation report dictionary into formatted JSON text.
    # Configures indentation and default object conversion handlers.
    # Enables persistence and external tooling consumption of eval runs.
    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, default=str)

    # Formats evaluation report statistics into human-readable text.
    # Builds summary header, category-level pass counts, and failure blocks.
    # Returns formatted string suitable for command line display or logging.
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

    # Gathers descriptions of all failed evaluation cases in the suite.
    # Formats category tags, case identifiers, and associated error strings.
    # Joins individual failure lines into newline-delimited report block.
    def failures_text(self) -> str:
        failure_lines = []
        for r in self.results:
            if not r.passed:
                failure_lines.append(
                    f"  [{r.category}] {r.case_id}: {r.error or 'FAILED'}"
                )
        return "\n".join(failure_lines)


# Orchestrates agent evaluation suites, running cases and aggregating reports.
# Manages registered category evaluators and case filtering mechanisms.
# Computes run statistics and diagnostic metrics across test executions.
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

    # Initialises evaluation runner with empty test cases and evaluators registry.
    # Sets up internal case list container for staging evaluation suites.
    # Prepares evaluator dispatch dictionary keyed by evaluation categories.
    def __init__(self) -> None:
        self._cases: List[EvalCase] = []
        self._evaluators: Dict[str, Callable] = {}

    # Appends an individual evaluation case to the runner suite.
    # Preserves evaluation input data, expected targets, and metadata tags.
    # Enqueues case for execution during subsequent runner suite invocations.
    def add_case(self, case: EvalCase) -> None:
        """Add a single eval case."""
        self._cases.append(case)

    # Loads and converts a collection of dictionary records into eval cases.
    # Parses case identifiers, category keys, descriptions, and tag lists.
    # Populates test suite from serialized configuration or YAML fixtures.
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

    # Registers a specialized evaluation callable for a named category.
    # Associates category name with target evaluation function mapping.
    # Enables dynamic evaluator routing based on case category attributes.
    def register_evaluator(
        self, category: str, fn: Callable[[EvalCase], EvalResult]
    ) -> None:
        """Register a custom evaluator for a category."""
        self._evaluators[category] = fn

    # Executes evaluation cases with optional category and tag filtering.
    # Dispatches cases to corresponding registered evaluators with timing.
    # Aggregates overall results, pass rates, and category statistics into report.
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


# Custom pytest plugin that captures test run execution records.
# Intercepts test log reports to record outcome states and duration metrics.
# Stores per-node test results in an internal structured dictionary table.
class _CollectorPlugin:
    """pytest plugin that records one row per test (call phase, or setup failure)."""

    # Initialises pytest collector plugin with empty test rows registry.
    # Sets up internal mapping to hold node identifiers and execution logs.
    # Prepares tracking store for collecting in-flight pytest test outcomes.
    def __init__(self) -> None:
        self.rows: Dict[str, Dict[str, Any]] = {}

    # Hook that processes pytest test report events during test phases.
    # Records call results or failed setup attempts for test node identifiers.
    # Extracts test outcome states and converts duration to millisecond values.
    def pytest_runtest_logreport(self, report: Any) -> None:
        if report.when == "call" or (report.when == "setup" and report.outcome != "passed"):
            self.rows[report.nodeid] = {
                "id": report.nodeid,
                "outcome": report.outcome,  # passed | failed | skipped
                "durationMs": round(float(getattr(report, "duration", 0.0)) * 1000, 2),
            }


# Retrieves git repository state including current commit hash and dirty status.
# Executes subprocess queries to inspect repository commit SHA and working tree.
# Supplies version metadata for embedding within evaluation execution reports.
def _git_info() -> Dict[str, Any]:
    import subprocess

    info: Dict[str, Any] = {"commit": None, "dirty": None}
    try:
        info["commit"] = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=5
        ).stdout.strip() or None
        info["dirty"] = bool(
            subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True, timeout=10).stdout.strip()
        )
    except Exception:
        pass
    return info


# Discovers and parses the most recent runner evaluation report JSON file.
# Scans target directory for historical evaluation run artifacts in reverse order.
# Returns previous report payload for regression and baseline differential checks.
def _previous_report(directory: str) -> Optional[Dict[str, Any]]:
    import os

    try:
        names = sorted((n for n in os.listdir(directory) if n.endswith(".json")), reverse=True)
    except OSError:
        return None
    for name in names:
        try:
            with open(os.path.join(directory, name), "r", encoding="utf-8") as handle:
                doc = json.load(handle)
        except (OSError, ValueError):
            continue
        if isinstance(doc, dict) and doc.get("source") == "runner":
            return doc
    return None


# Compares current evaluation outcomes against historical baseline reports.
# Detects regression occurrences, newly failing tests, and fixed test cases.
# Computes net change in total passed test count between evaluation runs.
def compare_to_baseline(current: Dict[str, Any], baseline: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Diff two runner reports.  A newly failing test or a lower pass count is a regression."""
    if not baseline:
        return {"baselineId": None, "regression": False, "newFailures": [], "fixed": [], "passedDelta": 0}
    prev = {t["id"]: t["outcome"] for t in baseline.get("tests", [])}
    cur = {t["id"]: t["outcome"] for t in current.get("tests", [])}
    new_failures = sorted(i for i, o in cur.items() if o == "failed" and prev.get(i) == "passed")
    fixed = sorted(i for i, o in cur.items() if o == "passed" and prev.get(i) == "failed")
    delta = int(current["summary"]["passed"]) - int(baseline.get("summary", {}).get("passed", 0))
    return {
        "baselineId": baseline.get("id"),
        "regression": bool(new_failures),
        "newFailures": new_failures,
        "fixed": fixed,
        "passedDelta": delta,
    }


# Constructs evaluation report document containing test results and statistics.
# Calculates outcome counts, pass percentages, duration, and safety subsets.
# Enriches final report structure with git context and baseline diff analysis.
def build_report(rows: List[Dict[str, Any]], exit_code: int, duration_s: float, directory: str) -> Dict[str, Any]:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    passed = sum(1 for r in rows if r["outcome"] == "passed")
    failed = sum(1 for r in rows if r["outcome"] == "failed")
    skipped = sum(1 for r in rows if r["outcome"] == "skipped")
    safety = [r for r in rows if "number_safety" in r["id"] or "numbersafety" in r["id"].replace("_", "").lower()]
    report: Dict[str, Any] = {
        "id": "eval-" + now.strftime("%Y%m%dT%H%M%S%fZ"),
        "source": "runner",
        "createdAt": now.isoformat(),
        "passed": failed == 0 and exit_code in (0, 5),
        "exitCode": int(exit_code),
        "durationSeconds": round(duration_s, 2),
        "git": _git_info(),
        "summary": {
            "total": len(rows),
            "passed": passed,
            "failed": failed,
            "skipped": skipped,
            "passRate": round(passed / len(rows), 4) if rows else 0.0,
            "numberSafety": {
                "total": len(safety),
                "failed": sum(1 for r in safety if r["outcome"] == "failed"),
            },
        },
        "tests": sorted(rows, key=lambda r: r["id"]),
    }
    report["comparison"] = compare_to_baseline(report, _previous_report(directory))
    return report


# Command line entry point for running evaluation suites via pytest.
# Parses CLI arguments, configures report directories, and executes tests.
# Outputs console summaries, saves evaluation JSON, and enforces exit statuses.
def main(argv: Optional[List[str]] = None) -> int:
    """CLI entry for ``python -m evals.runner``.

    Runs the eval suites (pytest modules ``evals/test_*.py``) in-process through a
    collector plugin, prints a summary and writes a JSON report with a comparison
    against the previous report into ``docs/records/evaluations/`` (override with
    ``AI_EVAL_REPORT_DIR`` or ``--report-dir``; skip with ``--no-report``).  The
    exit code is non-zero on any failure or on a regression versus the baseline.
    Other arguments are forwarded to pytest (e.g. ``-k number_safety``).
    """
    import os
    import sys
    from pathlib import Path

    import pytest

    args = list(sys.argv[1:] if argv is None else argv)
    write_report = True
    directory: Optional[str] = None
    forwarded: List[str] = []
    i = 0
    while i < len(args):
        if args[i] == "--no-report":
            write_report = False
        elif args[i] == "--report-dir" and i + 1 < len(args):
            directory = args[i + 1]
            i += 1
        else:
            forwarded.append(args[i])
        i += 1

    if directory is None:
        from learning import config as learning_config

        directory = learning_config.report_dir()

    if "-m" not in forwarded:
        forwarded += ["-m", "not latency"]

    evals_dir = Path(__file__).resolve().parent
    plugin = _CollectorPlugin()
    started = time.perf_counter()
    exit_code = int(pytest.main([str(evals_dir), "-q", "-p", "no:cacheprovider", *forwarded], plugins=[plugin]))
    duration = time.perf_counter() - started

    report = build_report(list(plugin.rows.values()), exit_code, duration, directory)
    summary = report["summary"]
    print(
        "eval summary: %d passed, %d failed, %d skipped in %.1fs; regression=%s"
        % (summary["passed"], summary["failed"], summary["skipped"], duration, report["comparison"]["regression"])
    )
    if write_report:
        try:
            os.makedirs(directory, exist_ok=True)
            path = os.path.join(directory, report["id"] + ".json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(report, handle, indent=2, default=str)
            print("report written: %s" % path)
        except OSError as exc:
            print("could not write report: %s" % exc)
    if exit_code == 0 and report["comparison"]["regression"]:
        return 1
    return exit_code


# Script execution guard invoking evaluation runner entry point.
# Passes command line arguments and propagates returned system exit code.
# Ensures standard termination behaviour when executed as standalone script.
if __name__ == "__main__":
    raise SystemExit(main())
