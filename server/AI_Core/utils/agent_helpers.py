"""
agent_helpers.py - Shared Utilities for Financial Agents
========================================================

Consolidates duplicated logic found across multiple agent files:

- ``extract_numbers()`` -- numeric token extraction and normalization
- ``numbers_are_subset()`` -- number safety guard for LLM output
- ``format_currency_amount()`` -- currency-aware amount formatting
- ``extract_key_insights()`` -- headline insight extraction per analysis
- ``determine_action_type()`` -- map analyses to frontend CTA strings
- ``determine_priority()`` -- urgency level from analysis data
- ``build_tool_calls()`` -- generate conditional automation suggestions

These functions were previously duplicated in:
- ``master_agent.py``
- ``aggregator.py``
- ``api_service.py``
"""

from __future__ import annotations

import hashlib
import logging
import math
import re
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger("finwise.ai_core.agent_helpers")

# ── Currency Formatting ──────────────────────────────────────────────────

# ISO 4217 currency symbols (common ones)
_CURRENCY_SYMBOLS = {
    "USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥", "INR": "₹",
    "CAD": "C$", "AUD": "A$", "CHF": "CHF", "CNY": "¥", "KRW": "₩",
    "BRL": "R$", "MXN": "MX$", "SGD": "S$", "HKD": "HK$", "NZD": "NZ$",
    "SEK": "kr", "NOK": "kr", "DKK": "kr", "PLN": "zł", "THB": "฿",
    "IDR": "Rp", "MYR": "RM", "PHP": "₱", "VND": "₫", "EGP": "E£",
    "NGN": "₦", "KES": "KSh", "ZAR": "R", "AED": "د.إ", "SAR": "﷼",
}


# Formats floating point monetary amount with standard currency symbol.
# Looks up symbol mapping from ISO 4217 code table with code fallback.
# Returns formatted currency string with comma-separated thousands and cents.
def format_currency_amount(amount: float, currency_code: str = "INR") -> str:
    """Format a monetary amount with the appropriate currency symbol.

    Falls back to the ISO code if the symbol is not known.
    """
    symbol = _CURRENCY_SYMBOLS.get(currency_code.upper(), currency_code)
    return f"{symbol}{amount:,.2f}"


# Extracts and validates 3-letter ISO currency code from profile dictionary.
# Validates string against 3 uppercase alphabetical character pattern.
# Returns uppercase ISO currency string or defaults to standard INR.
def get_currency_code(user_profile: Optional[Dict[str, Any]]) -> str:
    """Extract a validated 3-letter currency code from a user profile.

    Defaults to ``"INR"`` if not set or invalid.
    """
    if not user_profile or not isinstance(user_profile, dict):
        return "INR"
    candidate = str(user_profile.get("currency") or "").strip().upper()
    if re.fullmatch(r"[A-Z]{3}", candidate):
        return candidate
    return "INR"


# ── Number Extraction & Safety Guard ─────────────────────────────────────

# Extracts and normalizes all numeric tokens present in text string.
# Strips currency symbols, thousands commas, and whitespace variations.
# Returns set of normalized numeric strings for strict subset comparisons.
def extract_numbers(text: str) -> Set[str]:
    """Extract and normalise all numeric tokens from a string.

    Captures integers, decimals, comma-separated thousands, and optional
    currency/percentage suffixes.  Normalises by stripping currency symbols
    and commas so that "₹1,00,000" and "100000" compare as equal.
    """
    # The lookbehind keeps a hyphen in an ISO date or compact range from
    # turning the next component into a negative amount.
    tokens = re.findall(r"(?:(?<!\d)[−-])?(?:[₹$€£¥][−-]?[ \t]*)?\d[\d,]*(?:\.\d+)?%?", text)
    normalized: Set[str] = set()
    for token in tokens:
        cleaned = token.replace("−", "-")
        for ch in ("₹", "$", "€", "£", "¥", ",", " ", "\t"):
            cleaned = cleaned.replace(ch, "")
        normalized.add(cleaned)
    return normalized


# Enforces number safety guard ensuring candidate numbers exist in reference.
# Verifies that candidate numeric set is mathematical subset of baseline.
# Returns boolean flag indicating candidate introduces no hallucinated digits.
def numbers_are_subset(candidate: str, reference: str) -> bool:
    """Check that every number in *candidate* already exists in *reference*.

    Used by the number safety guard: the LLM is allowed to omit numbers
    but not to introduce new ones.
    """
    return extract_numbers(candidate).issubset(extract_numbers(reference))


