"""
budget_planner.py - Budget Planner Agent
=========================================

The ``BudgetPlannerAgent`` creates personalised budget plans based on a
user's income, expenses, savings goals, and debts.  It operates entirely
deterministically -- no LLM calls are made -- producing structured
budget allocations, savings plans, and debt repayment budgets.

Key responsibilities
--------------------
- Allocate income across spending categories (50/30/20 or debt-heavy variants).
- Calculate monthly savings needed for each financial goal.
- Determine debt repayment budget (minimum + recommended extra).
- Generate a markdown-formatted budget plan with actionable steps.
- Leverage deterministic profile hashing and response caching.

MINDMAP FLOW
------------
::

    BudgetPlannerAgent
    ├── 1. Profile Ingestion & Caching Check
    │   ├── Compute Profile Hash (agent_cache.hash_profile)
    │   ├── Cache Lookup ("budget_planner:<hash>")
    │   └── Fast-Return Cached Budget Plan on Hit
    ├── 2. Core Financial Metric Derivation
    │   ├── Monthly Income & Expense Normalization
    │   ├── Debt-to-Income (DTI) Assessment
    │   └── Free Cash Flow Computation (Income - Expenses)
    ├── 3. Category Allocation Engine (_calculate_budget_allocation)
    │   ├── Standard Rule: 50% Needs, 30% Wants, 20% Savings
    │   └── Debt-Heavy Rule (DTI > 15%): 50% Needs, 20% Wants, 30% Debt/Savings
    ├── 4. Savings & Goal Planning (_create_savings_plan)
    │   ├── Emergency Fund Target (Expenses * EMERGENCY_FUND_MONTHS)
    │   ├── Emergency Fund Gap & Monthly Allocation
    │   └── Prioritized Goal Milestones (Target / Timeline)
    ├── 5. Debt Repayment Cashflow (_calculate_debt_repayment_budget)
    │   ├── Minimum Monthly Debt Obligations
    │   └── Recommended Accelerated Debt Prepayment
    └── 6. Reporting & Financial Ratio Synthesis
        ├── Deterministic Markdown Rendering (_generate_detailed_budget)
        ├── Multi-Currency Formatting (INR / USD / EUR)
        ├── Ratio Matrix (Savings Rate, DTI, Runway) via DataProcessor
        └── Result Cache Population (agent_cache.set)

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |                  Input: User Profile Dict                     |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |         Cache Check: agent_cache.hash_profile(user_profile)   |
    +-------------------------------+-------------------------------+
                                    |
                           [Cache Hit Found?]
                               /          \
                             YES           NO
                             /              \
                            v                v
     +-------------------------------+   +-----------------------------+
     | Return Cached Result directly |   | Monthly Income / Expense    |
     +-------------------------------+   | Decomposition               |
                                         +--------------+--------------+
                                                        |
                                                        v
                                         +-----------------------------+
                                         | Allocation Engine:          |
                                         |  - If DTI > 15%:            |
                                         |      50/20/30 (Debt Heavy)  |
                                         |  - Else:                    |
                                         |      50/30/20 (Standard)    |
                                         +--------------+--------------+
                                                        |
                                                        v
                                         +-----------------------------+
                                         | Savings & Emergency Fund:   |
                                         |  - 3-Month Runway Target    |
                                         |  - Prioritize Top 3 Goals   |
                                         +--------------+--------------+
                                                        |
                                                        v
                                         +-----------------------------+
                                         | Debt Repayment Budget:      |
                                         |  - Minimums + Surplus Accel |
                                         +--------------+--------------+
                                                        |
                                                        v
                                         +-----------------------------+
                                         | DataProcessor:              |
                                         |  - Calculate Financial Ratios|
                                         | Render Deterministic MD     |
                                         | Cache Result & Return       |
                                         +-----------------------------+

Design decisions
----------------
- All calculations are deterministic arithmetic -- no LLM fan-out.
- The agent adapts its allocation strategy based on the user's
  debt-to-income ratio (switches to a debt-heavy split when >15%).
- Emergency fund target defaults to 3 months of expenses (configurable
  via ``settings.EMERGENCY_FUND_MONTHS``).
"""

import logging
from typing import Any, Dict, List

from config import settings
from tools import DataProcessor
from utils import format_currency
from utils.agent_helpers import get_currency_code
from utils.response_cache import agent_cache

logger = logging.getLogger(__name__)


