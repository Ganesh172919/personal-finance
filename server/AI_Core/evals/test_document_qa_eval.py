"""
test_document_qa_eval.py - Automated Invariant Verification for Document Q&A
============================================================================

Tests that Document Q&A evaluation passes 100% on:
1. IRS Form 1040 (Tax Return): Page 2 tax liability extraction with exact page attribution.
2. Vanguard Brokerage Statement: Dividend reinvestment extraction from multi-page statement.
3. Walgreens Scanned Rx Receipt: Prescription co-pay extraction from OCR image text.
4. AWS Vendor Invoice: Net 30 payment terms and total balance extraction.
5. Out-of-Scope Negative Question: Clean rejection without hallucinating non-existent facts.
6. Number Safety Invariant: Any candidate answer containing foreign digits is rejected.
7. Physical Page Attribution Invariance: Invented or incorrect pages are strictly flagged.
"""

from evals.document_qa_evaluator import (
    DocumentQAEvaluator,
    segment_document_pages,
)
from utils.agent_helpers import numbers_are_subset


def test_document_qa_full_suite():
    """Verify that all golden document QA benchmark cases pass with 100% accuracy."""
    evaluator = DocumentQAEvaluator()
    report = evaluator.run_suite()

    assert report["total_cases"] == 5
    assert report["passed_cases"] == 5
    assert report["pass_rate"] == 1.0
    assert report["faithfulness_rate"] == 1.0
    assert report["page_attribution_accuracy"] == 1.0
    assert report["retrieval_hit_rate"] == 1.0


def test_document_qa_physical_page_attribution_invariant():
    """Verify that cited pages strictly match ground-truth physical pages."""
    evaluator = DocumentQAEvaluator()
    for case in evaluator.cases:
        res = evaluator.evaluate_case(case)
        if not case.should_reject:
            assert res.page_attribution_valid is True
            assert res.cited_page == case.expected_physical_page


def test_document_qa_number_safety_invariant():
    """Verify candidate answer numbers are strict subsets of document text."""
    doc_text = "Standard deduction: $14,600.00. Total tax: $13,200.00."

    # 1. Valid answer using exact document numbers
    safe_answer = "Your total tax is $13,200.00 with a $14,600.00 deduction."
    assert numbers_are_subset(safe_answer, doc_text) is True

    # 2. Hallucinated answer introducing foreign numbers
    hallucinated_answer = "Your total tax is $15,500.00 with an 18.5% effective rate."
    assert numbers_are_subset(hallucinated_answer, doc_text) is False


def test_document_qa_segment_document_pages():
    """Verify that form feed \\f correctly partitions physical pages without data loss."""
    multi_page_text = "Page 1 Content\fPage 2 Content\fPage 3 Content"
    pages = segment_document_pages(multi_page_text)

    assert len(pages) == 3
    assert pages[0] == (1, "Page 1 Content")
    assert pages[1] == (2, "Page 2 Content")
    assert pages[2] == (3, "Page 3 Content")


def test_document_qa_negative_case_rejection():
    """Verify that out-of-scope questions are safely rejected without inventing answers."""
    evaluator = DocumentQAEvaluator()
    negative_case = next(c for c in evaluator.cases if c.should_reject)
    res = evaluator.evaluate_case(negative_case)

    assert res.passed is True
    assert res.rejection_handled_correctly is True
    assert "sufficient evidence" in res.direct_answer.lower()
    assert res.cited_page is None
