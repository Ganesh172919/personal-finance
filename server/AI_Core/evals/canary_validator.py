r"""
canary_validator.py - Continuous Production Canary Validation Engine
====================================================================

Continuously validates mathematical invariance and number safety across
both live agent outputs and scheduled/on-demand synthetic canary probes.

Mathematical Invariants Enforced:
1. Number Safety Guard:
   Candidate Digits \subseteq Reference Digits
   Zero hallucinated numeric tokens, altered APRs, or fabricated monetary figures.

2. Zero-Sum Budget Rebalancing Conservation:
   \sum \Delta B_i = 0
   Any category reallocation must conserve the total budget pool without leakage.

3. Non-Negative Allocations:
   \forall i, B_i \ge 0
   Budget envelopes cannot be assigned negative funding.

4. Balance Sheet Conservation:
   \text{Total Assets} - \text{Total Liabilities} = \text{Net Worth} \pm \epsilon

5. Cash Flow Conservation:
   \text{Total Income} - \text{Total Expenses} = \text{Net Cash Flow} \pm \epsilon

6. Debt Amortization Invariance:
   \text{Monthly Payment} = \text{Principal Paid} + \text{Interest Paid} \pm \epsilon

Architecture:
- Thread-safe singleton ``production_canary_engine`` with rolling event telemetry.
- Live inference validation hooks (e.g., in ``AggregatorAgent``).
- Synthetic canary probe catalog for continuous automated self-testing.
- Real-time health metrics: pass rate %, status ("healthy", "warning", "critical"),
  invariant breakdowns, and rolling audit trail.
"""

from __future__ import annotations

import collections
import datetime
import enum
import logging
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from utils.agent_helpers import extract_numbers

logger = logging.getLogger("finwise.ai_core.canary_validator")


# Enumerates mathematical invariant categories evaluated across financial reasoning outputs.
# Classifies number safety, zero-sum rebalancing, balance sheets, and cash flow conservation.
# Enforces domain-specific financial consistency boundaries across all agent models.
class CanaryInvariantType(str, enum.Enum):
    """Categorical classification of mathematical invariants."""

    NUMBER_SUBSET = "number_subset"
    ZERO_SUM_REALLOCATION = "zero_sum_reallocation"
    NON_NEGATIVE_ALLOCATIONS = "non_negative_allocations"
    BALANCE_SHEET_CONSERVATION = "balance_sheet_conservation"
    CASHFLOW_CONSERVATION = "cashflow_conservation"
    DEBT_AMORTIZATION = "debt_amortization"


# Data container recording telemetry from an individual invariant verification check.
# Stores probe identity, execution duration in milliseconds, pass status, and violation details.
# Facilitates structured logging and auditing across synthetic probes and live runs.
@dataclass
class CanaryCheckResult:
    """Result of a single canary invariant verification."""

    probe_id: str
    timestamp: str
    invariant: str
    source: str  # live_inference, synthetic_probe, api_validation, aggregator
    passed: bool
    duration_ms: float
    details: Dict[str, Any] = field(default_factory=dict)
    violations: List[str] = field(default_factory=list)

    # Serializes the canary check result dataclass instance into a standard dictionary.
    # Prepares verification records for JSON transport, database persistence, and audits.
    # Preserves nested violation lists and diagnostic metadata fields cleanly.
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# Aggregates overall health status, pass rates, and category statistics across canary evaluations.
# Provides serializable metrics and audit trails for observability dashboards and APIs.
# Enables automated alerting when invariant pass rates degrade below production thresholds.
@dataclass
class CanaryHealthSummary:
    """Consolidated canary telemetry and invariant health status."""

    status: str  # healthy, warning, critical
    total_evaluations: int
    passed_evaluations: int
    failed_evaluations: int
    pass_rate_pct: float
    last_evaluated_at: Optional[str]
    by_invariant: Dict[str, Dict[str, Any]]
    by_source: Dict[str, Dict[str, Any]]
    recent_events: List[Dict[str, Any]]

    # Serializes the aggregated canary health summary dataclass into a dictionary format.
    # Facilitates transmission across management APIs and platform observability hubs.
    # Formats invariant breakdown rates and recent event trails for dashboard rendering.
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Pure Invariant Verification Functions
# ---------------------------------------------------------------------------


