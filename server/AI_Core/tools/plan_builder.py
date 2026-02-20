from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from contracts.plan import ActionBuckets, ActionItem, KeyMetrics, Plan


def _safe_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        if isinstance(value, bool):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _round_or_none(value: Optional[float], digits: int = 2) -> Optional[float]:
    if value is None:
        return None
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


def _pick_first_float(*values: Any) -> Optional[float]:
    for value in values:
        parsed = _safe_float(value)
        if parsed is not None:
            return parsed
    return None


def _normalize_percent(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    if 0 < value <= 1:
        return value * 100
    return value


def _normalize_currency_code(value: Any) -> str:
    raw = str(value or "").strip().upper()
    if len(raw) == 3 and raw.isalpha():
        return raw
    return "USD"


def _format_currency(value: Optional[float], currency_code: str = "USD") -> str:
    if value is None:
        return "-"
    normalized = _normalize_currency_code(currency_code)
    return f"{normalized} {value:,.0f}"


def _format_percent(value: Optional[float]) -> str:
    if value is None:
        return "-"
    return f"{value:.1f}%"


@dataclass(frozen=True)
class PlanInputs:
    user_profile: Optional[Dict[str, Any]]
    income_analysis: Optional[Dict[str, Any]] = None
    budget_plan: Optional[Dict[str, Any]] = None
    investment_advice: Optional[Dict[str, Any]] = None
    debt_optimization: Optional[Dict[str, Any]] = None
    financial_education: Optional[Dict[str, Any]] = None


def build_plan(inputs: PlanInputs) -> Plan:
    warnings: List[str] = []
    assumptions: List[str] = [
        "Emergency fund target uses 3 months of expenses unless otherwise stated.",
        "Debt-to-income uses minimum payments only (not total principal).",
    ]

    user_profile = inputs.user_profile or {}
    has_profile = bool(inputs.user_profile)
    currency_code = _normalize_currency_code(user_profile.get("currency"))

    transactions = user_profile.get("transactions")
    if has_profile and isinstance(transactions, list) and len(transactions) == 0:
        warnings.append("No transactions provided; some metrics may be estimated from profile fields only.")

    monthly_income = None
    annual_income = _safe_float(user_profile.get("annual_income"))
    if annual_income is not None:
        monthly_income = annual_income / 12

    monthly_expenses = _safe_float(user_profile.get("monthly_expenses"))
    savings = _safe_float(user_profile.get("savings"))

    key_metrics = KeyMetrics()

    income_summary = None
    if inputs.income_analysis and not inputs.income_analysis.get("error"):
        income_summary = inputs.income_analysis.get("summary_metrics") if isinstance(inputs.income_analysis, dict) else None

    key_metrics.monthly_net_cash_flow = _round_or_none(
        _pick_first_float(
            (income_summary or {}).get("net_cash_flow"),
            (income_summary or {}).get("monthly_net_flow"),
        )
    )
    key_metrics.savings_rate = _round_or_none(
        _normalize_percent(_pick_first_float((income_summary or {}).get("savings_rate")))
    )

    if key_metrics.monthly_net_cash_flow is None and monthly_income is not None and monthly_expenses is not None:
        key_metrics.monthly_net_cash_flow = _round_or_none(monthly_income - monthly_expenses)

    if (
        key_metrics.savings_rate is None
        and monthly_income is not None
        and monthly_income > 0
        and key_metrics.monthly_net_cash_flow is not None
    ):
        key_metrics.savings_rate = _round_or_none((key_metrics.monthly_net_cash_flow / monthly_income) * 100)

    # Debt metrics
    if inputs.debt_optimization and not inputs.debt_optimization.get("error"):
        current = inputs.debt_optimization.get("current_debt_situation", {})
        if isinstance(current, dict):
            key_metrics.total_debt = _round_or_none(_pick_first_float(current.get("total_debt")))
            key_metrics.debt_to_income = _round_or_none(
                _normalize_percent(_pick_first_float(current.get("debt_to_income_ratio")))
            )
    else:
        debts = user_profile.get("debts") if isinstance(user_profile.get("debts"), list) else []
        total_debt = sum(_safe_float(debt.get("balance")) or 0.0 for debt in debts)
        key_metrics.total_debt = _round_or_none(total_debt)

        if monthly_income is not None and monthly_income > 0:
            total_min_pay = sum(_safe_float(debt.get("minimum_payment")) or 0.0 for debt in debts)
            key_metrics.debt_to_income = _round_or_none((total_min_pay / monthly_income) * 100)

    # Emergency fund runway
    if savings is not None and monthly_expenses is not None and monthly_expenses > 0:
        key_metrics.emergency_fund_months = _round_or_none(savings / monthly_expenses)

    # Executive summary (deterministic)
    if inputs.financial_education and isinstance(inputs.financial_education, dict):
        concept = str(inputs.financial_education.get("concept_explained") or "personal finance")
        executive_summary = f"Educational explanation: {concept}."
        warnings.append("This response is educational and may not reflect a full personalized plan.")
    elif not has_profile:
        executive_summary = "Add your income, expenses, savings, debts, and goals to generate a personalized plan."
        warnings.append("No user profile provided; generated actions are generic.")
    else:
        net_flow = key_metrics.monthly_net_cash_flow
        fund_months = key_metrics.emergency_fund_months
        debt_total = key_metrics.total_debt

        summary_parts: List[str] = []
        if net_flow is not None:
            if net_flow < 0:
                summary_parts.append("Cash flow is negative, so stabilizing spending comes first.")
            elif net_flow == 0:
                summary_parts.append("Cash flow is break-even; small optimizations can unlock savings.")
            else:
                summary_parts.append("Cash flow is positive; you can allocate surplus to goals, debt, and investing.")

        if fund_months is not None:
            if fund_months < 1:
                summary_parts.append("Emergency savings are low relative to expenses.")
            elif fund_months < 3:
                summary_parts.append("Emergency fund is below the typical 3-month target.")
            else:
                summary_parts.append("Emergency fund coverage looks healthy.")

        if debt_total is not None and debt_total > 0:
            summary_parts.append("Debt exists; prioritize high-interest balances while maintaining minimum payments.")

        executive_summary = " ".join(summary_parts) if summary_parts else "Here is a structured plan based on your data."

    actions = _build_actions(
        key_metrics=key_metrics,
        user_profile=inputs.user_profile,
        budget_plan=inputs.budget_plan,
        debt_optimization=inputs.debt_optimization,
        warnings=warnings,
        currency_code=currency_code,
    )

    return Plan(
        executive_summary=executive_summary,
        key_metrics=key_metrics,
        actions=actions,
        assumptions=assumptions,
        data_warnings=warnings,
    )


def _build_actions(
    *,
    key_metrics: KeyMetrics,
    user_profile: Optional[Dict[str, Any]],
    budget_plan: Optional[Dict[str, Any]],
    debt_optimization: Optional[Dict[str, Any]],
    warnings: List[str],
    currency_code: str,
) -> ActionBuckets:
    buckets = ActionBuckets()
    has_profile = bool(user_profile)

    def infer_kind(item: ActionItem) -> str:
        text = f"{item.title} {item.why}".lower()
        if "debt" in text or "loan" in text or "credit" in text:
            return "debt"
        if "invest" in text or "sip" in text or "portfolio" in text:
            return "invest"
        if "budget" in text or "spend" in text:
            return "budget"
        if "goal" in text:
            return "goal"
        if "learn" in text or "education" in text:
            return "education"
        if "cash flow" in text or "emergency" in text:
            return "cashflow"
        return "generic"

    def add(bucket: List[ActionItem], item: ActionItem, *, bucket_days: int) -> None:
        if item.due_days is None:
            item.due_days = bucket_days
        if not item.id:
            digest = hashlib.sha256(f"{bucket_days}|{item.title}".encode("utf-8")).hexdigest()
            item.id = digest[:12]
        if not item.kind or item.kind == "generic":
            item.kind = infer_kind(item)
        bucket.append(item)

    if not has_profile:
        add(
            buckets.next_7_days,
            ActionItem(
                title="Complete your financial profile",
                why="Accurate recommendations require your income, expenses, savings, debts, and goals.",
                steps=[
                    "Enter annual income and monthly expenses",
                    "Add current savings and outstanding debts",
                    "Add at least 1-2 financial goals with timelines",
                    "Add recent transactions (even a small sample helps)",
                ],
                priority="high",
                expected_impact="Enables a personalized plan instead of generic guidance.",
            ),
            bucket_days=7,
        )
        return buckets

    net_flow = key_metrics.monthly_net_cash_flow
    fund_months = key_metrics.emergency_fund_months
    total_debt = key_metrics.total_debt

    if net_flow is not None and net_flow < 0:
        add(
            buckets.next_7_days,
            ActionItem(
                title="Stabilize monthly cash flow",
                why="Negative cash flow blocks emergency savings, debt payoff, and investing.",
                steps=[
                    "Identify your top 3 expense categories by total amount",
                    "Cut or cap the highest discretionary category first",
                    "Set a weekly spending limit for discretionary categories",
                ],
                priority="high",
                expected_impact="Moves you toward consistent monthly surplus.",
            ),
            bucket_days=7,
        )

    if fund_months is None and user_profile and user_profile.get("monthly_expenses") in (None, 0, "0"):
        warnings.append("Monthly expenses are missing or zero; emergency fund runway cannot be computed.")

    if fund_months is not None and fund_months < 3:
        add(
            buckets.next_30_days,
            ActionItem(
                title="Build an emergency fund buffer",
                why="A buffer reduces the chance of new debt after unexpected expenses.",
                steps=[
                    "Open or designate a high-liquidity savings account for emergencies",
                    "Automate a weekly transfer into the emergency fund",
                    "Avoid investing this portion until you reach your target runway",
                ],
                priority="high",
                expected_impact="Reduces financial fragility and protects long-term goals.",
            ),
            bucket_days=30,
        )

    if total_debt is not None and total_debt > 0:
        method = None
        if debt_optimization and isinstance(debt_optimization, dict):
            recommended = debt_optimization.get("recommended_strategy", {})
            if isinstance(recommended, dict):
                method = str(recommended.get("recommended_method") or "").strip() or None

        method_label = f" ({method})" if method else ""
        add(
            buckets.next_30_days,
            ActionItem(
                title=f"Execute a debt payoff strategy{method_label}",
                why="Reducing high-interest debt typically yields the best risk-free return.",
                steps=[
                    "Pay all minimum payments on time",
                    "Direct extra payments to the highest-interest (avalanche) or smallest-balance (snowball) debt",
                    "Recheck the payoff plan after any income/expense change",
                ],
                priority="high",
                expected_impact="Lowers interest burden and improves cash flow over time.",
            ),
            bucket_days=30,
        )

    # Investing actions (only once cash flow is not clearly negative)
    if net_flow is None or net_flow >= 0:
        add(
            buckets.next_12_months,
            ActionItem(
                title="Automate long-term investing",
                why="Consistency reduces timing risk and builds wealth gradually.",
                steps=[
                    "Confirm your risk tolerance and time horizon",
                    "Choose a diversified core allocation aligned to your risk profile",
                    "Set an automatic monthly investment after essentials and minimum debt payments",
                ],
                priority="medium",
                expected_impact="Builds disciplined, repeatable progress toward long-term goals.",
            ),
            bucket_days=365,
        )

    # Budget plan-specific action (if available)
    if budget_plan and isinstance(budget_plan, dict) and not budget_plan.get("error"):
        savings_plan = budget_plan.get("savings_plan", {})
        monthly_goal_savings = _safe_float(savings_plan.get("total_monthly_savings") if isinstance(savings_plan, dict) else None)
        if monthly_goal_savings is not None and monthly_goal_savings > 0:
            add(
                buckets.next_7_days,
                ActionItem(
                    title="Automate goal savings",
                    why="Automation prevents goal savings from being crowded out by discretionary spending.",
                    steps=[
                        f"Set up an auto-transfer of {_format_currency(monthly_goal_savings, currency_code)} per month toward goals",
                        "Schedule it right after payday",
                        "Review the amount after any budget change",
                    ],
                    priority="medium",
                    expected_impact="Improves consistency of goal progress.",
                ),
                bucket_days=7,
            )

    return buckets


def render_plan_markdown(plan: Plan, currency_code: str = "USD") -> str:
    km = plan.key_metrics

    lines: List[str] = []
    lines.append("FINANCIAL PLAN")
    lines.append("=" * 50)
    lines.append("")
    lines.append("1. Executive summary")
    lines.append(plan.executive_summary.strip())
    lines.append("")
    lines.append("2. Key metrics")
    lines.append("")
    lines.append("| Metric | Value |")
    lines.append("|---|---|")
    lines.append(f"| Monthly net cash flow | {_format_currency(km.monthly_net_cash_flow, currency_code)} |")
    lines.append(f"| Savings rate | {_format_percent(km.savings_rate)} |")
    lines.append(f"| Debt-to-income (min payments) | {_format_percent(km.debt_to_income)} |")
    lines.append(f"| Emergency fund runway | {km.emergency_fund_months:.1f} months |" if km.emergency_fund_months is not None else "| Emergency fund runway | - |")
    lines.append(f"| Total debt | {_format_currency(km.total_debt, currency_code)} |")
    lines.append("")

    lines.append("3. Actions")
    lines.append("")
    lines.extend(_render_action_bucket("Next 7 days", plan.actions.next_7_days))
    lines.extend(_render_action_bucket("Next 30 days", plan.actions.next_30_days))
    lines.extend(_render_action_bucket("Next 12 months", plan.actions.next_12_months))

    if plan.data_warnings:
        lines.append("")
        lines.append("4. Data warnings")
        for warning in plan.data_warnings:
            lines.append(f"- {warning}")

    if plan.assumptions:
        lines.append("")
        lines.append("5. Assumptions")
        for assumption in plan.assumptions:
            lines.append(f"- {assumption}")

    return "\n".join(lines).strip() + "\n"


def _render_action_bucket(title: str, items: List[ActionItem]) -> List[str]:
    if not items:
        return [f"**{title}**", "- (no actions generated)", ""]

    lines: List[str] = [f"**{title}**"]
    for item in items:
        lines.append(f"- **{item.title}** ({item.priority}) - {item.why}")
        for step in item.steps:
            lines.append(f"  - {step}")
        lines.append(f"  - Impact: {item.expected_impact}")
    lines.append("")
    return lines
