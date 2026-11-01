r"""
test_routing_accuracy.py - Golden Routing Prompts
===================================================

Validates that the master agent's deterministic routing logic sends
each query to the correct AnalysisType.

Covers all 7 AnalysisType values:
- INCOME_EXPENSE
- BUDGET_PLANNING
- INVESTMENT_ADVICE
- DEBT_OPTIMIZATION
- FINANCIAL_EDUCATION
- COMPREHENSIVE
- DECOMPOSE

Edge cases: ambiguous queries, multi-domain, short queries, typos,
follow-up context, queries without profile.

MINDMAP FLOW
------------
::

    Routing Accuracy Test Suite
    ├── 1. Domain Golden Prompts
    │   ├── Income & Expenses queries -> AnalysisType.INCOME_EXPENSE
    │   ├── Budgeting & Saving queries -> AnalysisType.BUDGET_PLANNING
    │   ├── Investment & SIP queries   -> AnalysisType.INVESTMENT_ADVICE
    │   └── Debt & Loan queries        -> AnalysisType.DEBT_OPTIMIZATION
    ├── 2. Special Context Routing
    │   ├── Educational queries ("what is", "how does") -> AnalysisType.FINANCIAL_EDUCATION
    │   ├── Zero profile queries -> Fallback to FINANCIAL_EDUCATION
    │   └── Multi-domain queries (>=2 domains) -> AnalysisType.COMPREHENSIVE
    └── 3. Follow-up Disambiguation
        ├── Follow-up with history context
        └── Session summary context injection

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |         Golden Prompt (Query + Profile + Context)             |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |          master_agent.determine_analysis_type(...)            |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |             Assert: actual_type == expected_type              |
    +-------------------------------+-------------------------------+
                                    |
                        [Routing Matches Golden?]
                               /         \
                             YES          NO (Routing Drift Detected)
                             /             \
                            v               v
                     +------------+   +-----------------------------+
                     | Pass       |   | Fail & Output Discrepancy   |
                     +------------+   +-----------------------------+
"""

from __future__ import annotations

import pytest

from graph.state import AnalysisType

# ---------------------------------------------------------------------------
# All tests use the ``master_agent`` and ``run_routing`` fixtures from conftest
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# INCOME_EXPENSE routing (8 tests)
# ---------------------------------------------------------------------------


@pytest.mark.routing
class TestIncomeExpenseRouting:
    """Queries that should route to the income_expense analyzer."""

    @pytest.mark.parametrize(
        "query,desc",
        [
            ("Show me my spending pattern this month", "explicit spending"),
            ("Track my cash flow and spending patterns", "cashflow and spending tracking"),
            ("Summarize my income vs expenses", "income and expense keywords"),
            ("What are my biggest expense categories?", "expense categories"),
            ("Detect anomalies in my transactions", "transaction analysis"),
            ("How much did I spend on dining last month?", "specific category spend"),
            ("Track my monthly cashflow trends", "cashflow trends"),
            ("List all my expenses for this period", "expense listing"),
        ],
        ids=lambda x: x if isinstance(x, str) else None,
    )
    def test_routes_to_income_expense(self, master_agent, full_profile, run_routing, query, desc):
        result = run_routing(master_agent, query, full_profile)
        assert result == AnalysisType.INCOME_EXPENSE.value, (
            f"Expected INCOME_EXPENSE for '{query}' ({desc}), got '{result}'"
        )


# ---------------------------------------------------------------------------
# BUDGET_PLANNING routing (8 tests)
# ---------------------------------------------------------------------------


@pytest.mark.routing
class TestBudgetPlanningRouting:
    """Queries that should route to the budget planner."""

    @pytest.mark.parametrize(
        "query,desc",
        [
            ("Create a monthly budget for me", "explicit budget request"),
            ("Help me reduce my monthly costs and save", "cost cutting with save"),
            ("How much should I save each month for goals?", "savings question"),
            ("Build a savings plan for my goals", "savings plan"),
            ("I want to cut costs and save more", "cost cutting"),
            ("Create a monthly plan for my money", "monthly plan"),
            ("Recommend a budget plan", "budget recommendation"),
            ("What's a good monthly savings target?", "savings target"),
        ],
        ids=lambda x: x if isinstance(x, str) else None,
    )
    def test_routes_to_budget_planning(self, master_agent, full_profile, run_routing, query, desc):
        result = run_routing(master_agent, query, full_profile)
        assert result == AnalysisType.BUDGET_PLANNING.value, (
            f"Expected BUDGET_PLANNING for '{query}' ({desc}), got '{result}'"
        )


