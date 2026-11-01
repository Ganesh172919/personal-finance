"""Read-only next steps from the authenticated caller's current saved records."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from utils.agent_helpers import get_currency_code
from utils.metric_answers import _nonnegative


def _literal(value: Any, limit: int = 180) -> str:
    text = " ".join(str(value or "").split())[:limit]
    return re.sub(r"([\\`*_{}\[\]()<>#!|])", r"\\\1", text)


def wants_activity_review(question: str) -> bool:
    query = str(question or "").split("\n\nAttached workspace files:", 1)[0]
    if re.search(r"\b(?:pdf|document|file|receipt|contract|statement)\b", query, re.I):
        return False
    return bool(
        re.search(r"\b(?:my|saved|platform)\b", query, re.I)
        and re.search(r"\b(?:goals?|tasks?|activity|priorities|next steps)\b", query, re.I)
        and re.search(r"what should|work on next|do next|prioriti[sz]e|next steps|summari[sz]e|review", query, re.I)
    )


def _rows(value: Any, limit: int) -> list[dict[str, Any]]:
    return [row for row in value[:limit] if isinstance(row, dict)] if isinstance(value, list) else []


def activity_review_answer(question: str, profile: dict[str, Any] | None,
                           context: dict[str, Any] | None) -> str:
    if not wants_activity_review(question) or not isinstance(context, dict):
        return ""
    currency = get_currency_code(profile or {})
    as_of = str(context.get("as_of") or "")[:10]
    try:
        datetime.strptime(as_of, "%Y-%m-%d")
    except ValueError:
        as_of = ""
    lines = ["## Your next steps", "Based on the saved records available to this request"
             + (f" as of {as_of} (UTC)." if as_of else ".")]

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
        for task in tasks[:3]:
            due = str(task.get("due_date") or "")[:10]
            try:
                datetime.strptime(due, "%Y-%m-%d")
            except ValueError:
                due = ""
            timing = f"; {'overdue since' if as_of and due < as_of else 'due'} {due} (UTC)" if due else "; no due date saved"
            lines.append(f"- **{_literal(task['title'])}** ({_literal(task.get('priority', 'medium'))} priority{timing})."
                         + (f" {_literal(task.get('why'), 240)}" if task.get("why") else ""))
        lines.append("Start with the first task above; overdue items come before priority and due date. [Open tasks](/tasks)")
    else:
        lines.append("No open tasks were supplied. [Open tasks](/tasks) to add or review a next step.")

    goals = [goal for goal in _rows(context.get("goals"), 20) if goal.get("name")]
    lines.append("### Goal progress")
    incomplete = []
    for goal in goals:
        target, current = _nonnegative(goal.get("target")), _nonnegative(goal.get("current"))
        if target is not None and current is not None and current >= target:
            continue
        incomplete.append((goal, target, current))
    for goal, target, current in incomplete[:3]:
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
    lines.append("This is a bounded snapshot of saved records, not a complete activity history. Completed tasks are excluded.")
    return "\n\n".join(lines)
