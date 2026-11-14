"""Read-only next steps from the authenticated caller's current saved records."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from utils.activity_signals import extract_activity_signals
from utils.agent_helpers import get_currency_code
from utils.follow_through_ranking import rank_follow_through_signals
from utils.metric_answers import _nonnegative
from utils.preference_learning import learn_preferences_from_feedback


# Escapes markdown punctuation characters to avoid unexpected formatting.
# Normalizes consecutive whitespace and truncates string to length limit.
# Returns sanitized string literal safe for inclusion in markdown text.
def _literal(value: Any, limit: int = 180) -> str:
    text = " ".join(str(value or "").split())[:limit]
    return re.sub(r"([\\`*_{}\[\]()<>#!|])", r"\\\1", text)


# Determines whether user query asks for next steps or task reviews.
# Checks for keywords referencing platform tasks, goals, and follow-through.
# Returns boolean flag indicating intent to receive activity review answer.
def wants_activity_review(question: str) -> bool:
    query = str(question or "").split("\n\nAttached workspace files:", 1)[0]
    if re.search(r"\b(?:pdf|document|file|receipt|contract|statement)\b", query, re.I):
        return False
    return bool(
        re.search(r"\b(?:my|saved|platform)\b", query, re.I)
        and re.search(r"\b(?:goals?|tasks?|activity|priorities|next steps|follow[- ]?through)\b", query, re.I)
        and re.search(r"what should|what can i do this week|work on next|do next|prioriti[sz]e|next steps|suggest(?:\s+(?:one|a|single))?\s+next\s+step|summari[sz]e|review|follow[- ]?through", query, re.I)
    )


# Extracts bounded list of dictionary rows from input collection safely.
# Filters out non-dictionary entries and bounds size to requested limit.
# Returns clean list of dictionary records ready for activity evaluation.
def _rows(value: Any, limit: int) -> list[dict[str, Any]]:
    return [row for row in value[:limit] if isinstance(row, dict)] if isinstance(value, list) else []


# Generates deterministic structured markdown review of pending actions.
# Sorts open tasks by urgency, details goal progress, and ranks signals.
# Returns formatted markdown string summarizing user next steps and actions.
def activity_review_answer(question: str, profile: dict[str, Any] | None,
                           context: dict[str, Any] | None) -> str:
    if not wants_activity_review(question) or not isinstance(context, dict):
        return ""
    currency = get_currency_code(profile or {})
    one_step = bool(re.search(r"\b(?:one|single)\s+next\s+step\b", question, re.I))
    as_of = str(context.get("as_of") or "")[:10]
    try:
        datetime.strptime(as_of, "%Y-%m-%d")
    except ValueError:
        as_of = ""
    lines = ["## Your next step" if one_step else "## Your next steps", "Based on the saved records available to this request"
             + (f" as of {as_of} (UTC)." if as_of else ".")]

    # 1. Open Tasks (Strict preservation of overdue-first order, status filtering, and markdown escaping)
    tasks = [task for task in _rows(context.get("tasks"), 8)
             if task.get("title") and task.get("status", "open") == "open"]
    def task_order(task):
        due = str(task.get("due_date") or "")[:10]
        try:
            datetime.strptime(due, "%Y-%m-%d")
        except ValueError:
            due = ""
        return (0 if due and as_of and due < as_of else 1,
                {"high": 0, "medium": 1, "low": 2}.get(task.get("priority"), 1), due or "9999")

    tasks.sort(key=task_order)
    lines.append("### Open tasks")
    if tasks:
        for task in tasks[:1 if one_step else 3]:
            due = str(task.get("due_date") or "")[:10]
            try:
                datetime.strptime(due, "%Y-%m-%d")
            except ValueError:
                due = ""
            timing = f"; {'overdue since' if as_of and due < as_of else 'due'} {due} (UTC)" if due else "; no due date saved"
            lines.append(f"- **{_literal(task['title'])}** ({_literal(task.get('priority', 'medium'))} priority{timing})."
                         + (f" {_literal(task.get('why'), 240)}" if task.get("why") else ""))
        lines.append("Start with the first task above; overdue items come before priority and due date. [Open tasks](/tasks)")
        if one_step:
            lines.append("This is a bounded snapshot of saved records. No task or financial record has been changed.")
            return "\n\n".join(lines)
    else:
        lines.append("No open tasks were supplied. [Open tasks](/tasks) to add or review a next step.")

    # 2. Goal Progress
    goals = [goal for goal in _rows(context.get("goals"), 20) if goal.get("name")]
    lines.append("### Goal progress")
    incomplete = []
    for goal in goals:
        target, current = _nonnegative(goal.get("target")), _nonnegative(goal.get("current"))
        if target is not None and current is not None and current >= target:
            continue
        incomplete.append((goal, target, current))
    for goal, target, current in incomplete[:1 if one_step else 3]:
        progress = (f"{currency} {current:,.2f} saved toward {currency} {target:,.2f}; "
                    f"{currency} {max(0, target - current):,.2f} remaining"
                    if target is not None and current is not None else "progress is incomplete; update the saved amounts")
        deadline = str(goal.get("deadline") or "")[:10]
        try:
            datetime.strptime(deadline, "%Y-%m-%d")
        except ValueError:
            deadline = ""
        lines.append(f"- **{_literal(goal['name'])}**: {progress}" + (f"; deadline {deadline}" if deadline else "") + ".")
    if not incomplete:
        lines.append("The supplied goals have reached their targets." if goals else "No saved goals were supplied.")
    lines.append("[Review goals](/goals-debts). Choose a contribution after reviewing your budget; no money has been moved.")
    if one_step:
        lines.append("This is a bounded snapshot of saved records. No task or financial record has been changed.")
        return "\n\n".join(lines)

    # 3. Broader Activity Signals & History-Aware Ranking (when broader context is present)
    has_budgets = bool(context.get("budgets") or context.get("budget_envelopes"))
    has_reminders = bool(context.get("reminders"))
    has_debts = bool(context.get("debts") or (profile and profile.get("debts")))
    has_recurring = bool(context.get("recurring"))

    if has_budgets or has_reminders or has_debts or has_recurring:
        # Extract and rank broader signals
        signals = extract_activity_signals(context, profile)
        pref_data = learn_preferences_from_feedback(context.get("feedback_history"))
        focus_domains = (profile.get("preferences") or {}).get("focus_domains") if profile else None
        ranked_signals = rank_follow_through_signals(
            signals,
            domain_affinities=pref_data.get("domain_affinities"),
            focus_domains=focus_domains,
            dismissed_signal_ids=pref_data.get("dismissed_signal_ids"),
            limit=5,
        )

        non_task_signals = [s for s in ranked_signals if s.get("domain") not in {"task", "goal"}]
        if non_task_signals:
            lines.append("### Immediate financial attention")
            for sig in non_task_signals[:3]:
                domain = sig.get("domain", "").title()
                score = sig.get("priority_score", 0)
                url = sig.get("action_url", "/tasks")
                lines.append(f"- **[{domain}] {_literal(sig['title'])}** (Urgency Score: {score:.1f}/100). {_literal(sig['description'])} [{_literal(domain)} review]({url})")

    lines.append("This is a bounded snapshot of saved records, not a complete activity history. Completed tasks are excluded.")
    return "\n\n".join(lines)
