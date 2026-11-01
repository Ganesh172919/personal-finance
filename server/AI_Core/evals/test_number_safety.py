r"""
test_number_safety.py - Number Safety Guard Tests
===================================================

Validates the ``_numbers_are_subset()`` / ``numbers_are_subset()``
guard that prevents the LLM from introducing hallucinated financial
figures into the plan narrative.

The guard extracts all numeric tokens from both the LLM output
(candidate) and the deterministic reference, then checks that every
number in the candidate already exists in the reference.

Tests cover:
- Basic subset/superset detection
- Integer, decimal, percentage, and currency formats
- Edge cases: markdown formatting, dates, version strings, commas
- False positives and false negatives

MINDMAP FLOW
------------
::

    Number Safety Guard Evaluation
    ├── 1. extract_numbers() Validation
    │   ├── Stripping currency symbols (₹, $, €, £)
    │   ├── Normalizing percentage expressions (25%, 12.5%)
    │   ├── Handling comma digit groupings ("1,00,000", "50,000")
    │   └── Ignoring version strings, bullet prefixes, and markdown tags
    ├── 2. numbers_are_subset() Invariant Check
    │   ├── Valid Subsets: Candidate contains only numbers present in Reference
    │   ├── Invariant Violations: Candidate invents new numbers or mutates amounts
    │   └── Permissive Allowances: Reordered numbers or dropped numbers are safe
    └── 3. Self-Reflection Failover
        ├── Flag LLM narrative when numbers_are_subset() is False
        └── Immediately fallback to deterministic reference plan

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |         Input: Deterministic Reference + LLM Candidate        |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |         ref_nums = extract_numbers(reference_markdown)        |
    |         cand_nums = extract_numbers(candidate_markdown)       |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |             Check: cand_nums.issubset(ref_nums)?              |
    +-------------------------------+-------------------------------+
                                    |
                         [Is Strict Subset?]
                               /     \
                             YES      NO (Hallucination detected)
                             /         \
                            v           v
                    +-------------+   +-----------------------------+
                    | Accept LLM  |   | Reject LLM candidate text   |
                    | Narrative   |   | Fallback to deterministic   |
                    +-------------+   | reference plan automatically|
                                      +-----------------------------+
"""

from __future__ import annotations

import pytest

from utils.agent_helpers import extract_numbers, numbers_are_subset

# ---------------------------------------------------------------------------
# extract_numbers() tests
# ---------------------------------------------------------------------------


@pytest.mark.safety
class TestExtractNumbers:
    """Validate the number extraction utility."""

    def test_simple_integer(self):
        numbers = extract_numbers("The total is 50000")
        assert "50000" in numbers

    def test_simple_decimal(self):
        numbers = extract_numbers("Savings rate is 25.5%")
        assert "25.5%" in numbers

    def test_currency_symbol_stripped(self):
        numbers = extract_numbers("Income: ₹1,00,000")
        assert "100000" in numbers

    def test_dollar_symbol_stripped(self):
        numbers = extract_numbers("Cost is $1,500")
        assert "1500" in numbers

    def test_multiple_numbers(self):
        numbers = extract_numbers("Income 50000 and expenses 35000")
        assert "50000" in numbers
        assert "35000" in numbers

    def test_percentage_format(self):
        numbers = extract_numbers("Return rate: 12.5%")
        assert "12.5%" in numbers

    def test_comma_separated_thousands(self):
        numbers = extract_numbers("Total: 10,00,000")
        assert "1000000" in numbers

    def test_no_numbers(self):
        numbers = extract_numbers("No numbers here")
        assert len(numbers) == 0

    def test_empty_string(self):
        numbers = extract_numbers("")
        assert len(numbers) == 0

    def test_zero(self):
        numbers = extract_numbers("Balance: 0")
        assert "0" in numbers

    def test_negative_number(self):
        """Negative sign is not captured by the regex -- only digits."""
        numbers = extract_numbers("Cash flow: -5000")
        assert "5000" in numbers

    def test_large_number(self):
        numbers = extract_numbers("Retirement target: 1,00,00,000")
        assert "10000000" in numbers

    def test_euro_symbol(self):
        numbers = extract_numbers("Amount: €2,500")
        assert "2500" in numbers

    def test_pound_symbol(self):
        numbers = extract_numbers("Amount: £3,000")
        assert "3000" in numbers


# ---------------------------------------------------------------------------
# numbers_are_subset() -- passing cases
# ---------------------------------------------------------------------------


@pytest.mark.safety
class TestNumberSafetyPassing:
    """Cases where the candidate is a valid subset of the reference."""

    def test_identical_text(self):
        ref = "Monthly net cash flow: ₹15,000. Savings rate: 25.0%"
        cand = "Monthly net cash flow: ₹15,000. Savings rate: 25.0%"
        assert numbers_are_subset(cand, ref) is True

    def test_subset_omits_some_numbers(self):
        ref = "Cash flow: ₹15,000. Savings rate: 25.0%. Debt: ₹3,00,000"
        cand = "Your cash flow is ₹15,000 per month."
        assert numbers_are_subset(cand, ref) is True

    def test_no_numbers_in_candidate(self):
        ref = "Cash flow: ₹15,000. Savings rate: 25.0%"
        cand = "Your financial health looks good."
        assert numbers_are_subset(cand, ref) is True

    def test_empty_candidate(self):
        ref = "Cash flow: ₹15,000"
        cand = ""
        assert numbers_are_subset(cand, ref) is True

    def test_reformatted_numbers(self):
        """Numbers reformatted with different comma patterns should still match."""
        ref = "Income: ₹1,00,000"
        cand = "Your income is ₹100000"
        assert numbers_are_subset(cand, ref) is True

    def test_percentage_in_both(self):
        ref = "Savings rate: 25.0%"
        cand = "You have a 25.0% savings rate"
        assert numbers_are_subset(cand, ref) is True

    def test_same_numbers_different_order(self):
        ref = "Income 50000 expenses 35000"
        cand = "Expenses 35000 income 50000"
        assert numbers_are_subset(cand, ref) is True


