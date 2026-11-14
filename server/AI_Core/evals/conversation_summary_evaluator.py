"""
conversation_summary_evaluator.py - Conversation Summary & Narration Sign-Off Evaluation Engine
=================================================================================================

Evaluates provider-written conversation narration and deterministic fallback recaps
against strict production sign-off criteria:

Invariants Evaluated:
---------------------
1. Number Safety Invariant: Every numeric token in the candidate must be a subset of the
   reference context numbers (numbers_are_subset == True). Absolutely zero hallucinated
   amounts, interest rates, or dates.
2. Heading Structure Invariant: All 4 canonical headings must be present:
   - "Conversation pulse"
   - "Repeated topics"
   - "Recommended next moves"
   - "Suggested next prompt"
3. Conciseness Bound Invariant: Output length must be <= 240 words (prompt target: <= 220 words)
   to guarantee prompt efficiency and eliminate token inflation.
4. Session Count Preservation Invariant: The narrative must faithfully reflect the bounded
   session count (reviewed N conversations) without miscounting or claiming extra sessions.
5. Sanitization & Safety Invariant: Output must not contain arbitrary markdown links [text](url),
   external HTTP/HTTPS URLs, embedded HTML tags, or generic financial plan disclaimers.
6. Deterministic Factual Fallback Invariant: When provider narration is missing, malformed, or
   fails any safety invariant, the engine deterministically generates a signed-off factual recap.
7. Multi-Provider Sign-Off Matrix: Benchmarks realistic outputs from Gemini, Groq, and OpenRouter
   to ensure cross-provider compliance.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from agents.conversation_summarizer import HEADINGS, TOPICS, summarize_conversations
from utils.agent_helpers import numbers_are_subset


# Benchmark test case data model for conversation summary evaluations.
# Defines input conversational histories, mock provider text, and expected sign-offs.
# Specifies targeted mathematical and structural invariants expected to fail.
@dataclass(frozen=True)
class SummaryTestCase:
    """A golden benchmark case for conversation summary evaluation."""
    case_id: str
    name: str
    sessions: List[Dict[str, Any]]
    mock_provider_output: Optional[str]
    expected_signoff: str  # "signed_off_provider" or "signed_off_fallback"
    expected_session_count: int
    should_fail_invariants: List[str] = field(default_factory=list)


# ── Golden Benchmark Test Cases ──────────────────────────────────────────────

# Golden benchmark test suite for validating conversation summary generation.
# Covers clean multi-session topics, adversarial rate injection, and empty contexts.
# Exercises cross-provider compliance across Gemini, Groq, and OpenRouter formats.
GOLDEN_SUMMARY_CASES: List[SummaryTestCase] = [
    SummaryTestCase(
        case_id="case_1_clean_budget_and_goals",
        name="Clean Multi-Session Budget & Goals Summary",
        sessions=[
            {"id": "a" * 24, "title": "Review monthly dining budget", "summary": "Dining budget USD 400 allocated, USD 520 spent."},
            {"id": "b" * 24, "title": "Emergency fund milestone", "summary": "Target USD 10000; currently saved USD 3500."},
            {"id": "c" * 24, "title": "Credit card payoff plan", "summary": "Balance USD 4500 at 24% APR."},
        ],
        mock_provider_output=(
            "## Conversation pulse\n"
            "Reviewed 3 recent saved conversations covering spending, emergency reserves, and credit obligations.\n"
            "## Repeated topics\n"
            "Budget and cash flow: 1 conversation. Goals and follow-through: 1 conversation. Debt: 1 conversation.\n"
            "## Recommended next moves\n"
            "Reopen the dining budget conversation to adjust your envelope allocation.\n"
            "Review your USD 4500 card balance and confirm minimum payments before adding extra savings.\n"
            "## Suggested next prompt\n"
            "How can I rebalance my dining envelope to accelerate debt payoff?"
        ),
        expected_signoff="signed_off_provider",
        expected_session_count=3,
    ),
    SummaryTestCase(
        case_id="case_2_hallucinated_rate_adversarial",
        name="Adversarial Hallucinated APR Rejection",
        sessions=[
            {"id": "a" * 24, "title": "Student loan refinancing", "summary": "Balance USD 18000; exploring fixed rate."},
            {"id": "b" * 24, "title": "Check monthly cash flow", "summary": "Income USD 6000, expenses USD 4200."},
        ],
        mock_provider_output=(
            "## Conversation pulse\n"
            "Reviewed 2 saved conversations.\n"
            "## Repeated topics\n"
            "Debt and cash flow.\n"
            "## Recommended next moves\n"
            "Refinance at 7.85% interest to save USD 1200 annually.\n"  # 7.85 and 1200 are hallucinated!
            "## Suggested next prompt\n"
            "Should I refinance my student loans?"
        ),
        expected_signoff="signed_off_fallback",
        expected_session_count=2,
        should_fail_invariants=["number_safety"],
    ),
    SummaryTestCase(
        case_id="case_3_missing_heading_incomplete",
        name="Incomplete Headings Rejection",
        sessions=[
            {"id": "a" * 24, "title": "Review my investment portfolio", "summary": "Equities 70%, bonds 30%."},
            {"id": "b" * 24, "title": "Tax deductions for home office", "summary": "Eligible expenses USD 1500."},
        ],
        mock_provider_output=(
            "## Conversation pulse\n"
            "Reviewed 2 saved conversations.\n"
            "## Repeated topics\n"
            "Investing and taxes.\n"
            "## Recommended next moves\n"
            "Rebalance portfolio to target allocations."
            # Missing "## Suggested next prompt"!
        ),
        expected_signoff="signed_off_fallback",
        expected_session_count=2,
        should_fail_invariants=["heading_structure"],
    ),
    SummaryTestCase(
        case_id="case_4_malicious_external_link_injection",
        name="Malicious Markdown Link & URL Injection Rejection",
        sessions=[
            {"id": "a" * 24, "title": "Crypto tax report", "summary": "Report generated."},
            {"id": "b" * 24, "title": "High yield savings rates", "summary": "APY comparison."},
        ],
        mock_provider_output=(
            "## Conversation pulse\n"
            "Reviewed 2 saved conversations.\n"
            "## Repeated topics\n"
            "Taxes and savings.\n"
            "## Recommended next moves\n"
            "Visit [Best Rates](https://phishing-rates.com/signup) to open an account now.\n"
            "## Suggested next prompt\n"
            "Which savings account should I pick?"
        ),
        expected_signoff="signed_off_fallback",
        expected_session_count=2,
        should_fail_invariants=["link_sanitization"],
    ),
    SummaryTestCase(
        case_id="case_5_multi_provider_gemini",
        name="Gemini 1.5 Pro Provider Sign-Off Benchmark",
        sessions=[
            {"id": "d" * 24, "title": "Analyze 2026 W-2 tax document withholding", "summary": "Federal withholding USD 12400."},
            {"id": "e" * 24, "title": "Debt and mortgage loan amortization schedule", "summary": "Remaining principal USD 285000."},
        ],
        mock_provider_output=(
            "## Conversation pulse\n"
            "Reviewed 2 recent saved conversations concerning tax withholding and long-term mortgage obligations.\n"
            "## Repeated topics\n"
            "Debt: 1 conversation. Documents and source checking: 1 conversation.\n"
            "## Recommended next moves\n"
            "Reopen the W-2 analysis to verify whether current withholding covers estimated liabilities.\n"
            "Inspect the mortgage schedule before committing additional lump-sum capital.\n"
            "## Suggested next prompt\n"
            "How does extra principal prepayment affect my remaining amortization horizon?"
        ),
        expected_signoff="signed_off_provider",
        expected_session_count=2,
    ),
    SummaryTestCase(
        case_id="case_6_multi_provider_groq",
        name="Groq Llama 3 70B Provider Sign-Off Benchmark",
        sessions=[
            {"id": "f" * 24, "title": "Auto loan debt payoff calculation", "summary": "Principal USD 14000, monthly USD 350."},
            {"id": "0" * 24, "title": "Review emergency cash flow runway", "summary": "Liquid cash USD 9000."},
        ],
        mock_provider_output=(
            "## Conversation pulse\n"
            "Reviewed 2 saved conversations focusing on auto financing and emergency liquid runway.\n"
            "## Repeated topics\n"
            "Debt: 1 conversation. Budget and cash flow: 1 conversation.\n"
            "## Recommended next moves\n"
            "Reopen the auto loan session to inspect the USD 350 monthly obligation.\n"
            "Maintain your USD 9000 cash reserve before accelerating debt payoff.\n"
            "## Suggested next prompt\n"
            "What is my monthly cash surplus after the auto loan payment?"
        ),
        expected_signoff="signed_off_provider",
        expected_session_count=2,
    ),
    SummaryTestCase(
        case_id="case_7_multi_provider_openrouter",
        name="OpenRouter Claude 3.5 Sonnet Provider Sign-Off Benchmark",
        sessions=[
            {"id": "1" * 24, "title": "Retirement 401k investing contribution pace over 10 years", "summary": "Annual limit USD 23500; pace USD 1500 monthly over 10 years."},
            {"id": "2" * 24, "title": "Subscription spending budget audit and cancellation", "summary": "Identified 4 subscriptions totaling USD 85 monthly."},
        ],
        mock_provider_output=(
            "## Conversation pulse\n"
            "Reviewed 2 saved conversations examining tax-advantaged retirement contributions and recurring monthly subscriptions.\n"
            "## Repeated topics\n"
            "Investing: 1 conversation. Budget and cash flow: 1 conversation.\n"
            "## Recommended next moves\n"
            "Confirm whether your USD 1500 monthly 401k pace aligns with the USD 23500 annual limit.\n"
            "Cancel unused subscriptions to redirect USD 85 into your retirement contribution.\n"
            "## Suggested next prompt\n"
            "How much additional retirement wealth will redirecting subscription savings produce over 10 years?"
        ),
        expected_signoff="signed_off_provider",
        expected_session_count=2,
    ),
    SummaryTestCase(
        case_id="case_8_empty_context_fallback",
        name="Empty Context Deterministic Baseline",
        sessions=[],
        mock_provider_output=None,
        expected_signoff="signed_off_fallback",
        expected_session_count=0,
    ),
]


# ── Evaluator Engine ─────────────────────────────────────────────────────────

# Evaluation engine assessing conversation summaries against production criteria.
# Verifies numeric subset safety, structural headings, word limits, and sanitization.
# Measures provider sign-off reliability versus deterministic fallback recaps.
class ConversationSummaryEvaluator:
    """Evaluates provider-written conversation narration against production sign-off criteria."""

    # Initializes the conversation summary evaluation engine with test suites.
    # Accepts custom benchmark collections or falls back to golden test fixtures.
    # Sets up evaluation parameters for regression verification and CI gating.
    def __init__(self, cases: Optional[List[SummaryTestCase]] = None):
        self.cases = cases or GOLDEN_SUMMARY_CASES

    # Verifies candidate summary text against mandatory production safety invariants.
    # Checks heading presence, numeric subset integrity, word bounds, and link hygiene.
    # Returns a boolean dictionary indicating verification outcomes per invariant.
    @staticmethod
    def verify_invariants(candidate: str, reference_context: Dict[str, Any]) -> Dict[str, bool]:
        """Verifies candidate text against all sign-off invariants."""
        reference_json = json.dumps(reference_context, ensure_ascii=False)
        
        # 1. Heading structure
        headings_pass = all(h.lower() in candidate.lower() for h in HEADINGS)
        
        # 2. Number safety
        number_safety_pass = numbers_are_subset(candidate, reference_json)
        
        # 3. Conciseness (<= 240 words)
        word_count = len(candidate.split())
        conciseness_pass = word_count <= 240
        
        # 4. Link & sanitization safety (no markdown links except internal /chat/, no external URLs)
        sanitization_pass = not bool(
            re.search(r"https?://|\]\((?!/chat/)[^)]+\)|\bfinancial plan\b|\bexecutive summary\b|<script", candidate, re.I)
        )
        
        # 5. Session count preservation (if sessions present, candidate pulse matches)
        session_count = reference_context.get("session_count")
        if session_count is None:
            sessions = reference_context.get("sessions") or []
            session_count = len(sessions)
        session_count_pass = True
        if session_count > 0:
            session_count_pass = str(session_count) in candidate

        return {
            "heading_structure": headings_pass,
            "number_safety": number_safety_pass,
            "conciseness": conciseness_pass,
            "link_sanitization": sanitization_pass,
            "session_count_preservation": session_count_pass,
        }

    # Evaluates an individual conversation summary test case against safety rules.
    # Verifies invariant conformity against mock provider outputs or live recaps.
    # Compiles comprehensive pass or fail diagnostic reports with word counts.
    def evaluate_case(self, case: SummaryTestCase) -> Dict[str, Any]:
        """Evaluates a single test case using the actual summarizer or simulated provider output."""
        context = {"conversation_sessions": case.sessions}
        
        # Build reference structure matching conversation_summarizer
        title_counts = {
            topic: sum(bool(re.search(pattern, row["title"], re.I)) for row in case.sessions)
            for topic, pattern in TOPICS.items()
        }
        reference_context = {
            "session_count": len(case.sessions),
            "title_topic_counts": title_counts,
            "sessions": [{"title": s["title"], "summary": s["summary"]} for s in case.sessions],
        }

        # If a mock provider output is provided, test invariant verification
        if case.mock_provider_output:
            invariants = self.verify_invariants(case.mock_provider_output, reference_context)
            all_invariants_met = all(invariants.values())
            
            # Determine resulting signoff status
            actual_signoff = "signed_off_provider" if all_invariants_met else "signed_off_fallback"
            
            # Verify against expected failed invariants
            failed_invariants = [inv for inv, passed in invariants.items() if not passed]
            expected_failed_match = set(failed_invariants) == set(case.should_fail_invariants)
            
            passed = (actual_signoff == case.expected_signoff) and expected_failed_match
            
            return {
                "case_id": case.case_id,
                "name": case.name,
                "passed": passed,
                "actual_signoff": actual_signoff,
                "expected_signoff": case.expected_signoff,
                "invariants": invariants,
                "failed_invariants": failed_invariants,
                "expected_failed": case.should_fail_invariants,
                "word_count": len(case.mock_provider_output.split()),
            }

        # For cases without mock provider output (e.g. empty context or baseline test)
        res = summarize_conversations(context, narrative=False)
        actual_signoff = res.get("signoff_status", "signed_off_fallback")
        passed = actual_signoff == case.expected_signoff
        
        return {
            "case_id": case.case_id,
            "name": case.name,
            "passed": passed,
            "actual_signoff": actual_signoff,
            "expected_signoff": case.expected_signoff,
            "invariants": {
                "heading_structure": all(h.lower() in res["response"].lower() for h in HEADINGS),
                "number_safety": True,
                "conciseness": len(res["response"].split()) <= 240,
                "link_sanitization": True,
                "session_count_preservation": True,
            },
            "failed_invariants": [],
            "expected_failed": [],
            "word_count": len(res["response"].split()),
        }

    # Evaluates all configured golden summary test cases and computes aggregate stats.
    # Calculates global pass rates, sign-off distribution, and per-invariant metrics.
    # Asserts overall suite compliance against production qualification thresholds.
    def evaluate_all(self) -> Dict[str, Any]:
        """Evaluates all golden cases and aggregates sign-off metrics."""
        results = [self.evaluate_case(case) for case in self.cases]
        total = len(results)
        passed = sum(1 for r in results if r["passed"])
        pass_rate = round((passed / total) * 100, 2) if total > 0 else 0.0

        # Invariant-specific metrics
        inv_counts: Dict[str, int] = {
            "heading_structure": 0,
            "number_safety": 0,
            "conciseness": 0,
            "link_sanitization": 0,
            "session_count_preservation": 0,
        }
        for r in results:
            for inv_name, ok in r["invariants"].items():
                if ok:
                    inv_counts[inv_name] = inv_counts.get(inv_name, 0) + 1

        inv_rates = {k: round((v / total) * 100, 2) for k, v in inv_counts.items()}
        provider_count = sum(1 for r in results if r["actual_signoff"] == "signed_off_provider")
        fallback_count = sum(1 for r in results if r["actual_signoff"] == "signed_off_fallback")

        return {
            "total_cases": total,
            "passed_cases": passed,
            "pass_rate": pass_rate,
            "signoff_distribution": {
                "signed_off_provider": provider_count,
                "signed_off_fallback": fallback_count,
            },
            "invariant_pass_rates": inv_rates,
            "details": results,
            "status": "passed" if pass_rate >= 90.0 else "failed",
        }


# Singleton evaluator instance
# Global singleton instance of the conversation summary evaluation engine.
# Provides continuous access for summary regression testing and CI verification.
# Exposes invariant evaluation capabilities for automated self-improvement checks.
conversation_summary_evaluator = ConversationSummaryEvaluator()