# Verifies that candidate numeric tokens represent a strict subset of reference numerical values.
# Detects and flags any hallucinated monetary figures, interest rates, or percentages.
# Returns comprehensive violation descriptions and number token breakdowns for audits.
def verify_number_subset(
    candidate: str,
    reference: str,
) -> Tuple[bool, List[str], Dict[str, Any]]:
    r"""Verify that every numeric token in candidate exists in reference.

    Enforces Candidate Digits \subseteq Reference Digits.
    """
    candidate_tokens = extract_numbers(candidate or "")
    reference_tokens = extract_numbers(reference or "")
    introduced = candidate_tokens - reference_tokens

    details = {
        "candidate_numbers": sorted(candidate_tokens),
        "reference_numbers": sorted(reference_tokens),
        "introduced_numbers": sorted(introduced),
        "total_candidate": len(candidate_tokens),
        "total_reference": len(reference_tokens),
    }

    if introduced:
        violations = [
            f"Hallucinated numeric tokens detected: {sorted(introduced)}"
        ]
        return False, violations, details

    return True, [], details


# Confirms that proposed budget reallocation adjustments conserve the total available pool.
# Asserts that delta sums equal zero within tolerance and prohibits negative category balances.
# Prevents artificial budget inflation or phantom currency leaks during rebalancing.
def verify_zero_sum_reallocation(
    initial_allocations: Dict[str, float],
    proposed_allocations: Dict[str, float],
    tolerance: float = 1e-4,
) -> Tuple[bool, List[str], Dict[str, Any]]:
    r"""Verify that proposed allocations conserve the total budget pool: \sum \Delta B_i = 0.

    Also asserts non-negative envelope allocations: \forall i, B'_i \ge 0.
    """
    violations: List[str] = []
    all_categories = sorted(set(initial_allocations.keys()) | set(proposed_allocations.keys()))

    deltas: Dict[str, float] = {}
    sum_deltas = 0.0

    for cat in all_categories:
        init_val = float(initial_allocations.get(cat, 0.0))
        prop_val = float(proposed_allocations.get(cat, 0.0))

        if prop_val < -tolerance:
            violations.append(f"Negative allocation detected for category '{cat}': {prop_val:.2f}")

        delta = prop_val - init_val
        deltas[cat] = round(delta, 4)
        sum_deltas += delta

    sum_deltas = round(sum_deltas, 4)
    details = {
        "deltas": deltas,
        "sum_deltas": sum_deltas,
        "initial_total": round(sum(initial_allocations.values()), 4),
        "proposed_total": round(sum(proposed_allocations.values()), 4),
        "tolerance": tolerance,
    }

    if abs(sum_deltas) > tolerance:
        violations.append(
            f"Budget pool conservation broken: total delta is {sum_deltas:+.2f} (expected 0.00)"
        )

    return len(violations) == 0, violations, details


# Validates the fundamental balance sheet accounting identity of assets minus liabilities.
# Ensures calculated net worth aligns with reported figures within the specified tolerance.
# Flags discrepancies between reported net worth and computed balance sheet totals.
def verify_balance_sheet(
    assets: float,
    liabilities: float,
    net_worth: float,
    tolerance: float = 0.05,
) -> Tuple[bool, List[str], Dict[str, Any]]:
    """Verify Assets - Liabilities = Net Worth."""
    computed_net_worth = round(float(assets) - float(liabilities), 2)
    provided_net_worth = round(float(net_worth), 2)
    diff = round(abs(computed_net_worth - provided_net_worth), 2)

    details = {
        "assets": assets,
        "liabilities": liabilities,
        "computed_net_worth": computed_net_worth,
        "provided_net_worth": provided_net_worth,
        "diff": diff,
    }

    if diff > tolerance:
        violations = [
            f"Balance sheet conservation broken: Assets ({assets:.2f}) - Liabilities ({liabilities:.2f}) = "
            f"{computed_net_worth:.2f}, but got Net Worth {provided_net_worth:.2f} (delta {diff:.2f})"
        ]
        return False, violations, details

    return True, [], details