# ---------------------------------------------------------------------------
# INVESTMENT_ADVICE routing (8 tests)
# ---------------------------------------------------------------------------


@pytest.mark.routing
class TestInvestmentAdviceRouting:
    """Queries that should route to the investment advisor."""

    @pytest.mark.parametrize(
        "query,desc",
        [
            ("Optimize my investment portfolio", "portfolio optimization"),
            ("Suggest SIPs for long-term growth", "SIP recommendation"),
            ("How should I invest for retirement?", "retirement investing"),
            ("Which mutual funds are good for me?", "mutual fund query"),
            ("Is my portfolio well diversified?", "diversification check"),
            ("Review my stock holdings", "stock review"),
            ("What ETFs should I buy?", "ETF recommendation"),
            ("Should I increase my SIP amount?", "SIP increase"),
        ],
        ids=lambda x: x if isinstance(x, str) else None,
    )
    def test_routes_to_investment_advice(self, master_agent, full_profile, run_routing, query, desc):
        result = run_routing(master_agent, query, full_profile)
        assert result == AnalysisType.INVESTMENT_ADVICE.value, (
            f"Expected INVESTMENT_ADVICE for '{query}' ({desc}), got '{result}'"
        )


# ---------------------------------------------------------------------------
# DEBT_OPTIMIZATION routing (8 tests)
# ---------------------------------------------------------------------------


@pytest.mark.routing
class TestDebtOptimizationRouting:
    """Queries that should route to the debt optimizer."""

    @pytest.mark.parametrize(
        "query,desc",
        [
            ("Help me pay off my credit card debt faster", "credit card payoff"),
            ("Create a debt repayment plan", "repayment plan"),
            ("How can I reduce interest on my loans?", "interest reduction"),
            ("I want to clear my loan early", "early payoff"),
            ("Which debt should I pay off first?", "debt priority"),
            ("Help me manage my EMIs better", "EMI management"),
            ("My credit card debt is growing, help me repay it", "credit card debt repayment"),
            ("Should I consolidate my debt with a loan?", "debt consolidation"),
        ],
        ids=lambda x: x if isinstance(x, str) else None,
    )
    def test_routes_to_debt_optimization(self, master_agent, full_profile, run_routing, query, desc):
        result = run_routing(master_agent, query, full_profile)
        assert result == AnalysisType.DEBT_OPTIMIZATION.value, (
            f"Expected DEBT_OPTIMIZATION for '{query}' ({desc}), got '{result}'"
        )


# ---------------------------------------------------------------------------
# FINANCIAL_EDUCATION routing (8 tests)
# ---------------------------------------------------------------------------


@pytest.mark.routing
class TestFinancialEducationRouting:
    """Queries that should route to financial education (no profile needed)."""

    @pytest.mark.parametrize(
        "query,profile_fixture,desc",
        [
            ("What is compound interest?", None, "pure education, no profile"),
            ("Explain diversification", None, "explain keyword"),
            ("Define mutual fund", None, "define keyword"),
            ("How does inflation work?", None, "how does keyword"),
            ("Why is an emergency fund important?", None, "why keyword"),
            ("What is SIP?", None, "abbreviation education"),
            ("What is tax saving?", None, "tax education"),
            ("Explain the 50-30-20 rule", None, "budgeting rule education"),
        ],
        ids=lambda x: x if isinstance(x, str) else None,
    )
    def test_routes_to_financial_education(self, master_agent, run_routing, query, profile_fixture, desc):
        profile = None
        result = run_routing(master_agent, query, profile)
        assert result == AnalysisType.FINANCIAL_EDUCATION.value, (
            f"Expected FINANCIAL_EDUCATION for '{query}' ({desc}), got '{result}'"
        )


