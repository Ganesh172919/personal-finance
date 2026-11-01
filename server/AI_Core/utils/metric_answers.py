"""Direct answers for saved-profile metric questions, without an LLM call."""
from __future__ import annotations

import math
import re
from typing import Any

from utils.agent_helpers import get_currency_code


def _nonnegative(value: Any) -> float | None:
    try:
        number = float(value)
        return number if math.isfinite(number) and number >= 0 else None
    except (TypeError, ValueError, OverflowError):
        return None


def direct_metric_answer(question: str, profile: dict[str, Any] | None) -> str:
    query = str(question or "").lower()
    wants_income = bool(re.search(r"\bmonthly income\b|\bincome per month\b", query))
    wants_ratio = bool(re.search(r"\bdti\b|\bdebt[- ]to[- ]income\b", query)) or (
        "debt" in query and "ratio" in query
    )
    wants_total_debt = bool(re.search(r"\btotal debt\b|\ball debts\b|\bhow much debt\b", query))
    wants_savings_rate = bool(re.search(r"\bsavings rate\b|\brate of savings\b", query))

    if not profile or not (wants_income or wants_ratio or wants_total_debt or wants_savings_rate):
        return ""

    annual = _nonnegative(profile.get("annual_income"))
    currency = get_currency_code(profile)
    lines = []
    monthly = annual / 12 if annual is not None else None
    if wants_income:
        lines.append(
            f"**Monthly income: {currency} {monthly:,.2f}** "
            f"({currency} {annual:,.2f} annual income / 12)."
            if monthly is not None else "Add your annual income to calculate monthly income."
        )
    if wants_ratio:
        debts = profile.get("debts")
        payments = [
            _nonnegative(debt.get("minimum_payment")) if isinstance(debt, dict) else None
            for debt in debts
        ] if isinstance(debts, list) else None
        if monthly is None or monthly <= 0:
            lines.append("A positive monthly income is needed to calculate the minimum debt payment ratio.")
        elif payments is None or any(payment is None for payment in payments):
            lines.append("Add all debt minimum payments to calculate the minimum debt payment ratio.")
        else:
            minimum = sum(payments)
            ratio = minimum / monthly * 100
            lines.append(
                f"**Minimum debt payment ratio: {ratio:.2f}%** "
                f"({currency} {minimum:,.2f} monthly minimum payments / "
                f"{currency} {monthly:,.2f} monthly income x 100)."
            )
    if wants_total_debt:
        debts = profile.get("debts")
        balances = [
            _nonnegative(debt.get("balance") or debt.get("amount")) if isinstance(debt, dict) else None
            for debt in debts
        ] if isinstance(debts, list) else None
        if balances is None or any(b is None for b in balances):
            lines.append("Add all debt balances to calculate your total debt.")
        else:
            total_debt = sum(balances)
            lines.append(
                f"**Total debt: {currency} {total_debt:,.2f}** across {len(debts)} debt account(s)."
            )
    if wants_savings_rate:
        monthly_expenses = _nonnegative(profile.get("monthly_expenses"))
        if monthly is None or monthly <= 0:
            lines.append("A positive monthly income is needed to calculate your savings rate.")
        elif monthly_expenses is None:
            lines.append("Add your monthly expenses to calculate your savings rate.")
        else:
            net_savings = max(0.0, monthly - monthly_expenses)
            savings_rate = (net_savings / monthly) * 100
            lines.append(
                f"**Savings rate: {savings_rate:.2f}%** "
                f"({currency} {net_savings:,.2f} net monthly savings / "
                f"{currency} {monthly:,.2f} monthly income x 100)."
            )
    return "\n\n".join(lines)
