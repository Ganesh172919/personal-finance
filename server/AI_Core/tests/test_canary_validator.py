from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api_service import app
from evals.canary_validator import (
    CanaryInvariantType,
    ProductionCanaryEngine,
    production_canary_engine,
    verify_balance_sheet,
    verify_cashflow,
    verify_debt_amortization,
    verify_number_subset,
    verify_zero_sum_reallocation,
)


@pytest.fixture(autouse=True)
def clean_canary_engine():
    """Reset the singleton canary engine before each test."""
    production_canary_engine.reset()
    yield
    production_canary_engine.reset()


# ---------------------------------------------------------------------------
# Invariant Verification Unit Tests
# ---------------------------------------------------------------------------


def test_verify_number_subset_clean_and_permissive():
    reference = "Monthly net cash flow: ₹25,000. Savings rate: 30.0%. Target: $10,000."
    candidate = "Your savings rate is 30.0% with a net cash flow of ₹25000."
    passed, violations, details = verify_number_subset(candidate, reference)
    assert passed is True
    assert violations == []
    assert "25000" in details["candidate_numbers"]
    assert "30.0%" in details["candidate_numbers"]
    assert details["introduced_numbers"] == []


def test_verify_number_subset_catches_hallucinations():
    reference = "Monthly net cash flow: ₹25,000. Savings rate: 30.0%."
    candidate = "Your monthly cash flow is ₹25,000. You should aim for ₹50,000 at 8.5% interest."
    passed, violations, details = verify_number_subset(candidate, reference)
    assert passed is False
    assert len(violations) > 0
    assert "50000" in details["introduced_numbers"]
    assert "8.5%" in details["introduced_numbers"]


def test_verify_zero_sum_reallocation_valid():
    initial = {"Housing": 25000.0, "Food": 15000.0, "Entertainment": 10000.0}
    proposed = {"Housing": 25000.0, "Food": 12000.0, "Entertainment": 13000.0}
    passed, violations, details = verify_zero_sum_reallocation(initial, proposed)
    assert passed is True
    assert violations == []
    assert details["sum_deltas"] == 0.0


def test_verify_zero_sum_reallocation_pool_leak():
    initial = {"Housing": 20000.0, "Dining": 10000.0}
    proposed = {"Housing": 20000.0, "Dining": 7000.0}  # Leaked 3000
    passed, violations, details = verify_zero_sum_reallocation(initial, proposed)
    assert passed is False
    assert any("Budget pool conservation broken" in v for v in violations)
    assert details["sum_deltas"] == -3000.0


def test_verify_zero_sum_reallocation_negative_allocation():
    initial = {"Rent": 20000.0, "Dining": 5000.0}
    proposed = {"Rent": 27000.0, "Dining": -2000.0}
    passed, violations, details = verify_zero_sum_reallocation(initial, proposed)
    assert passed is False
    assert any("Negative allocation detected" in v for v in violations)


def test_verify_balance_sheet_valid_and_invalid():
    # Valid: 500,000 - 150,000 = 350,000
    passed, violations, _ = verify_balance_sheet(500000.0, 150000.0, 350000.0)
    assert passed is True
    assert violations == []

    # Invalid: 500,000 - 150,000 != 400,000
    passed, violations, details = verify_balance_sheet(500000.0, 150000.0, 400000.0)
    assert passed is False
    assert details["diff"] == 50000.0
    assert any("Balance sheet conservation broken" in v for v in violations)


def test_verify_cashflow_valid_and_invalid():
    # Valid: 100,000 - 70,000 = 30,000
    passed, violations, _ = verify_cashflow(100000.0, 70000.0, 30000.0)
    assert passed is True
    assert violations == []

    # Invalid: 100,000 - 70,000 != 35,000
    passed, violations, _ = verify_cashflow(100000.0, 70000.0, 35000.0)
    assert passed is False
    assert any("Cash flow conservation broken" in v for v in violations)


def test_verify_debt_amortization_valid_and_invalid():
    # Valid: 3,500 + 500 = 4,000
    passed, violations, _ = verify_debt_amortization(4000.0, 3500.0, 500.0)
    assert passed is True
    assert violations == []

    # Invalid: 3,500 + 500 != 4,200
    passed, violations, _ = verify_debt_amortization(4200.0, 3500.0, 500.0)
    assert passed is False
    assert any("Debt amortization broken" in v for v in violations)