# ── Insight Extraction ───────────────────────────────────────────────────

# Distills headline key insight objects from completed agent analyses.
# Formats cash flow metrics, budget optimization, risk, and debt advice.
# Returns list of structured insight dictionaries for dashboard presentation.
def extract_key_insights(
    analyses: Dict[str, Any],
    currency_code: str = "INR",
) -> List[Dict[str, Any]]:
    """Extract one headline insight per completed analysis.

    Each insight is a small dict with ``agent``, ``title``,
    ``description``, and ``actionType``.  The frontend uses these to
    render summary cards above the full plan.
    """
    insights: List[Dict[str, Any]] = []

    for analysis_type, analysis_data in analyses.items():
        if not analysis_data or not isinstance(analysis_data, dict) or analysis_data.get("error"):
            continue

        try:
            insight: Optional[Dict[str, Any]] = None

            if analysis_type == "income_analysis":
                summary_metrics = analysis_data.get("summary_metrics", {})
                if not isinstance(summary_metrics, dict):
                    continue
                monthly_fields = ("average_monthly_net_cash_flow", "monthly_net_flow")
                explicitly_monthly = any(field in summary_metrics for field in monthly_fields)
                net_flow = next((summary_metrics[field] for field in monthly_fields if summary_metrics.get(field) is not None), None)
                if not explicitly_monthly:
                    net_flow = summary_metrics.get("net_cash_flow")
                if net_flow is None:
                    continue
                net_flow = float(net_flow)
                if not math.isfinite(net_flow):
                    continue
                label = "Recorded monthly average cash flow" if explicitly_monthly else "Recorded net cash flow"
                insight = {
                    "agent": "income_expense_analyzer",
                    "title": "Cash Flow Analysis",
                    "description": f"{label}: {format_currency_amount(net_flow, currency_code)}",
                    "actionType": "optimize_spending" if net_flow < 0 else "increase_savings",
                }

            elif analysis_type == "budget_plan":
                savings_rate = analysis_data.get("savings_rate", 0)
                insight = {
                    "agent": "budget_planner",
                    "title": "Budget Optimization",
                    "description": f"Current savings rate: {float(savings_rate):.1f}%",
                    "actionType": "review_budget",
                }

            elif analysis_type == "investment_advice":
                risk_profile = str(analysis_data.get("risk_profile", "moderate"))
                insight = {
                    "agent": "investment_advisor",
                    "title": "Investment Strategy",
                    "description": f"Recommended {risk_profile} portfolio",
                    "actionType": "invest",
                }

            elif analysis_type == "debt_optimization":
                strategy = analysis_data.get("recommended_strategy", {}).get("recommended_method", "snowball")
                insight = {
                    "agent": "debt_optimizer",
                    "title": "Debt Management",
                    "description": f"Use {strategy} method for optimized repayment",
                    "actionType": "manage_debt",
                }

            if insight:
                insights.append(insight)

        except Exception as exc:
            logger.warning("Error extracting insight from %s: %s", analysis_type, exc)

    return insights


# ── Action Type & Priority ───────────────────────────────────────────────

# Determines primary frontend call-to-action string based on active analyses.
# Evaluates prioritized order covering debt, investment, budget, and income.
# Returns action type keyword instructing client navigation routing.
def determine_action_type(analyses: Dict[str, Any]) -> str:
    """Map the set of completed analyses to a single action type string.

    The action type tells the frontend which primary CTA to show.
    Priority order: debt > investment > budget > income > review.
    """
    if "debt_optimization" in analyses:
        return "manage_debt"
    if "investment_advice" in analyses:
        return "invest"
    if "budget_plan" in analyses:
        return "review_budget"
    if "income_analysis" in analyses:
        return "optimize_spending"
    return "review"


# Calculates overall urgency level classification for financial plan.
# Evaluates critical debt-to-income thresholds and negative cash flow.
# Returns priority rating string categorized as high, medium, or low.
def determine_priority(analyses: Dict[str, Any], user_profile: Optional[Dict[str, Any]] = None) -> str:
    """Determine the urgency level of the financial plan.

    - **high**   -- debt-to-income > 40% or savings rate is negative
    - **medium** -- savings rate below 10%
    - **low**    -- everything else
    """
    if "debt_optimization" in analyses:
        debt_ratio = (
            analyses["debt_optimization"]
            .get("current_debt_situation", {})
            .get("debt_to_income_ratio", 0)
        )
        if debt_ratio > 40:
            return "high"

    if "income_analysis" in analyses:
        savings_rate = (
            analyses["income_analysis"]
            .get("summary_metrics", {})
            .get("savings_rate", 0)
        )
        if savings_rate < 0:
            return "high"
        if savings_rate < 10:
            return "medium"

    return "low"