# Asserts cash flow conservation by verifying that total income minus total expenses equals net flow.
# Flags discrepancies exceeding the allowable monetary tolerance as invariant violations.
# Protects the integrity of fundamental monthly cash flow calculations in advice plans.
def verify_cashflow(
    income: float,
    expenses: float,
    net_cashflow: float,
    tolerance: float = 0.05,
) -> Tuple[bool, List[str], Dict[str, Any]]:
    """Verify Income - Expenses = Net Cash Flow."""
    computed_flow = round(float(income) - float(expenses), 2)
    provided_flow = round(float(net_cashflow), 2)
    diff = round(abs(computed_flow - provided_flow), 2)

    details = {
        "income": income,
        "expenses": expenses,
        "computed_net_cashflow": computed_flow,
        "provided_net_cashflow": provided_flow,
        "diff": diff,
    }

    if diff > tolerance:
        violations = [
            f"Cash flow conservation broken: Income ({income:.2f}) - Expenses ({expenses:.2f}) = "
            f"{computed_flow:.2f}, but got Net Cash Flow {provided_flow:.2f} (delta {diff:.2f})"
        ]
        return False, violations, details

    return True, [], details


# Verifies debt installment math by asserting total payment equals principal plus interest.
# Validates repayment schedule consistency against allowable rounding tolerances.
# Catches arithmetic errors in debt optimizer schedule projections before display.
def verify_debt_amortization(
    payment: float,
    principal: float,
    interest: float,
    tolerance: float = 0.05,
) -> Tuple[bool, List[str], Dict[str, Any]]:
    """Verify Total Payment = Principal + Interest."""
    computed_sum = round(float(principal) + float(interest), 2)
    provided_payment = round(float(payment), 2)
    diff = round(abs(computed_sum - provided_payment), 2)

    details = {
        "payment": provided_payment,
        "principal": principal,
        "interest": interest,
        "computed_sum": computed_sum,
        "diff": diff,
    }

    if diff > tolerance:
        violations = [
            f"Debt amortization broken: Principal ({principal:.2f}) + Interest ({interest:.2f}) = "
            f"{computed_sum:.2f}, but got Payment {provided_payment:.2f} (delta {diff:.2f})"
        ]
        return False, violations, details

    return True, [], details


# ---------------------------------------------------------------------------
# Synthetic Canary Probes Catalog
# ---------------------------------------------------------------------------

