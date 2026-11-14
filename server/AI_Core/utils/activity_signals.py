"""
activity_signals.py - Multi-Domain Activity Signal Extraction Engine
====================================================================

Extracts actionable follow-through signals across multiple financial domains:
- Tasks (overdue, due soon, high priority)
- Goals (incomplete progress, approaching target deadlines)
- Budgets (envelope overshoots, elevated spending velocity)
- Calendar Reminders (upcoming bills, liquidity deficit dips within 7-14 days)
- Recurring Rules & Candidates (unreviewed subscription candidates)
- Debts (high APR liabilities, overdue payments)

Each extracted signal contains:
- id: deterministic unique identifier
- domain: task | goal | budget | reminder | recurring | debt
- title: concise headline
- description: actionable context narrative
- urgency: float [0.0, 1.0]
- impact: float [0.0, 1.0]
- action_url: application route for one-click follow-through
- metadata: domain-specific numerical attributes
- is_overdue: boolean indicator
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


# Parses arbitrary date representations into UTC datetime objects.
# Normalizes string input up to 10 characters using standard format.
# Returns timezone-aware UTC datetime instance or None on format error.
def _parse_date(date_val: Any) -> Optional[datetime]:
    if not date_val:
        return None
    date_str = str(date_val)[:10]
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


# Resolves reference timestamp for calculating time deltas and deadlines.
# Parses supplied as_of date falling back to current UTC time.
# Returns timezone-aware datetime instance representing evaluation date.
def _get_current_utc(as_of: Any = None) -> datetime:
    parsed = _parse_date(as_of)
    if parsed:
        return parsed
    return datetime.now(timezone.utc)


# Extracts follow-through priority signals across multiple data domains.
# Analyzes tasks, goals, budgets, reminders, subscriptions, and debts.
# Returns list of structured signal dictionaries with urgency scores.
def extract_activity_signals(
    context: Optional[Dict[str, Any]],
    profile: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Extract candidate follow-through signals across all available data silos."""
    if not isinstance(context, dict):
        return []

    signals: List[Dict[str, Any]] = []
    as_of_dt = _get_current_utc(context.get("as_of"))

    # 1. Open Tasks Domain
    raw_tasks = context.get("tasks")
    if isinstance(raw_tasks, list):
        for task in raw_tasks:
            if not isinstance(task, dict):
                continue
            status = task.get("status", "open")
            if status != "open":
                continue

            title = str(task.get("title") or "").strip()
            if not title:
                continue

            task_id = str(task.get("id") or task.get("_id") or f"task_{abs(hash(title))}")
            priority = str(task.get("priority") or "medium").lower()
            due_dt = _parse_date(task.get("due_date") or task.get("dueDate"))

            is_overdue = bool(due_dt and due_dt < as_of_dt)

            if is_overdue:
                days_overdue = max(1, (as_of_dt - due_dt).days)
                urgency = min(1.0, 0.90 + 0.02 * days_overdue)
            elif due_dt:
                days_until = max(0, (due_dt - as_of_dt).days)
                if days_until <= 3:
                    urgency = 0.85
                elif days_until <= 7:
                    urgency = 0.70
                else:
                    urgency = 0.50
            else:
                urgency = 0.60 if priority == "high" else (0.45 if priority == "medium" else 0.30)

            # Impact based on priority / bucket
            if priority == "high":
                impact = 0.80
            elif priority == "medium":
                impact = 0.55
            else:
                impact = 0.35

            signals.append({
                "id": f"task:{task_id}",
                "domain": "task",
                "title": title,
                "description": str(task.get("why") or f"Task priority: {priority}").strip(),
                "urgency": round(urgency, 3),
                "impact": round(impact, 3),
                "action_url": "/tasks",
                "is_overdue": is_overdue,
                "due_date": due_dt.strftime("%Y-%m-%d") if due_dt else None,
                "metadata": {
                    "priority": priority,
                    "task_id": task_id,
                },
            })

    # 2. Goal Progress Domain
    raw_goals = context.get("goals") or (profile.get("goals") if isinstance(profile, dict) else None)
    if isinstance(raw_goals, list):
        for goal in raw_goals:
            if not isinstance(goal, dict):
                continue
            name = str(goal.get("name") or "").strip()
            if not name:
                continue

            try:
                target = float(goal.get("target") or 0)
                current = float(goal.get("current") or 0)
            except (ValueError, TypeError):
                continue

            if target <= 0 or current >= target:
                continue  # Target met or invalid

            remaining = target - current
            progress_pct = (current / target) * 100.0 if target > 0 else 0.0
            goal_id = str(goal.get("id") or goal.get("_id") or f"goal_{abs(hash(name))}")

            deadline_dt = _parse_date(goal.get("deadline"))
            is_overdue = bool(deadline_dt and deadline_dt < as_of_dt)

            if is_overdue:
                urgency = 0.88
            elif deadline_dt:
                days_left = max(1, (deadline_dt - as_of_dt).days)
                if days_left <= 30:
                    urgency = 0.75
                elif days_left <= 90:
                    urgency = 0.60
                else:
                    urgency = 0.40
            else:
                urgency = 0.45

            # Impact scaled by target magnitude
            impact = min(1.0, max(0.40, math.log10(max(100.0, target)) / 5.0))

            signals.append({
                "id": f"goal:{goal_id}",
                "domain": "goal",
                "title": f"Fund Goal: {name}",
                "description": f"{remaining:,.2f} remaining to reach target ({progress_pct:.1f}% funded).",
                "urgency": round(urgency, 3),
                "impact": round(impact, 3),
                "action_url": "/goals-debts",
                "is_overdue": is_overdue,
                "due_date": deadline_dt.strftime("%Y-%m-%d") if deadline_dt else None,
                "metadata": {
                    "target": target,
                    "current": current,
                    "remaining": remaining,
                    "progress_pct": round(progress_pct, 1),
                },
            })

    # 3. Budget Envelopes Domain (Overshoots & Elevated Velocity)
    budgets_obj = context.get("budgets")
    envelopes = []
    if isinstance(budgets_obj, dict):
        envelopes = budgets_obj.get("top_envelopes") or budgets_obj.get("envelopes") or []
    elif isinstance(context.get("budget_envelopes"), list):
        envelopes = context.get("budget_envelopes")

    if isinstance(envelopes, list):
        for env in envelopes:
            if not isinstance(env, dict):
                continue
            category = str(env.get("category") or env.get("name") or "").strip()
            if not category:
                continue

            try:
                allocated = float(env.get("allocated") or env.get("budget") or 0)
                spent = float(env.get("spent") or 0)
            except (ValueError, TypeError):
                continue

            if allocated <= 0:
                continue

            burn_ratio = spent / allocated
            if burn_ratio > 1.0:
                overshoot = spent - allocated
                urgency = min(1.0, 0.85 + 0.15 * min(1.0, (burn_ratio - 1.0) / 0.5))
                impact = min(1.0, 0.70 + 0.30 * min(1.0, overshoot / 500.0))
                signals.append({
                    "id": f"budget_overshoot:{category.lower().replace(' ', '_')}",
                    "domain": "budget",
                    "title": f"Budget Blown: {category}",
                    "description": f"Exceeded allocation by {overshoot:,.2f} ({burn_ratio * 100:.0f}% spent).",
                    "urgency": round(urgency, 3),
                    "impact": round(impact, 3),
                    "action_url": "/budgets",
                    "is_overdue": False,
                    "due_date": None,
                    "metadata": {
                        "category": category,
                        "allocated": allocated,
                        "spent": spent,
                        "overshoot": overshoot,
                        "burn_ratio": round(burn_ratio, 2),
                    },
                })
            elif burn_ratio >= 0.85:
                # Warning pace
                signals.append({
                    "id": f"budget_pace:{category.lower().replace(' ', '_')}",
                    "domain": "budget",
                    "title": f"High Burn Velocity: {category}",
                    "description": f"{burn_ratio * 100:.0f}% of budget consumed with days remaining.",
                    "urgency": 0.65,
                    "impact": 0.55,
                    "action_url": "/budgets",
                    "is_overdue": False,
                    "due_date": None,
                    "metadata": {
                        "category": category,
                        "allocated": allocated,
                        "spent": spent,
                        "burn_ratio": round(burn_ratio, 2),
                    },
                })

    # 4. Calendar Reminders & Upcoming Bills Domain
    reminders = context.get("reminders")
    if isinstance(reminders, list):
        for rem in reminders:
            if not isinstance(rem, dict):
                continue
            title = str(rem.get("title") or "").strip()
            if not title:
                continue
            rem_id = str(rem.get("id") or rem.get("_id") or f"rem_{abs(hash(title))}")
            rem_dt = _parse_date(rem.get("date") or rem.get("dueDate"))

            is_overdue = bool(rem_dt and rem_dt < as_of_dt)

            if is_overdue:
                urgency = 0.92
            elif rem_dt:
                days_away = (rem_dt - as_of_dt).days
                if days_away <= 2:
                    urgency = 0.88
                elif days_away <= 7:
                    urgency = 0.72
                elif days_away <= 14:
                    urgency = 0.55
                else:
                    urgency = 0.35
            else:
                urgency = 0.50

            signals.append({
                "id": f"reminder:{rem_id}",
                "domain": "reminder",
                "title": f"Bill/Reminder: {title}",
                "description": str(rem.get("description") or f"Scheduled financial reminder for {rem.get('date') or 'upcoming'}").strip(),
                "urgency": round(urgency, 3),
                "impact": 0.60,
                "action_url": "/calendar",
                "is_overdue": is_overdue,
                "due_date": rem_dt.strftime("%Y-%m-%d") if rem_dt else None,
                "metadata": {
                    "reminder_id": rem_id,
                },
            })

    # 5. Recurring Candidate Detection
    recurring_obj = context.get("recurring")
    if isinstance(recurring_obj, dict):
        candidates = recurring_obj.get("candidates") or []
        for cand in candidates:
            if not isinstance(cand, dict):
                continue
            merchant = str(cand.get("merchant") or cand.get("name") or "").strip()
            if not merchant:
                continue
            cand_id = str(cand.get("candidate_id") or cand.get("id") or f"rec_{abs(hash(merchant))}")
            occurrences = int(cand.get("occurrences") or 1)
            confidence = float(cand.get("confidence") or 0.8)

            signals.append({
                "id": f"recurring:{cand_id}",
                "domain": "recurring",
                "title": f"Review Subscription: {merchant}",
                "description": f"Detected recurring charge with {occurrences} occurrences ({confidence:.0%} confidence).",
                "urgency": 0.52,
                "impact": 0.48,
                "action_url": "/finance?tab=recurring",
                "is_overdue": False,
                "due_date": None,
                "metadata": {
                    "merchant": merchant,
                    "occurrences": occurrences,
                    "confidence": confidence,
                },
            })

    # 6. Structured Debts Domain
    raw_debts = context.get("debts") or (profile.get("debts") if isinstance(profile, dict) else None)
    if isinstance(raw_debts, list):
        for debt in raw_debts:
            if not isinstance(debt, dict):
                continue
            name = str(debt.get("name") or debt.get("creditor") or "").strip()
            if not name:
                continue
            debt_id = str(debt.get("id") or debt.get("_id") or f"debt_{abs(hash(name))}")
            balance = float(debt.get("balance") or debt.get("amount") or 0)
            if balance <= 0:
                continue

            apr = float(debt.get("interest_rate") or debt.get("apr") or 0)
            is_high_apr = apr >= 15.0

            urgency = min(1.0, 0.70 + 0.25 * (apr / 30.0)) if is_high_apr else 0.50
            impact = min(1.0, 0.65 + 0.35 * min(1.0, balance / 5000.0))

            signals.append({
                "id": f"debt:{debt_id}",
                "domain": "debt",
                "title": f"Pay Down Debt: {name}",
                "description": f"Balance of {balance:,.2f} at {apr:.1f}% APR. Prioritizing saves compounding interest.",
                "urgency": round(urgency, 3),
                "impact": round(impact, 3),
                "action_url": "/goals-debts",
                "is_overdue": False,
                "due_date": None,
                "metadata": {
                    "balance": balance,
                    "apr": apr,
                },
            })

    return signals