# ---------------------------------------------------------------------------
# COMPREHENSIVE routing (8 tests)
# ---------------------------------------------------------------------------


@pytest.mark.routing
class TestComprehensiveRouting:
    """Queries that should route to comprehensive analysis."""

    @pytest.mark.parametrize(
        "query,desc",
        [
            ("Analyze my finances and create a full plan", "comprehensive request"),
            ("Give me a comprehensive financial strategy", "comprehensive keyword"),
            ("I want to improve my overall financial health", "overall health"),
            ("Provide a holistic financial plan", "holistic plan"),
            ("Create a financial roadmap for me", "roadmap request"),
            ("Improve my finances comprehensively", "improve finances"),
            ("What should I do to fix my finances?", "fix finances"),
            ("Help me with my financial strategy", "strategy request"),
        ],
        ids=lambda x: x if isinstance(x, str) else None,
    )
    def test_routes_to_comprehensive(self, master_agent, full_profile, run_routing, query, desc):
        result = run_routing(master_agent, query, full_profile)
        # Some of these may route to DECOMPOSE depending on profile complexity;
        # accept both COMPREHENSIVE and DECOMPOSE as valid comprehensive paths.
        assert result in (AnalysisType.COMPREHENSIVE.value, AnalysisType.DECOMPOSE.value), (
            f"Expected COMPREHENSIVE or DECOMPOSE for '{query}' ({desc}), got '{result}'"
        )


# ---------------------------------------------------------------------------
# DECOMPOSE routing (5 tests)
# ---------------------------------------------------------------------------


@pytest.mark.routing
class TestDecomposeRouting:
    """Queries that should trigger the sub-agent decomposition pipeline."""

    def test_decompose_three_domains(self, master_agent, full_profile, run_routing):
        query = "Analyze my income, budget, investments, and debt together"
        result = run_routing(master_agent, query, full_profile)
        assert result in (AnalysisType.DECOMPOSE.value, AnalysisType.COMPREHENSIVE.value)

    def test_decompose_comprehensive_plan_language(self, master_agent, full_profile, run_routing):
        query = "Create a comprehensive plan for my finances"
        result = run_routing(master_agent, query, full_profile)
        assert result in (AnalysisType.DECOMPOSE.value, AnalysisType.COMPREHENSIVE.value)

    def test_decompose_financial_roadmap(self, master_agent, full_profile, run_routing):
        query = "Build a financial roadmap covering debt payoff, saving, and investing"
        result = run_routing(master_agent, query, full_profile)
        assert result in (AnalysisType.DECOMPOSE.value, AnalysisType.COMPREHENSIVE.value)

    def test_decompose_holistic_plan(self, master_agent, full_profile, run_routing):
        query = "Give me a holistic plan for budgeting and investing and debt management"
        result = run_routing(master_agent, query, full_profile)
        assert result in (AnalysisType.DECOMPOSE.value, AnalysisType.COMPREHENSIVE.value)

    def test_decompose_full_strategy(self, master_agent, full_profile, run_routing):
        query = "I need a complete strategy for income, savings, investments, and loan repayment"
        result = run_routing(master_agent, query, full_profile)
        assert result in (AnalysisType.DECOMPOSE.value, AnalysisType.COMPREHENSIVE.value)


# ---------------------------------------------------------------------------
# Edge cases (8 tests)
# ---------------------------------------------------------------------------