# Catalog of synthetic test probes used for automated mathematical invariant verification.
# Contains both expected-pass baseline scenarios and adversarial failure test cases.
# Powers continuous background canary probing to detect subtle agent drift or regression.
SYNTHETIC_CANARY_PROBES: List[Dict[str, Any]] = [
    {
        "id": "canary-subset-valid-standard",
        "invariant": CanaryInvariantType.NUMBER_SUBSET,
        "description": "Standard monthly cashflow narrative with valid numeric subset",
        "expected_pass": True,
        "payload": {
            "reference": "Monthly income: ₹1,00,000. Expenses: ₹65,000. Net cash flow: ₹35,000. Savings rate: 35.0%.",
            "candidate": "Based on your income of ₹1,00,000 and expenses of ₹65,000, your net cash flow is ₹35,000 with a 35.0% savings rate.",
        },
    },
    {
        "id": "canary-subset-valid-reorder-omission",
        "invariant": CanaryInvariantType.NUMBER_SUBSET,
        "description": "Valid subset with reordered tokens and omitted emergency fund",
        "expected_pass": True,
        "payload": {
            "reference": "Emergency fund: ₹3,00,000. Target SIP: ₹15,000 per month.",
            "candidate": "We recommend allocating ₹15000 into monthly SIP investments.",
        },
    },
    {
        "id": "canary-subset-adversarial-hallucinated-apr",
        "invariant": CanaryInvariantType.NUMBER_SUBSET,
        "description": "Adversarial candidate injecting hallucinated 7.5% loan APR",
        "expected_pass": False,
        "payload": {
            "reference": "Credit card debt: ₹85,000. Minimum payment: ₹5,000.",
            "candidate": "Refinance your ₹85,000 credit card debt at an attractive 7.5% interest rate.",
        },
    },
    {
        "id": "canary-subset-adversarial-phantom-bonus",
        "invariant": CanaryInvariantType.NUMBER_SUBSET,
        "description": "Adversarial candidate introducing phantom ₹50,000 bonus",
        "expected_pass": False,
        "payload": {
            "reference": "Total savings: ₹1,50,000. Monthly surplus: ₹20,000.",
            "candidate": "With your ₹1,50,000 savings and expected ₹50,000 bonus, you can expand runway.",
        },
    },
    {
        "id": "canary-rebalance-valid-zero-sum",
        "invariant": CanaryInvariantType.ZERO_SUM_REALLOCATION,
        "description": "Conservative envelope shift preserving total 50,000 budget",
        "expected_pass": True,
        "payload": {
            "initial": {"Rent": 20000.0, "Dining": 15000.0, "Groceries": 15000.0},
            "proposed": {"Rent": 20000.0, "Dining": 10000.0, "Groceries": 20000.0},
        },
    },
    {
        "id": "canary-rebalance-valid-multi-envelope",
        "invariant": CanaryInvariantType.ZERO_SUM_REALLOCATION,
        "description": "Four-category rebalance shifting dining and shopping into emergency savings",
        "expected_pass": True,
        "payload": {
            "initial": {"Rent": 30000.0, "Dining": 12000.0, "Shopping": 8000.0, "Savings": 10000.0},
            "proposed": {"Rent": 30000.0, "Dining": 8000.0, "Shopping": 4000.0, "Savings": 18000.0},
        },
    },
    {
        "id": "canary-rebalance-adversarial-pool-leak",
        "invariant": CanaryInvariantType.ZERO_SUM_REALLOCATION,
        "description": "Adversarial rebalance where 5,000 budget leaks into thin air",
        "expected_pass": False,
        "payload": {
            "initial": {"Rent": 25000.0, "Utilities": 5000.0, "Discretionary": 10000.0},
            "proposed": {"Rent": 25000.0, "Utilities": 5000.0, "Discretionary": 5000.0},  # sum deltas = -5000
        },
    },
    {
        "id": "canary-rebalance-adversarial-negative-allocation",
        "invariant": CanaryInvariantType.ZERO_SUM_REALLOCATION,
        "description": "Adversarial rebalance with negative envelope allocation",
        "expected_pass": False,
        "payload": {
            "initial": {"Rent": 20000.0, "Dining": 5000.0},
            "proposed": {"Rent": 27000.0, "Dining": -2000.0},
        },
    },
    {
        "id": "canary-balance-sheet-valid",
        "invariant": CanaryInvariantType.BALANCE_SHEET_CONSERVATION,
        "description": "Verified net worth accounting: Assets 450000 - Liabilities 120000 = 330000",
        "expected_pass": True,
        "payload": {"assets": 450000.0, "liabilities": 120000.0, "net_worth": 330000.0},
    },
    {
        "id": "canary-balance-sheet-adversarial-mismatch",
        "invariant": CanaryInvariantType.BALANCE_SHEET_CONSERVATION,
        "description": "Corrupted net worth calculation violating accounting identity",
        "expected_pass": False,
        "payload": {"assets": 450000.0, "liabilities": 120000.0, "net_worth": 390000.0},
    },
    {
        "id": "canary-cashflow-valid",
        "invariant": CanaryInvariantType.CASHFLOW_CONSERVATION,
        "description": "Verified cash flow accounting: Income 80000 - Expenses 52000 = 28000",
        "expected_pass": True,
        "payload": {"income": 80000.0, "expenses": 52000.0, "net_cashflow": 28000.0},
    },
    {
        "id": "canary-debt-amortization-valid",
        "invariant": CanaryInvariantType.DEBT_AMORTIZATION,
        "description": "Verified debt installment: Principal 4200 + Interest 800 = Payment 5000",
        "expected_pass": True,
        "payload": {"payment": 5000.0, "principal": 4200.0, "interest": 800.0},
    },
]


# ---------------------------------------------------------------------------
# Continuous Production Canary Engine Singleton
# ---------------------------------------------------------------------------