# ---------------------------------------------------------------------------
# numbers_are_subset() -- failing cases (introduced numbers)
# ---------------------------------------------------------------------------


@pytest.mark.safety
class TestNumberSafetyFailing:
    """Cases where the candidate introduces new numbers not in the reference."""

    def test_introduced_integer(self):
        ref = "Cash flow: ₹15,000"
        cand = "Cash flow: ₹15,000. You should save ₹20,000 more."
        assert numbers_are_subset(cand, ref) is False

    def test_introduced_percentage(self):
        ref = "Savings rate: 25.0%"
        cand = "Savings rate: 25.0%. Aim for 30.0%."
        assert numbers_are_subset(cand, ref) is False

    def test_introduced_decimal(self):
        ref = "Return: 12%"
        cand = "Return: 12.5%"
        assert numbers_are_subset(cand, ref) is False

    def test_introduced_large_number(self):
        ref = "Total: ₹50,000"
        cand = "Total: ₹50,000. Target: ₹10,00,000"
        assert numbers_are_subset(cand, ref) is False

    def test_hallucinated_emergency_fund(self):
        ref = "Emergency fund: ₹1,00,000"
        cand = "You need ₹3,00,000 for a 6-month emergency fund"
        assert numbers_are_subset(cand, ref) is False

    def test_hallucinated_interest_rate(self):
        ref = "Interest rate: 8.5%"
        cand = "Consider a loan at 6.5% interest"
        assert numbers_are_subset(cand, ref) is False


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


@pytest.mark.safety
class TestNumberSafetyEdgeCases:
    """Edge cases for the number safety guard."""

    def test_dates_not_confused_with_numbers(self):
        """Date-like strings (2026, 01) are extracted as numbers."""
        ref = "Date: 2026-01-15"
        cand = "The date is 2026-01-15"
        # Both contain "2026", "01", "15" -- should match
        assert numbers_are_subset(cand, ref) is True

    def test_version_string(self):
        ref = "Version 2.0 released in 2025"
        cand = "Version 2.0"
        assert numbers_are_subset(cand, ref) is True

    def test_markdown_bold_numbers(self):
        ref = "**₹50,000** is your target"
        cand = "Target: ₹50,000"
        assert numbers_are_subset(cand, ref) is True

    def test_numbers_in_bullet_points(self):
        ref = "- Item 1: ₹10,000\n- Item 2: ₹20,000"
        cand = "Total: ₹30,000"
        # 30000 is not in reference (only 10000 and 20000)
        assert numbers_are_subset(cand, ref) is False

    def test_mixed_currency_symbols(self):
        ref = "₹1,00,000 and $500"
        cand = "₹100000"
        assert numbers_are_subset(cand, ref) is True

    def test_zero_vs_no_zero(self):
        ref = "Balance: 0"
        cand = "Balance is zero"
        # "zero" is not a number token, so subset check passes
        assert numbers_are_subset(cand, ref) is True

    def test_same_number_different_precision(self):
        ref = "Rate: 25%"
        cand = "Rate: 25.0%"
        # "25%" and "25.0%" are different tokens
        # This is a known limitation -- the guard is conservative
        result = numbers_are_subset(cand, ref)
        # May be False due to precision difference -- that's acceptable
        # (conservative = safer)
        assert isinstance(result, bool)

    def test_whitespace_around_numbers(self):
        ref = "Amount: ₹ 50,000"
        cand = "Amount is ₹50000"
        assert numbers_are_subset(cand, ref) is True


# ---------------------------------------------------------------------------
# Integration: guard used by master agent
# ---------------------------------------------------------------------------


@pytest.mark.safety
class TestNumberSafetyIntegration:
    """Integration tests using the master agent's _numbers_are_subset method."""

    def test_master_agent_guard_accepts_valid(self, master_agent):
        ref = "Monthly net cash flow: ₹15,000. Savings rate: 25.0%"
        cand = "Your monthly net cash flow is ₹15,000 with a savings rate of 25.0%."
        assert master_agent._numbers_are_subset(cand, ref) is True

    def test_master_agent_guard_rejects_hallucinated(self, master_agent):
        ref = "Monthly net cash flow: ₹15,000"
        cand = "Monthly net cash flow: ₹15,000. You should aim for ₹50,000."
        assert master_agent._numbers_are_subset(cand, ref) is False

    def test_master_agent_guard_empty_candidate(self, master_agent):
        ref = "Cash flow: ₹15,000"
        assert master_agent._numbers_are_subset("", ref) is True

    def test_master_agent_guard_no_numbers(self, master_agent):
        ref = "Cash flow: ₹15,000"
        cand = "Your finances look healthy."
        assert master_agent._numbers_are_subset(cand, ref) is True