class BudgetPlannerAgent:
    """Creates and optimizes personalized budget plans.

    This agent is part of the multi-agent financial advisory system.
    It receives a user profile dict and returns a structured budget
    plan with allocations, savings targets, and debt repayment guidance.
    """

    def create_budget_plan(self, user_profile: Dict[str, Any]) -> Dict[str, Any]:
        """Create a comprehensive budget plan.

        Uses intelligent caching: deterministic outputs are cached by profile hash
        to avoid redundant computation on repeated queries with the same data.
        """
        # Check cache first
        profile_hash = agent_cache.hash_profile(user_profile)
        cache_key = agent_cache.make_key("budget_planner", profile_hash)
        cached = agent_cache.get(cache_key)
        if cached:
            logger.info("Cache hit for budget plan (profile_hash=%s)", profile_hash)
            return cached

        logger.info("Creating budget plan for user profile (cache miss)")

        try:
            income = user_profile.get("annual_income", 0) / 12
            expenses = user_profile.get("monthly_expenses", 0)
            savings = user_profile.get("savings", 0)
            goals = user_profile.get("financial_goals", [])
            debts = user_profile.get("debts", [])

            budget_allocation = self._calculate_budget_allocation(income, expenses, goals, debts)
            savings_plan = self._create_savings_plan(income, expenses, goals, savings)
            debt_repayment = self._calculate_debt_repayment_budget(debts, income)
            detailed_budget = self._generate_detailed_budget(
                income, expenses, budget_allocation, savings_plan, debt_repayment, goals,
                currency_code=get_currency_code(user_profile),
            )

            result = {
                "monthly_income": income,
                "current_expenses": expenses,
                "budget_allocation": budget_allocation,
                "savings_plan": savings_plan,
                "debt_repayment_allocation": debt_repayment,
                "detailed_recommendations": detailed_budget,
                "emergency_fund_target": expenses * settings.EMERGENCY_FUND_MONTHS,
                "savings_rate": ((income - expenses) / income * 100) if income > 0 else 0,
                "financial_ratios": DataProcessor.calculate_financial_ratios(
                    income=income * 12,
                    expenses=expenses * 12,
                    debts=debts,
                    assets=user_profile.get("savings", 0),
                ),
            }

            # Cache the deterministic result
            agent_cache.set(cache_key, result)
            return result
        except Exception as exc:
            logger.error("Error creating budget plan: %s", exc)
            return {"error": str(exc), "detailed_recommendations": "Unable to create budget plan."}

    def _calculate_budget_allocation(
        self,
        income: float,
        _expenses: float,
        goals: List[Dict[str, Any]],
        debts: List[Dict[str, Any]],
    ) -> Dict[str, float]:
        total_debt_payments = sum(debt.get("minimum_payment", 0) for debt in debts)
        goal_savings_needed = self._calculate_goal_savings(goals, income)

        debt_ratio = (total_debt_payments / income) if income > 0 else 0
        if debt_ratio > 0.15:
            return {
                "essential_expenses": income * 0.50,
                "debt_repayment": income * 0.30,
                "savings": income * 0.10,
                "discretionary": income * 0.10,
            }

        return {
            "housing": income * 0.25,
            "transportation": income * 0.15,
            "food": income * 0.12,
            "healthcare": income * 0.08,
            "debt_repayment": total_debt_payments,
            "savings": max(income * 0.15, goal_savings_needed),
            "discretionary": income * 0.15,
            "insurance": income * 0.05,
            "utilities": income * 0.05,
        }

    def _calculate_goal_savings(self, goals: List[Dict[str, Any]], income: float) -> float:
        if not goals:
            return income * settings.DEFAULT_SAVINGS_RATE

        total_monthly_savings = 0.0
        for goal in goals:
            target = goal.get("target", 0)
            timeline = goal.get("timeline_months", 12)
            total_monthly_savings += target / timeline if timeline > 0 else 0

        return min(total_monthly_savings, income * 0.30)

    def _create_savings_plan(
        self,
        income: float,
        expenses: float,
        goals: List[Dict[str, Any]],
        current_savings: float,
    ) -> Dict[str, Any]:
        emergency_fund_target = expenses * settings.EMERGENCY_FUND_MONTHS
        emergency_fund_gap = max(0, emergency_fund_target - current_savings)

        goal_savings: Dict[str, Dict[str, Any]] = {}
        for goal in goals:
            goal_name = goal.get("name", "unknown")
            target = goal.get("target", 0)
            timeline = goal.get("timeline_months", 12)
            monthly = target / timeline if timeline > 0 else 0
            goal_savings[goal_name] = {
                "monthly_savings": monthly,
                "target": target,
                "timeline_months": timeline,
                "priority": goal.get("priority", "medium"),
            }

        return {
            "emergency_fund": {
                "target": emergency_fund_target,
                "current": current_savings,
                "gap": emergency_fund_gap,
                "monthly_savings_needed": emergency_fund_gap / 6,
            },
            "goal_savings": goal_savings,
            "total_monthly_savings": sum(goal["monthly_savings"] for goal in goal_savings.values()),
            "baseline_savings_target": income * settings.DEFAULT_SAVINGS_RATE,
        }

    def _calculate_debt_repayment_budget(self, debts: List[Dict[str, Any]], income: float) -> Dict[str, Any]:
        if not debts:
            return {"total_monthly_payment": 0, "debts": []}

        total_minimum_payments = sum(debt.get("minimum_payment", 0) for debt in debts)
        recommended_extra = min(income * 0.10, 500)

        debt_details = []
        for debt in debts:
            debt_details.append(
                {
                    "name": debt.get("name", "Unknown"),
                    "balance": debt.get("balance", 0),
                    "minimum_payment": debt.get("minimum_payment", 0),
                    "recommended_extra": recommended_extra / max(1, len(debts)),
                }
            )

        return {
            "total_monthly_payment": total_minimum_payments + recommended_extra,
            "minimum_payments": total_minimum_payments,
            "recommended_extra": recommended_extra,
            "debts": debt_details,
        }

    def _generate_detailed_budget(
        self,
        income: float,
        expenses: float,
        allocation: Dict[str, float],
        savings_plan: Dict[str, Any],
        debt_repayment: Dict[str, Any],
        goals: List[Dict[str, Any]],
        currency_code: str = "INR",
    ) -> str:
        """Generate deterministic budget recommendations without LLM fan-out."""

        allocation_lines = []
        for category, amount in allocation.items():
            percentage = (amount / income * 100) if income > 0 else 0
            allocation_lines.append(f"- {category}: {format_currency(amount, currency_code)} ({percentage:.1f}%)")

        emergency_fund = savings_plan.get("emergency_fund", {})
        monthly_goal_savings = savings_plan.get("total_monthly_savings", 0)
        debt_monthly = debt_repayment.get("total_monthly_payment", 0)

        top_goals = sorted(goals, key=lambda item: item.get("priority", 5))[:3]
        goal_lines = [
            f"- {goal.get('name', 'Goal')}: {format_currency(goal.get('target', 0), currency_code)} in {goal.get('timeline_months', 12)} months"
            for goal in top_goals
        ] or ["- No explicit goals yet; start with emergency fund and debt reduction."]

        free_cash_flow = income - expenses
        action_lines = [
            "1) Automate savings transfer on salary day.",
            "2) Cap discretionary spend with weekly limits.",
            "3) Review budget variance weekly and rebalance categories.",
            "4) Increase debt prepayment whenever monthly surplus exceeds plan.",
        ]
        if free_cash_flow < 0:
            action_lines.insert(0, "0) Immediate correction: reduce discretionary categories by 10-20% this month.")

        return "\n".join(
            [
                "Budget Plan (Deterministic)",
                "",
                f"Monthly income: {format_currency(income, currency_code)}",
                f"Current monthly expenses: {format_currency(expenses, currency_code)}",
                f"Current free cash flow: {format_currency(free_cash_flow, currency_code)}",
                "",
                "Recommended allocation:",
                *allocation_lines,
                "",
                "Savings priorities:",
                f"- Emergency fund target: {format_currency(emergency_fund.get('target', 0), currency_code)}",
                f"- Current emergency savings: {format_currency(emergency_fund.get('current', 0), currency_code)}",
                f"- Emergency fund gap: {format_currency(emergency_fund.get('gap', 0), currency_code)}",
                f"- Goal savings required monthly: {format_currency(monthly_goal_savings, currency_code)}",
                "",
                "Debt cashflow:",
                f"- Planned monthly debt payment: {format_currency(debt_monthly, currency_code)}",
                "",
                "Top goals:",
                *goal_lines,
                "",
                "30-day action plan:",
                *action_lines,
                "",
                "Tracking metrics: savings rate, weekly variance, debt balance trend, emergency fund runway.",
            ]
        )
