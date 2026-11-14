"""
test_document_creation_eval.py - Unit & Invariant Tests for Financial Document Creation Evaluator
==================================================================================================
"""

from evals.document_creation_evaluator import (
    GOLDEN_DOCUMENT_CREATION_CASES,
    DocumentCreationEvaluator,
)


def test_suite_execution_and_pass_rate():
    evaluator = DocumentCreationEvaluator()
    report = evaluator.run_suite()

    assert report["total_cases"] == 6
    assert report["passed_cases"] == 6
    assert report["failed_cases"] == 0
    assert report["pass_rate"] == 1.0
    assert report["average_overall_score"] >= 0.90
    assert report["average_invariant_score"] == 1.0
    assert report["average_number_safety_score"] == 1.0


def test_format_compliance_across_all_formats():
    evaluator = DocumentCreationEvaluator()
    for case in GOLDEN_DOCUMENT_CREATION_CASES:
        res = evaluator.run_case(case)
        assert res.passed is True, f"Case {case.case_id} failed: {res.failure_reasons}"
        assert res.format_compliance_score >= 0.90
        assert res.kpis_found >= 2


def test_layout_structure_and_tables():
    evaluator = DocumentCreationEvaluator()
    for case in GOLDEN_DOCUMENT_CREATION_CASES:
        res = evaluator.run_case(case)
        assert res.layout_structure_score >= 0.85
        assert res.tables_found >= 1, f"Case {case.case_id} had no tables"


def test_mathematical_invariants_and_number_safety():
    evaluator = DocumentCreationEvaluator()

    # Net worth balance sheet conservation test
    net_worth_case = next(c for c in GOLDEN_DOCUMENT_CREATION_CASES if c.case_id == "doc_create_05_net_worth_statement")
    res = evaluator.run_case(net_worth_case)
    assert any("balance_sheet_conservation" in inv for inv in res.invariants_passed)
    assert len(res.invariants_failed) == 0

    # Cash flow conservation test
    cash_flow_case = next(c for c in GOLDEN_DOCUMENT_CREATION_CASES if c.case_id == "doc_create_03_cash_flow_audit")
    res_cf = evaluator.run_case(cash_flow_case)
    assert any("cash_flow_conservation" in inv for inv in res_cf.invariants_passed)

    # Debt payment conservation test
    debt_case = next(c for c in GOLDEN_DOCUMENT_CREATION_CASES if c.case_id == "doc_create_04_debt_payoff_schedule")
    res_debt = evaluator.run_case(debt_case)
    assert any("debt_payment_conservation" in inv for inv in res_debt.invariants_passed)


def test_physical_page_pagination_fidelity():
    evaluator = DocumentCreationEvaluator()
    net_worth_case = next(c for c in GOLDEN_DOCUMENT_CREATION_CASES if c.case_id == "doc_create_05_net_worth_statement")
    doc = evaluator.parse_document_structure(net_worth_case.document_text)

    assert doc.page_count == 2
    assert len(doc.pages) == 2
    assert "Balance Sheet Summary" in doc.pages[0]
    assert "Liabilities Schedule" in doc.pages[1]