# ── Tool Call Generation ─────────────────────────────────────────────────

# Generates deterministic short identifier for proposed tool call action.
# Computes SHA-256 hash digest of tool call title truncated to 12 characters.
# Returns unique idempotent identifier string for tool tracking.
def _make_tool_call_id(title: str) -> str:
    """Deterministic short ID from a tool call title (SHA-256 truncated)."""
    return hashlib.sha256(title.encode()).hexdigest()[:12]


# Generates conditional workflow automation suggestions based on plan metrics.
# Synthesizes calendar reminders, goal setups, and transaction review tools.
# Returns list of structured tool call specifications requiring confirmation.
def build_tool_calls(
    plan_metrics: Dict[str, Any],
    user_profile: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Generate conditional automation suggestions based on plan metrics.

    Produces up to 5 tool calls covering weekly review, emergency fund,
    debt check-in, transaction review, and investment rebalancing.
    """
    tool_calls: List[Dict[str, Any]] = []
    profile = user_profile or {}

    savings_rate = plan_metrics.get("savings_rate", 0)
    emergency_months = plan_metrics.get("emergency_fund_months", 0)
    total_debt = plan_metrics.get("total_debt", 0)
    debt_to_income = plan_metrics.get("debt_to_income", 0)
    monthly_net = plan_metrics.get("monthly_net_cash_flow", 0)

    # 1. Weekly review (always)
    tool_calls.append(
        {
            "id": _make_tool_call_id("weekly_financial_review"),
            "title": "Schedule Weekly Financial Review",
            "description": "Set up a recurring weekly review to track your spending and savings progress.",
            "tool": "create_calendar_reminder",
            "args": {
                "title": "Weekly Financial Review",
                "recurrence": "weekly",
                "dayOfWeek": "sunday",
                "time": "10:00",
            },
            "requires_confirmation": True,
            "risk": "low",
        }
    )

    # 2. Emergency fund (if below target)
    if emergency_months < 3:
        monthly_expenses = profile.get("monthly_expenses", 0)
        target_amount = monthly_expenses * 6 if monthly_expenses > 0 else 100000
        tool_calls.append(
            {
                "id": _make_tool_call_id("build_emergency_fund"),
                "title": "Build Emergency Fund",
                "description": f"Your emergency fund covers only {emergency_months:.1f} months. "
                               f"Aim for 3-6 months of expenses.",
                "tool": "create_financial_goal",
                "args": {
                    "name": "Emergency Fund",
                    "targetAmount": target_amount,
                    "category": "safety",
                    "priority": "high",
                },
                "requires_confirmation": True,
                "risk": "low",
            }
        )

    # 3. Debt check-in (if debt exists)
    if total_debt > 0:
        tool_calls.append(
            {
                "id": _make_tool_call_id("debt_payment_checkin"),
                "title": "Schedule Debt Payment Check-in",
                "description": f"With debt-to-income at {debt_to_income:.1f}%, "
                               f"regular check-ins help stay on track.",
                "tool": "create_calendar_reminder",
                "args": {
                    "title": "Debt Payment Check-in",
                    "recurrence": "biweekly",
                    "time": "09:00",
                },
                "requires_confirmation": True,
                "risk": "low",
            }
        )

    # 4. Transaction review (if spending is high)
    if savings_rate < 20 or monthly_net < 0:
        tool_calls.append(
            {
                "id": _make_tool_call_id("daily_transaction_review"),
                "title": "Enable Daily Transaction Review",
                "description": "Review new transactions daily to catch unexpected charges and stay on budget.",
                "tool": "enable_transaction_review",
                "args": {"frequency": "daily", "notifyOnLargeTransaction": True},
                "requires_confirmation": True,
                "risk": "low",
            }
        )

    # 5. Investment rebalancing (if savings rate is healthy)
    if savings_rate >= 20 and total_debt == 0:
        tool_calls.append(
            {
                "id": _make_tool_call_id("investment_rebalance_reminder"),
                "title": "Schedule Portfolio Rebalancing",
                "description": "With a strong savings rate, consider scheduling regular portfolio reviews.",
                "tool": "create_calendar_reminder",
                "args": {
                    "title": "Portfolio Rebalancing Review",
                    "recurrence": "quarterly",
                    "time": "10:00",
                },
                "requires_confirmation": True,
                "risk": "low",
            }
        )

    return tool_calls[:5]
