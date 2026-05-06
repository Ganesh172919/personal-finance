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
from utils import format_currency

logger = logging.getLogger(__name__)


class BudgetPlannerAgent:
    """Creates and optimizes personalized budget plans.

    This agent is part of the multi-agent financial advisory system.
    It receives a user profile dict and returns a structured budget
    plan with allocations, savings targets, and debt repayment guidance.
    """

    def create_budget_plan(self, user_profile: Dict[str, Any]) -> Dict[str, Any]:
        """Create a comprehensive budget plan."""
        logger.info("Creating budget plan for user profile")

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
                income, expenses, budget_allocation, savings_plan, debt_repayment, goals
            )

            return {
                "monthly_income": income,
                "current_expenses": expenses,
                "budget_allocation": budget_allocation,
                "savings_plan": savings_plan,
                "debt_repayment_allocation": debt_repayment,
                "detailed_recommendations": detailed_budget,
                "emergency_fund_target": expenses * settings.EMERGENCY_FUND_MONTHS,
                "savings_rate": ((income - expenses) / income * 100) if income > 0 else 0,
            }
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
    ) -> str:
        """Generate deterministic budget recommendations without LLM fan-out."""

        allocation_lines = []
        for category, amount in allocation.items():
            percentage = (amount / income * 100) if income > 0 else 0
            allocation_lines.append(f"- {category}: {format_currency(amount)} ({percentage:.1f}%)")

        emergency_fund = savings_plan.get("emergency_fund", {})
        monthly_goal_savings = savings_plan.get("total_monthly_savings", 0)
        debt_monthly = debt_repayment.get("total_monthly_payment", 0)

        top_goals = sorted(goals, key=lambda item: item.get("priority", 5))[:3]
        goal_lines = [
            f"- {goal.get('name', 'Goal')}: {format_currency(goal.get('target', 0))} in {goal.get('timeline_months', 12)} months"
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
                f"Monthly income: {format_currency(income)}",
                f"Current monthly expenses: {format_currency(expenses)}",
                f"Current free cash flow: {format_currency(free_cash_flow)}",
                "",
                "Recommended allocation:",
                *allocation_lines,
                "",
                "Savings priorities:",
                f"- Emergency fund target: {format_currency(emergency_fund.get('target', 0))}",
                f"- Current emergency savings: {format_currency(emergency_fund.get('current', 0))}",
                f"- Emergency fund gap: {format_currency(emergency_fund.get('gap', 0))}",
                f"- Goal savings required monthly: {format_currency(monthly_goal_savings)}",
                "",
                "Debt cashflow:",
                f"- Planned monthly debt payment: {format_currency(debt_monthly)}",
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