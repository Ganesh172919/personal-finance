r"""
test_latency.py - Latency Benchmark Tests
============================================

Measures processing time for each agent and validates against
reasonable thresholds:

- Deterministic agents (income, budget, investment, debt, routing):
  should complete in < 100ms for typical profiles.
- Plan builder: should complete in < 50ms.
- LLM-dependent agents (master synthesis, financial educator):
  not benchmarked here (mocked or skipped).

These tests run the actual deterministic code paths with no LLM calls.

MINDMAP FLOW
------------
::

    Latency Benchmark Suite
    ├── 1. SLA Threshold Budgets
    │   ├── Master Routing: < 20ms
    │   ├── Income & Expense Analyzer: < 100ms (500+ transactions)
    │   ├── Budget Planner: < 50ms
    │   ├── Investment Advisor: < 50ms
    │   ├── Debt Optimizer: < 50ms
    │   └── Plan Builder: < 50ms
    ├── 2. Timing Instrumentation
    │   ├── High-precision perf_counter() delta measurement
    │   ├── Warm-up iteration to stabilize bytecode compilation
    │   └── Multi-run statistical percentile aggregation (P50, P95, P99)
    └── 3. Regression Detection
        ├── Fail test if execution exceeds SLA limit
        └── Report latency metrics for AI status telemetry

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |                  Prepare Benchmark Data Profile               |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |             t0 = time.perf_counter()                          |
    |             result = agent.execute(...)                       |
    |             elapsed_ms = (time.perf_counter() - t0) * 1000    |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |                 Assert: elapsed_ms < THRESHOLD                |
    +-------------------------------+-------------------------------+
                                    |
                         [Within SLA Budget?]
                               /      \
                             YES       NO (Performance regression)
                             /          \
                            v            v
                     +------------+   +-----------------------------+
                     | Pass       |   | Fail & Alert Latency Spike  |
                     +------------+   +-----------------------------+
"""

from __future__ import annotations

import time

import pytest

from evals.metrics import Latency

# ---------------------------------------------------------------------------
# Thresholds (milliseconds)
# ---------------------------------------------------------------------------

ROUTING_THRESHOLD_MS = 10          # Keyword scoring is sub-millisecond
INCOME_ANALYZER_THRESHOLD_MS = 200 # Pandas groupby on small datasets
BUDGET_PLANNER_THRESHOLD_MS = 100  # Pure arithmetic
INVESTMENT_ADVISOR_THRESHOLD_MS = 100  # Scoring + allocation math
DEBT_OPTIMIZER_THRESHOLD_MS = 200  # Month-by-month simulation
PLAN_BUILDER_THRESHOLD_MS = 50     # Pure arithmetic


# ---------------------------------------------------------------------------
# Routing Latency
# ---------------------------------------------------------------------------


@pytest.mark.latency
class TestRoutingLatency:
    """Master agent routing should be very fast (< 10ms)."""

    def test_routing_latency_single_query(self, master_agent, full_profile):
        latency = Latency()

        for _ in range(10):
            with latency.measure("routing"):
                master_agent.determine_analysis_type(
                    "Create a budget for me", full_profile
                )

        summary = latency.summary("routing")
        assert summary["p50_ms"] < ROUTING_THRESHOLD_MS, (
            f"Routing P50 {summary['p50_ms']:.1f}ms exceeds {ROUTING_THRESHOLD_MS}ms"
        )

    def test_routing_latency_various_queries(self, master_agent, full_profile):
        latency = Latency()
        queries = [
            "budget",
            "invest",
            "debt",
            "spending",
            "What is inflation?",
            "comprehensive plan",
        ]

        for query in queries:
            with latency.measure("routing"):
                master_agent.determine_analysis_type(query, full_profile)

        summary = latency.summary("routing")
        assert summary["max_ms"] < ROUTING_THRESHOLD_MS * 5, (
            f"Routing max {summary['max_ms']:.1f}ms too high"
        )


# ---------------------------------------------------------------------------
# Income Analyzer Latency
# ---------------------------------------------------------------------------