# ---------------------------------------------------------------------------
# Synthetic Canary Probe Suite Execution Tests
# ---------------------------------------------------------------------------


def test_synthetic_canary_probe_suite_execution():
    report = production_canary_engine.run_canary_probe_suite()
    assert report["total_probes"] > 0
    # Every probe should accurately verify its expected pass/fail assertion
    assert report["suite_failed"] == 0
    assert report["suite_pass_rate_pct"] == 100.0
    assert len(report["results"]) == report["total_probes"]


def test_production_canary_engine_health_and_telemetry():
    engine = ProductionCanaryEngine(max_history=5)
    assert engine.get_health_status().status == "healthy"

    # Evaluate 2 passes and 1 fail
    engine.evaluate_candidate_narrative("Income: ₹50,000", "Income: ₹50,000")
    engine.evaluate_balance_sheet(1000.0, 300.0, 700.0)
    engine.evaluate_candidate_narrative("Income: ₹99,999", "Income: ₹50,000")

    summary = engine.get_health_status()
    assert summary.total_evaluations == 3
    assert summary.passed_evaluations == 2
    assert summary.failed_evaluations == 1
    assert summary.pass_rate_pct == 66.7
    assert summary.status == "critical"  # < 95% is critical

    recent = engine.get_audit_log(limit=10)
    assert len(recent) == 3
    assert recent[0]["passed"] is False  # Most recent is at front


def test_aggregator_live_canary_recording():
    from agents.aggregator import AggregatorAgent

    agg = AggregatorAgent()
    ref = "Monthly net cash flow: ₹20,000. Savings rate: 25.0%"
    cand = "Your net cash flow is ₹20,000 with a 25.0% savings rate."

    is_subset = agg._numbers_are_subset(cand, ref)
    assert is_subset is True

    summary = production_canary_engine.get_health_status()
    assert summary.total_evaluations >= 1
    assert summary.by_invariant[CanaryInvariantType.NUMBER_SUBSET.value]["passed"] >= 1
    assert summary.by_source.get("aggregator_synthesis", {}).get("passed", 0) >= 1


# ---------------------------------------------------------------------------
# FastAPI Canary HTTP Endpoints Integration Tests
# ---------------------------------------------------------------------------


def test_api_service_canary_endpoints():
    with TestClient(app) as client:
        # 1. GET /api/canary/number-safety
        get_res = client.get("/api/canary/number-safety")
        assert get_res.status_code == 200
        data = get_res.json()
        assert data["status"] == "success"
        assert "canary" in data
        assert data["canary"]["status"] in ("healthy", "warning", "critical")

        # 2. POST /api/canary/number-safety/validate (valid)
        val_res = client.post(
            "/api/canary/number-safety/validate",
            json={
                "candidate": "Net cash flow: ₹15000",
                "reference": "Monthly net cash flow: ₹15,000",
                "assets": 100000,
                "liabilities": 20000,
                "net_worth": 80000,
            },
        )
        assert val_res.status_code == 200
        val_data = val_res.json()
        assert val_data["status"] == "success"
        assert val_data["all_passed"] is True
        assert len(val_data["results"]) == 2

        # 3. POST /api/canary/number-safety/validate (with hallucination)
        val_fail = client.post(
            "/api/canary/number-safety/validate",
            json={
                "candidate": "Net cash flow: ₹15000 and bonus ₹99000",
                "reference": "Monthly net cash flow: ₹15,000",
            },
        )
        assert val_fail.status_code == 200
        val_fail_data = val_fail.json()
        assert val_fail_data["all_passed"] is False
        assert val_fail_data["results"][0]["passed"] is False

        # 4. POST /api/canary/number-safety/validate (empty body returns 400)
        val_empty = client.post("/api/canary/number-safety/validate", json={})
        assert val_empty.status_code == 400

        # 5. POST /api/canary/number-safety/run-probes
        probe_res = client.post("/api/canary/number-safety/run-probes", json={"sample_size": 4})
        assert probe_res.status_code == 200
        probe_data = probe_res.json()
        assert probe_data["status"] == "success"
        assert probe_data["report"]["total_probes"] == 4
        assert probe_data["report"]["suite_failed"] == 0


def test_api_service_status_includes_canary():
    with TestClient(app) as client:
        res = client.get("/api/ai/status")
        assert res.status_code == 200
        data = res.json()
        assert "canary" in data
        assert "status" in data["canary"]
        assert "total_evaluations" in data["canary"]