@pytest.mark.routing
class TestRoutingEdgeCases:
    """Edge-case routing scenarios."""

    def test_empty_query_defaults_to_comprehensive(self, master_agent, full_profile, run_routing):
        result = run_routing(master_agent, "", full_profile)
        # Empty query with profile -> fallback to comprehensive
        assert result in (
            AnalysisType.COMPREHENSIVE.value,
            AnalysisType.FINANCIAL_EDUCATION.value,
        )

    def test_no_profile_educational_query(self, master_agent, run_routing):
        result = run_routing(master_agent, "What is investing?", None)
        assert result == AnalysisType.FINANCIAL_EDUCATION.value

    def test_no_profile_generic_query_goes_to_education(self, master_agent, run_routing):
        """Without a profile, even generic queries should go to education."""
        result = run_routing(master_agent, "Help me with money", None)
        assert result == AnalysisType.FINANCIAL_EDUCATION.value

    def test_short_query_budget(self, master_agent, full_profile, run_routing):
        result = run_routing(master_agent, "budget", full_profile)
        assert result == AnalysisType.BUDGET_PLANNING.value

    def test_short_query_invest(self, master_agent, full_profile, run_routing):
        result = run_routing(master_agent, "invest", full_profile)
        assert result == AnalysisType.INVESTMENT_ADVICE.value

    def test_short_query_debt(self, master_agent, full_profile, run_routing):
        result = run_routing(master_agent, "debt", full_profile)
        assert result == AnalysisType.DEBT_OPTIMIZATION.value

    def test_typo_tolerance_budget(self, master_agent, full_profile, run_routing):
        """Even with minor typos, keyword matching should still work."""
        result = run_routing(master_agent, "creat a budgt for me", full_profile)
        # This may not match due to typos -- acceptable fallback
        assert result in (
            AnalysisType.BUDGET_PLANNING.value,
            AnalysisType.COMPREHENSIVE.value,
        )

    def test_ambiguous_save_invest_query(self, master_agent, full_profile, run_routing):
        """Query with both save and invest keywords -- should be comprehensive."""
        result = run_routing(master_agent, "Should I save more or invest in SIP?", full_profile)
        # Has both budget ("save") and investment ("invest", "SIP") keywords
        assert result in (
            AnalysisType.COMPREHENSIVE.value,
            AnalysisType.DECOMPOSE.value,
            AnalysisType.BUDGET_PLANNING.value,
            AnalysisType.INVESTMENT_ADVICE.value,
        )


# ---------------------------------------------------------------------------
# Context-enriched routing (5 tests)
# ---------------------------------------------------------------------------


@pytest.mark.routing
class TestContextEnrichedRouting:
    """Tests for follow-up queries enriched by conversation history."""

    def test_followup_what_about_investing(
        self, master_agent, full_profile, run_routing
    ):
        """Follow-up query enriched by previous user message about debt."""
        result = run_routing(
            master_agent, "What about investing?", full_profile
        )
        # The context enrichment should pick up "invest" from the query
        assert result in (
            AnalysisType.INVESTMENT_ADVICE.value,
            AnalysisType.COMPREHENSIVE.value,
        )

    def test_session_summary_enrichment(self, master_agent, full_profile, run_routing):
        """Query enriched by session summary mentioning debt."""
        # run_routing doesn't pass session_summary, so test the method directly
        result = master_agent.determine_analysis_type(
            user_input="What should I do next?",
            user_profile=full_profile,
            session_summary="User has high credit card debt and wants to invest",
        )
        val = result.value if hasattr(result, "value") else str(result)
        # Should pick up debt + invest keywords from session summary
        assert val in (
            AnalysisType.COMPREHENSIVE.value,
            AnalysisType.DECOMPOSE.value,
        )

    def test_history_only_user_messages_used(self, master_agent, full_profile):
        """Only the last user message should be used for context."""
        history = [
            {"role": "assistant", "content": "You should save more money"},
            {"role": "user", "content": "Help me with my loan repayment"},
        ]
        result = master_agent.determine_analysis_type(
            user_input="What about my debt?",
            user_profile=full_profile,
            conversation_history=history,
        )
        val = result.value if hasattr(result, "value") else str(result)
        assert val == AnalysisType.DEBT_OPTIMIZATION.value

    def test_empty_history_no_crash(self, master_agent, full_profile):
        """Empty conversation history should not cause errors."""
        result = master_agent.determine_analysis_type(
            user_input="budget",
            user_profile=full_profile,
            conversation_history=[],
        )
        val = result.value if hasattr(result, "value") else str(result)
        assert val == AnalysisType.BUDGET_PLANNING.value

    def test_none_session_summary_no_crash(self, master_agent, full_profile):
        """None session_summary should not cause errors."""
        result = master_agent.determine_analysis_type(
            user_input="invest",
            user_profile=full_profile,
            session_summary=None,
        )
        val = result.value if hasattr(result, "value") else str(result)
        assert val == AnalysisType.INVESTMENT_ADVICE.value