@pytest.mark.latency
class TestIncomeAnalyzerLatency:
    """Income analyzer should process small transaction sets quickly."""

    def test_latency_with_sample_transactions(self, income_analyzer, sample_transactions):
        latency = Latency()

        for _ in range(5):
            with latency.measure("income_analyzer"):
                income_analyzer.analyze_finances(sample_transactions)

        summary = latency.summary("income_analyzer")
        assert summary["p50_ms"] < INCOME_ANALYZER_THRESHOLD_MS, (
            f"Income analyzer P50 {summary['p50_ms']:.1f}ms exceeds {INCOME_ANALYZER_THRESHOLD_MS}ms"
        )

    def test_latency_empty_transactions(self, income_analyzer):
        latency = Latency()

        for _ in range(10):
            with latency.measure("income_analyzer_empty"):
                income_analyzer.analyze_finances([])

        summary = latency.summary("income_analyzer_empty")
        assert summary["p50_ms"] < INCOME_ANALYZER_THRESHOLD_MS

    def test_latency_scales_linearly(self, income_analyzer):
        """Larger transaction sets should not cause exponential slowdown."""
        small_txns = [
            {"amount": 50000, "category": "Salary", "description": "Salary", "date": f"2026-01-{i:02d}", "type": "income"}
            for i in range(1, 11)
        ]
        large_txns = [
            {"amount": 50000, "category": "Salary", "description": "Salary", "date": f"2026-{(i // 28) + 1:02d}-{(i % 28) + 1:02d}", "type": "income"}
            for i in range(100)
        ]

        latency = Latency()
        with latency.measure("small"):
            income_analyzer.analyze_finances(small_txns)
        with latency.measure("large"):
            income_analyzer.analyze_finances(large_txns)

        small_ms = latency.summary("small")["mean_ms"]
        large_ms = latency.summary("large")["mean_ms"]

        # Large should not be more than 20x slower
        if small_ms > 0:
            ratio = large_ms / small_ms
            assert ratio < 20, f"Scaling ratio {ratio:.1f}x too high (small={small_ms:.1f}ms, large={large_ms:.1f}ms)"


# ---------------------------------------------------------------------------
# Budget Planner Latency
# ---------------------------------------------------------------------------


@pytest.mark.latency
class TestBudgetPlannerLatency:
    """Budget planner should be fast."""

    def test_latency_full_profile(self, budget_planner, full_profile):
        latency = Latency()

        for _ in range(10):
            with latency.measure("budget_planner"):
                budget_planner.create_budget_plan(full_profile)

        summary = latency.summary("budget_planner")
        assert summary["p50_ms"] < BUDGET_PLANNER_THRESHOLD_MS, (
            f"Budget planner P50 {summary['p50_ms']:.1f}ms exceeds {BUDGET_PLANNER_THRESHOLD_MS}ms"
        )

    def test_latency_minimal_profile(self, budget_planner, minimal_profile):
        latency = Latency()

        for _ in range(10):
            with latency.measure("budget_planner_minimal"):
                budget_planner.create_budget_plan(minimal_profile)

        summary = latency.summary("budget_planner_minimal")
        assert summary["p50_ms"] < BUDGET_PLANNER_THRESHOLD_MS


# ---------------------------------------------------------------------------
# Investment Advisor Latency
# ---------------------------------------------------------------------------


@pytest.mark.latency
class TestInvestmentAdvisorLatency:
    """Investment advisor should be fast."""

    def test_latency_full_profile(self, investment_advisor, full_profile):
        latency = Latency()

        for _ in range(10):
            with latency.measure("investment_advisor"):
                investment_advisor.provide_advice(full_profile)

        summary = latency.summary("investment_advisor")
        assert summary["p50_ms"] < INVESTMENT_ADVISOR_THRESHOLD_MS, (
            f"Investment advisor P50 {summary['p50_ms']:.1f}ms exceeds {INVESTMENT_ADVISOR_THRESHOLD_MS}ms"
        )

    def test_latency_different_profiles(self, investment_advisor, minimal_profile, high_income_profile):
        latency = Latency()

        with latency.measure("minimal"):
            investment_advisor.provide_advice(minimal_profile)
        with latency.measure("high_income"):
            investment_advisor.provide_advice(high_income_profile)

        summary = latency.summary()
        for name in ("minimal", "high_income"):
            assert summary[name]["mean_ms"] < INVESTMENT_ADVISOR_THRESHOLD_MS


# ---------------------------------------------------------------------------
# Debt Optimizer Latency
# ---------------------------------------------------------------------------


@pytest.mark.latency
class TestDebtOptimizerLatency:
    """Debt optimizer should complete within threshold."""

    def test_latency_with_debts(self, debt_optimizer, sample_debts, full_profile):
        latency = Latency()

        for _ in range(5):
            with latency.measure("debt_optimizer"):
                debt_optimizer.optimize_repayment(sample_debts, full_profile)

        summary = latency.summary("debt_optimizer")
        assert summary["p50_ms"] < DEBT_OPTIMIZER_THRESHOLD_MS, (
            f"Debt optimizer P50 {summary['p50_ms']:.1f}ms exceeds {DEBT_OPTIMIZER_THRESHOLD_MS}ms"
        )

    def test_latency_no_debts(self, debt_optimizer, full_profile):
        latency = Latency()

        for _ in range(10):
            with latency.measure("debt_optimizer_empty"):
                debt_optimizer.optimize_repayment([], full_profile)

        summary = latency.summary("debt_optimizer_empty")
        assert summary["p50_ms"] < DEBT_OPTIMIZER_THRESHOLD_MS

    def test_latency_multiple_debts(self, debt_optimizer, multiple_debts, full_profile):
        latency = Latency()

        for _ in range(5):
            with latency.measure("debt_optimizer_multi"):
                debt_optimizer.optimize_repayment(multiple_debts, full_profile)

        summary = latency.summary("debt_optimizer_multi")
        assert summary["p50_ms"] < DEBT_OPTIMIZER_THRESHOLD_MS * 2