# Production canary engine tracking continuous mathematical invariant validation events.
# Evaluates live agent responses and synthetic probe executions with thread safety.
# Maintains rolling audit records, pass rates, and categorization telemetry.
class ProductionCanaryEngine:
    """Thread-safe engine for continuous invariant verification in production.

    Maintains rolling validation event records and telemetry metrics.
    """

    # Initializes the production canary engine with thread-safe locks and circular queues.
    # Configures rolling history capacities and initializes per-invariant telemetry counters.
    # Establishes internal tracking state for continuous runtime health monitoring.
    def __init__(self, max_history: int = 100) -> None:
        self._lock = threading.RLock()
        self._max_history = max_history
        self._recent_events: collections.deque = collections.deque(maxlen=max_history)

        self._total_evaluations: int = 0
        self._passed_evaluations: int = 0
        self._failed_evaluations: int = 0
        self._last_evaluated_at: Optional[str] = None

        self._by_invariant: Dict[str, Dict[str, int]] = {
            inv.value: {"total": 0, "passed": 0, "failed": 0}
            for inv in CanaryInvariantType
        }
        self._by_source: Dict[str, Dict[str, int]] = {}

    # Records a single invariant check result into rolling history and metrics tables.
    # Increments global and per-invariant pass or failure counts under reentrant lock.
    # Dispatches event payloads to background persistence workers asynchronously.
    def _record_result(self, result: CanaryCheckResult) -> None:
        """Internal helper to record a check result into rolling state."""
        with self._lock:
            self._total_evaluations += 1
            if result.passed:
                self._passed_evaluations += 1
            else:
                self._failed_evaluations += 1

            self._last_evaluated_at = result.timestamp
            self._recent_events.appendleft(result.to_dict())

            inv = result.invariant
            if inv not in self._by_invariant:
                self._by_invariant[inv] = {"total": 0, "passed": 0, "failed": 0}
            self._by_invariant[inv]["total"] += 1
            if result.passed:
                self._by_invariant[inv]["passed"] += 1
            else:
                self._by_invariant[inv]["failed"] += 1

            src = result.source
            if src not in self._by_source:
                self._by_source[src] = {"total": 0, "passed": 0, "failed": 0}
            self._by_source[src]["total"] += 1
            if result.passed:
                self._by_source[src]["passed"] += 1
            else:
                self._by_source[src]["failed"] += 1

        # Persist for the self-improvement loop (async, best effort, never raises).
        try:
            from learning.run_store import persist_canary_event

            persist_canary_event(result.to_dict())
        except Exception:  # pragma: no cover - persistence must not affect verification
            pass

    # Evaluates polished candidate text against reference plans for numeric subset safety.
    # Measures verification latency in milliseconds and records result telemetry.
    # Returns structured check records documenting any detected numeric hallucinations.
    def evaluate_candidate_narrative(
        self,
        candidate: str,
        reference: str,
        source: str = "live_inference",
        probe_id: Optional[str] = None,
    ) -> CanaryCheckResult:
        """Evaluate candidate narrative numbers against deterministic reference."""
        t0 = time.perf_counter()
        passed, violations, details = verify_number_subset(candidate, reference)
        duration_ms = (time.perf_counter() - t0) * 1000

        result = CanaryCheckResult(
            probe_id=probe_id or f"canary-subset-{uuid.uuid4().hex[:8]}",
            timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            invariant=CanaryInvariantType.NUMBER_SUBSET.value,
            source=source,
            passed=passed,
            duration_ms=round(duration_ms, 2),
            details=details,
            violations=violations,
        )
        self._record_result(result)
        return result

    # Evaluates budget reallocation recommendations for zero-sum conservation.
    # Checks for negative allocations and pool leaks against allowable tolerances.
    # Appends check results to the engine's rolling telemetry audit log.
    def evaluate_budget_rebalancing(
        self,
        initial_allocations: Dict[str, float],
        proposed_allocations: Dict[str, float],
        source: str = "live_inference",
        probe_id: Optional[str] = None,
    ) -> CanaryCheckResult:
        """Evaluate budget rebalancing for total pool conservation and non-negativity."""
        t0 = time.perf_counter()
        passed, violations, details = verify_zero_sum_reallocation(
            initial_allocations, proposed_allocations
        )
        duration_ms = (time.perf_counter() - t0) * 1000

        result = CanaryCheckResult(
            probe_id=probe_id or f"canary-rebalance-{uuid.uuid4().hex[:8]}",
            timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            invariant=CanaryInvariantType.ZERO_SUM_REALLOCATION.value,
            source=source,
            passed=passed,
            duration_ms=round(duration_ms, 2),
            details=details,
            violations=violations,
        )
        self._record_result(result)
        return result

    # Evaluates balance sheet accounting identities across reported wealth metrics.
    # Verifies assets minus liabilities equals declared net worth within tolerance.
    # Records check results and latency metrics into the canary audit stream.
    def evaluate_balance_sheet(
        self,
        assets: float,
        liabilities: float,
        net_worth: float,
        source: str = "live_inference",
        probe_id: Optional[str] = None,
    ) -> CanaryCheckResult:
        """Evaluate balance sheet equation: Assets - Liabilities = Net Worth."""
        t0 = time.perf_counter()
        passed, violations, details = verify_balance_sheet(assets, liabilities, net_worth)
        duration_ms = (time.perf_counter() - t0) * 1000

        result = CanaryCheckResult(
            probe_id=probe_id or f"canary-bs-{uuid.uuid4().hex[:8]}",
            timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            invariant=CanaryInvariantType.BALANCE_SHEET_CONSERVATION.value,
            source=source,
            passed=passed,
            duration_ms=round(duration_ms, 2),
            details=details,
            violations=violations,
        )
        self._record_result(result)
        return result

    # Evaluates income, expense, and net cash flow consistency across financial outputs.
    # Validates conservation math and flags arithmetic discrepancies exceeding tolerance.
    # Records verification metrics and any observed calculation violations.
    def evaluate_cashflow(
        self,
        income: float,
        expenses: float,
        net_cashflow: float,
        source: str = "live_inference",
        probe_id: Optional[str] = None,
    ) -> CanaryCheckResult:
        """Evaluate cashflow equation: Income - Expenses = Net Cash Flow."""
        t0 = time.perf_counter()
        passed, violations, details = verify_cashflow(income, expenses, net_cashflow)
        duration_ms = (time.perf_counter() - t0) * 1000

        result = CanaryCheckResult(
            probe_id=probe_id or f"canary-cf-{uuid.uuid4().hex[:8]}",
            timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            invariant=CanaryInvariantType.CASHFLOW_CONSERVATION.value,
            source=source,
            passed=passed,
            duration_ms=round(duration_ms, 2),
            details=details,
            violations=violations,
        )
        self._record_result(result)
        return result

    # Executes the synthetic canary probe suite across all defined mathematical invariants.
    # Compares observed check results against expected pass or fail probe definitions.
    # Generates a comprehensive audit summary including pass percentages and elapsed times.
    def run_canary_probe_suite(
        self,
        sample_size: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Execute the synthetic canary probe suite and record telemetry.

        Returns comprehensive execution audit report.
        """
        probes = SYNTHETIC_CANARY_PROBES
        if sample_size and sample_size > 0:
            probes = probes[:sample_size]

        suite_start = time.perf_counter()
        suite_results: List[Dict[str, Any]] = []
        suite_passed = 0
        suite_failed = 0

        for probe in probes:
            probe_id = probe["id"]
            invariant = probe["invariant"]
            expected_pass = probe["expected_pass"]
            payload = probe["payload"]

            check_res: Optional[CanaryCheckResult] = None

            if invariant == CanaryInvariantType.NUMBER_SUBSET:
                check_res = self.evaluate_candidate_narrative(
                    candidate=payload["candidate"],
                    reference=payload["reference"],
                    source="synthetic_probe",
                    probe_id=probe_id,
                )
            elif invariant == CanaryInvariantType.ZERO_SUM_REALLOCATION:
                check_res = self.evaluate_budget_rebalancing(
                    initial_allocations=payload["initial"],
                    proposed_allocations=payload["proposed"],
                    source="synthetic_probe",
                    probe_id=probe_id,
                )
            elif invariant == CanaryInvariantType.BALANCE_SHEET_CONSERVATION:
                check_res = self.evaluate_balance_sheet(
                    assets=payload["assets"],
                    liabilities=payload["liabilities"],
                    net_worth=payload["net_worth"],
                    source="synthetic_probe",
                    probe_id=probe_id,
                )
            elif invariant == CanaryInvariantType.CASHFLOW_CONSERVATION:
                check_res = self.evaluate_cashflow(
                    income=payload["income"],
                    expenses=payload["expenses"],
                    net_cashflow=payload["net_cashflow"],
                    source="synthetic_probe",
                    probe_id=probe_id,
                )
            elif invariant == CanaryInvariantType.DEBT_AMORTIZATION:
                t0 = time.perf_counter()
                passed, violations, details = verify_debt_amortization(
                    payment=payload["payment"],
                    principal=payload["principal"],
                    interest=payload["interest"],
                )
                dur = (time.perf_counter() - t0) * 1000
                check_res = CanaryCheckResult(
                    probe_id=probe_id,
                    timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    invariant=CanaryInvariantType.DEBT_AMORTIZATION.value,
                    source="synthetic_probe",
                    passed=passed,
                    duration_ms=round(dur, 2),
                    details=details,
                    violations=violations,
                )
                self._record_result(check_res)

            if check_res:
                # The canary probe test itself passes if check_res.passed == expected_pass
                probe_successful = (check_res.passed == expected_pass)
                if probe_successful:
                    suite_passed += 1
                else:
                    suite_failed += 1

                suite_results.append({
                    "probe_id": probe_id,
                    "invariant": invariant.value if hasattr(invariant, "value") else str(invariant),
                    "description": probe["description"],
                    "expected_pass": expected_pass,
                    "actual_invariant_passed": check_res.passed,
                    "probe_assertion_passed": probe_successful,
                    "duration_ms": check_res.duration_ms,
                    "violations": check_res.violations,
                })

        total_elapsed_ms = (time.perf_counter() - suite_start) * 1000

        return {
            "suite_name": "production_canary_probe_suite",
            "executed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "total_probes": len(probes),
            "suite_passed": suite_passed,
            "suite_failed": suite_failed,
            "suite_pass_rate_pct": round((suite_passed / len(probes)) * 100, 1) if probes else 0.0,
            "elapsed_ms": round(total_elapsed_ms, 2),
            "results": suite_results,
            "health_summary": self.get_health_status().to_dict(),
        }

    # Calculates consolidated system health status based on rolling validation pass rates.
    # Evaluates performance thresholds to categorize health as healthy, warning, or critical.
    # Formats granular pass statistics broken down by invariant type and data source.
    def get_health_status(self) -> CanaryHealthSummary:
        """Compute aggregate canary health status."""
        with self._lock:
            total = self._total_evaluations
            passed = self._passed_evaluations
            failed = self._failed_evaluations
            pass_rate = round((passed / total) * 100, 1) if total > 0 else 100.0

            if total == 0 or pass_rate >= 99.0:
                status = "healthy"
            elif pass_rate >= 95.0:
                status = "warning"
            else:
                status = "critical"

            # Compute rates per invariant
            by_inv_computed = {}
            for inv_name, counts in self._by_invariant.items():
                t = counts["total"]
                p = counts["passed"]
                f = counts["failed"]
                r = round((p / t) * 100, 1) if t > 0 else 100.0
                by_inv_computed[inv_name] = {
                    "total": t,
                    "passed": p,
                    "failed": f,
                    "pass_rate_pct": r,
                }

            by_src_computed = {}
            for src_name, counts in self._by_source.items():
                t = counts["total"]
                p = counts["passed"]
                f = counts["failed"]
                r = round((p / t) * 100, 1) if t > 0 else 100.0
                by_src_computed[src_name] = {
                    "total": t,
                    "passed": p,
                    "failed": f,
                    "pass_rate_pct": r,
                }

            return CanaryHealthSummary(
                status=status,
                total_evaluations=total,
                passed_evaluations=passed,
                failed_evaluations=failed,
                pass_rate_pct=pass_rate,
                last_evaluated_at=self._last_evaluated_at,
                by_invariant=by_inv_computed,
                by_source=by_src_computed,
                recent_events=list(self._recent_events),
            )

    # Returns a list of the most recent invariant check events from the rolling buffer.
    # Applies thread-safe snapshotting to prevent concurrent modification exceptions.
    # Supports diagnostic inspection and administrative monitoring of canary probes.
    def get_audit_log(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Return the most recent canary evaluation events."""
        with self._lock:
            return list(self._recent_events)[:limit]

    # Resets internal event histories, evaluation counters, and source metrics.
    # Restores clean engine state to support isolated unit and integration testing.
    # Clears rolling deques and reinitializes invariant mapping structures under lock.
    def reset(self) -> None:
        """Reset internal metrics (primarily for test suite isolation)."""
        with self._lock:
            self._recent_events.clear()
            self._total_evaluations = 0
            self._passed_evaluations = 0
            self._failed_evaluations = 0
            self._last_evaluated_at = None
            self._by_invariant = {
                inv.value: {"total": 0, "passed": 0, "failed": 0}
                for inv in CanaryInvariantType
            }
            self._by_source.clear()


# Module-level singleton
# Module-level singleton instance of the production canary validation engine.
# Provides global access for real-time inference checks and background canary tasks.
# Exposes continuous verification capabilities across all API services and agents.
production_canary_engine = ProductionCanaryEngine()
