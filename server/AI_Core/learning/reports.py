"""
learning/reports.py - Unified listing of evaluation reports
===========================================================

Two sources, newest first:

* ``runner``  - JSON files written by ``python -m evals.runner`` into
                ``config.report_dir()`` (``docs/records/evaluations`` by default);
* ``gate``    - promotion-gate reports persisted in Mongo (``ai_eval_reports``).

Summaries only: per-test lists and full metrics stay in the stored report.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

from . import config
from .gate import get_gate_report, list_gate_reports

logger = logging.getLogger(__name__)

_RUNNER_SUMMARY_KEYS = ("id", "source", "createdAt", "passed", "summary", "comparison", "git")


# Reads eval runner JSON report summaries from disk directory in reverse order.
# Filters filesystem documents for runner evaluation source signatures.
# Extracts core summary attributes including git commit details and pass rates.
def _runner_reports(limit: int) -> List[Dict[str, Any]]:
    directory = config.report_dir()
    try:
        names = sorted((n for n in os.listdir(directory) if n.endswith(".json")), reverse=True)
    except OSError:
        return []
    out: List[Dict[str, Any]] = []
    for name in names[:limit]:
        try:
            with open(os.path.join(directory, name), "r", encoding="utf-8") as handle:
                doc = json.load(handle)
        except (OSError, ValueError):
            continue
        if not isinstance(doc, dict) or doc.get("source") != "runner":
            continue
        out.append({k: doc[k] for k in _RUNNER_SUMMARY_KEYS if k in doc})
    return out


# Combines and sorts reports across filesystem runners and MongoDB gates.
# Merges reports respecting caller limit bounds and tenant access rules.
# Returns unified list sorted by creation timestamp in descending order.
def list_reports(limit: int = 20, org_id: Optional[str] = None) -> List[Dict[str, Any]]:
    limit = max(1, min(200, int(limit)))
    merged = _runner_reports(limit) + list_gate_reports(limit, org_id)
    merged.sort(key=lambda r: str(r.get("createdAt", "")), reverse=True)
    return merged[:limit]


# Resolves evaluation report by ID, checking Mongo gate reports then disk files.
# Validates filesystem path boundaries to guard against directory traversal.
# Returns report dictionary or None if requested report cannot be found.
def get_report(report_id: str) -> Optional[Dict[str, Any]]:
    gate = get_gate_report(report_id)
    if gate is not None:
        return gate
    directory = config.report_dir()
    path = os.path.join(directory, f"{report_id}.json")
    if os.path.dirname(os.path.abspath(path)) != os.path.abspath(directory):
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None