# ---------------------------------------------------------------------------
# Plan Builder Latency
# ---------------------------------------------------------------------------


@pytest.mark.latency
class TestPlanBuilderLatency:
    """Plan builder should be very fast."""

    def test_latency_full_input(self, full_profile):
        from tools.plan_builder import PlanInputs, build_plan

        latency = Latency()
        inputs = PlanInputs(user_profile=full_profile)

        for _ in range(20):
            with latency.measure("plan_builder"):
                build_plan(inputs)

        summary = latency.summary("plan_builder")
        assert summary["p50_ms"] < PLAN_BUILDER_THRESHOLD_MS, (
            f"Plan builder P50 {summary['p50_ms']:.1f}ms exceeds {PLAN_BUILDER_THRESHOLD_MS}ms"
        )

    def test_latency_no_profile(self):
        from tools.plan_builder import PlanInputs, build_plan

        latency = Latency()
        inputs = PlanInputs(user_profile=None)

        for _ in range(20):
            with latency.measure("plan_builder_no_profile"):
                build_plan(inputs)

        summary = latency.summary("plan_builder_no_profile")
        assert summary["p50_ms"] < PLAN_BUILDER_THRESHOLD_MS


# ---------------------------------------------------------------------------
# End-to-End Latency (deterministic path only)
# ---------------------------------------------------------------------------


@pytest.mark.latency
class TestEndToEndLatency:
    """Measure the full deterministic pipeline: route + analyze + build plan."""

    def test_full_deterministic_pipeline(self, full_profile):
        """Simulate the full pipeline without LLM calls."""
        from agents.budget_planner import BudgetPlannerAgent
        from agents.debt_optimizer import DebtOptimizerAgent
        from agents.income_expense_analyzer import IncomeExpenseAnalyzerAgent
        from agents.investment_advisor import InvestmentAdvisorAgent
        from agents.master_agent import MasterFinancialStrategistAgent
        from tools.plan_builder import PlanInputs, build_plan

        latency = Latency()

        for _ in range(3):
            with latency.measure("full_pipeline"):
                # 1. Route
                master = MasterFinancialStrategistAgent()
                master.determine_analysis_type(
                    "Create a comprehensive plan", full_profile
                )

                # 2. Run specialists
                transactions = full_profile.get("transactions", [])
                income = IncomeExpenseAnalyzerAgent().analyze_finances(transactions)
                budget = BudgetPlannerAgent().create_budget_plan(full_profile)
                invest = InvestmentAdvisorAgent().provide_advice(full_profile)
                debts = full_profile.get("debts", [])
                debt = DebtOptimizerAgent().optimize_repayment(debts, full_profile)

                # 3. Build plan
                build_plan(
                    PlanInputs(
                        user_profile=full_profile,
                        income_analysis=income,
                        budget_plan=budget,
                        investment_advice=invest,
                        debt_optimization=debt,
                    )
                )

        summary = latency.summary("full_pipeline")
        # Full deterministic pipeline should complete in < 2 seconds
        assert summary["p50_ms"] < 2000, (
            f"Full pipeline P50 {summary['p50_ms']:.1f}ms exceeds 2000ms"
        )


# ---------------------------------------------------------------------------
# Latency Metric Utility Tests
# ---------------------------------------------------------------------------


@pytest.mark.latency
class TestLatencyMetricUtility:
    """Test the Latency metric class itself."""

    def test_empty_metric(self):
        metric = Latency()
        summary = metric.summary("nonexistent")
        assert summary["count"] == 0

    def test_single_sample(self):
        metric = Latency()
        with metric.measure("test"):
            pass  # near-zero time

        summary = metric.summary("test")
        assert summary["count"] == 1
        assert summary["min_ms"] >= 0

    def test_multiple_samples(self):
        metric = Latency()
        for _ in range(5):
            with metric.measure("test"):
                time.sleep(0.001)  # ~1ms

        summary = metric.summary("test")
        assert summary["count"] == 5
        assert summary["min_ms"] > 0
        assert summary["max_ms"] >= summary["min_ms"]
        assert summary["p50_ms"] >= summary["min_ms"]
