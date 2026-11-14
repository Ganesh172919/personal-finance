"""
learning/memory_consolidation.py - Periodic per-user memory consolidation
=========================================================================

Builds ONLY on the public ``memory.store.MemoryStore`` API (``get_all`` /
``upsert_many``).  The store has no delete, so consolidation works by adjusting
confidence (retrieval already weights and can filter by confidence):

* merge duplicates   - records that share a normalised value (or a normalised key)
                       collapse onto the strongest/newest one; the others are
                       demoted to ``DEMOTED_CONFIDENCE``.
* decay stale        - inferred memories untouched for ``STALE_DAYS`` lose 10% of
                       their confidence per 30 days (explicit ones at half rate).
* demote contradicted - a later user correction (feedback free text, already
                       redacted) that negates a memory's key words demotes it.

Because ``upsert`` refreshes ``updated_at``, a small ledger (``ai_memory_ledger``)
remembers when each memory was last *user-changed* so decay is applied exactly
once per elapsed period and a refreshed memory restarts its clock.

Everything is scoped by (org_id, user_id); the optimizer job calls
``consolidate_org`` for its own org only.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

from utils.mongo_client import get_mongo_db

logger = logging.getLogger(__name__)

LEDGER = "ai_memory_ledger"
STALE_DAYS = 90
DECAY_PERIOD_DAYS = 30
DECAY_FACTOR = 0.9
CONFIDENCE_FLOOR = 0.1
DEMOTED_CONFIDENCE = 0.05
CONTRADICTED_CONFIDENCE = 0.1
MERGE_BONUS = 0.05

_NEGATION = re.compile(
    r"\b(not|no longer|isn't|isnt|wrong|incorrect|never|don't|dont|doesn't|doesnt|actually|outdated|stopped)\b", re.I
)
_WS = re.compile(r"[\s\-]+")


# Returns current timezone-aware UTC datetime for memory timestamps.
# Standardizes temporal anchor creation across consolidation operations.
# Provides consistent reference clock for staleness and decay calculations.
def _now() -> datetime:
    return datetime.now(timezone.utc)


# Safely parses datetime objects or ISO-8601 strings into UTC datetimes.
# Normalizes timezone representations and handles invalid string formats.
# Returns None when input value is malformed or unparseable.
def _parse(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


# Normalizes memory key string by replacing whitespace and dashes.
# Converts text to lower case and strips boundary whitespace padding.
# Produces consistent identifier tokens for cross-record key deduplication.
def _norm_key(key: str) -> str:
    return _WS.sub("_", (key or "").strip().lower())


# Normalizes memory value text by collapsing consecutive spaces and hyphens.
# Converts input text to lower case and strips leading/trailing blanks.
# Enables fuzzy semantic duplicate matching across stored memory facts.
def _norm_value(value: str) -> str:
    return _WS.sub(" ", (value or "").strip().lower())


# Extracts meaningful alphanumeric word tokens from memory key strings.
# Filters out short connector particles with length strictly under four characters.
# Supplies vocabulary words for contradiction matching against feedback text.
def _key_tokens(key: str) -> List[str]:
    return [t for t in re.split(r"[_\W]+", (key or "").lower()) if len(t) >= 4]


# Lazily instantiates default MemoryStore implementation on demand.
# Avoids unnecessary module loading during standalone testing environments.
# Returns fresh MemoryStore instance connected to standard memory backend.
def _default_store() -> Any:
    from memory.store import MemoryStore

    return MemoryStore()


# Fetches chronological user feedback corrections scoped by tenant and user.
# Extracts correction strings and creation timestamps from RunStore.
# Returns list of tuples holding parsed UTC datetimes and lowercase corrections.
def _corrections(org_id: str, user_id: str) -> List[Tuple[datetime, str]]:
    try:
        from .run_store import RunStore

        rows = RunStore.for_org(org_id).feedback(limit=500, extra={"user_id": user_id})
    except Exception:
        return []
    out = []
    for row in rows:
        text = (row.get("correction") or "").strip()
        when = _parse(row.get("created_at"))
        if text and when is not None:
            out.append((when, text.lower()))
    return out


# Evaluates whether stored memory key or value is negated by subsequent corrections.
# Searches for negation keywords and overlapping token sequences in user edits.
# Returns true if valid contradiction is detected postdating the memory anchor.
def _contradicted(key: str, value: str, anchor: datetime, corrections: Iterable[Tuple[datetime, str]]) -> bool:
    tokens = _key_tokens(key)
    value_norm = _norm_value(value)
    for when, text in corrections:
        if when <= anchor or not _NEGATION.search(text):
            continue
        if tokens and any(t in text for t in tokens):
            return True
        if len(value_norm) >= 5 and value_norm in text:
            return True
    return False


# Runs periodic memory consolidation routine for a specified user and organization.
# Merges semantic duplicates, decays inactive memories, and flags contradictions.
# Persists adjusted confidence scores and updates temporal tracking ledger.
def consolidate_user(
    org_id: str,
    user_id: str,
    *,
    store: Any = None,
    corrections: Optional[List[Tuple[datetime, str]]] = None,
    now: Optional[datetime] = None,
    apply: bool = True,
) -> Dict[str, Any]:
    """Consolidate one user's memories.  Returns a report of what changed."""
    if not org_id or not user_id:
        raise ValueError("org_id and user_id are required")
    store = store or _default_store()
    now = now or _now()
    records = store.get_all(org_id=org_id, user_id=user_id, limit=500)
    report: Dict[str, Any] = {"examined": len(records), "merged": [], "decayed": [], "contradicted": [], "applied": apply}
    if not records:
        return report

    ledger_col = get_mongo_db()[LEDGER]
    ledger = {d["key"]: d for d in ledger_col.find({"org_id": org_id, "user_id": user_id})}
    corr = corrections if corrections is not None else _corrections(org_id, user_id)

    # Working copy: key -> [value, confidence, source, anchor, decayed_through, changed]
    state: Dict[str, Dict[str, Any]] = {}
    for rec in records:
        updated = _parse(rec.updated_at) or now
        led = ledger.get(rec.key)
        led_touched = _parse(led.get("touched_at")) if led else None
        if led is None or led_touched is None or updated > led_touched + timedelta(seconds=2):
            anchor = updated
            decayed_through = anchor + timedelta(days=STALE_DAYS)
        else:
            anchor = _parse(led.get("anchor")) or updated
            decayed_through = _parse(led.get("decayed_through")) or anchor + timedelta(days=STALE_DAYS)
        state[rec.key] = {
            "value": rec.value,
            "confidence": float(rec.confidence),
            "source": rec.source,
            "anchor": anchor,
            "decayed_through": decayed_through,
            "updated": updated,
            "changed": False,
        }

    # Lowers memory confidence score to specified ceiling value if currently higher.
    # Mutates internal state confidence and flags record as modified.
    # Used for duplicate deprecation, decay ceilings, and contradiction penalties.
    def demote(key: str, ceiling: float) -> None:
        item = state[key]
        if item["confidence"] > ceiling:
            item["confidence"] = ceiling
            item["changed"] = True

    # 1) duplicates by normalised value, then by normalised key
    # Selects winning representative memory key from a group of duplicates.
    # Prioritizes highest confidence rating followed by most recent timestamp.
    # Returns optimal key chosen to retain merged confidence boost.
    def winner(keys: List[str]) -> str:
        return max(keys, key=lambda k: (state[k]["confidence"], state[k]["updated"]))

    for grouping, label in (
        (lambda k: _norm_value(state[k]["value"]), "value"),
        (lambda k: _norm_key(k), "key"),
    ):
        groups: Dict[str, List[str]] = {}
        for k in state:
            if state[k]["confidence"] <= DEMOTED_CONFIDENCE:
                continue
            groups.setdefault(grouping(k), []).append(k)
        for members in groups.values():
            if len(members) < 2:
                continue
            best = winner(members)
            for k in members:
                if k != best:
                    demote(k, DEMOTED_CONFIDENCE)
            top = state[best]
            bumped = min(1.0, top["confidence"] + MERGE_BONUS)
            if bumped > top["confidence"]:
                top["confidence"] = bumped
                top["changed"] = True
            report["merged"].append({"kept": best, "demoted": [k for k in members if k != best], "by": label})

    # 2) contradiction by later corrections
    for k, item in state.items():
        if item["confidence"] > CONTRADICTED_CONFIDENCE and _contradicted(k, item["value"], item["anchor"], corr):
            demote(k, CONTRADICTED_CONFIDENCE)
            report["contradicted"].append(k)

    # 3) decay stale
    for k, item in state.items():
        if item["confidence"] <= CONFIDENCE_FLOOR:
            continue
        start = max(item["decayed_through"], item["anchor"] + timedelta(days=STALE_DAYS))
        if now <= start:
            continue
        periods = (now - start).total_seconds() / (DECAY_PERIOD_DAYS * 86400.0)
        rate = 1.0 if item["source"] == "inferred" else 0.5
        new_conf = max(CONFIDENCE_FLOOR, item["confidence"] * (DECAY_FACTOR ** (periods * rate)))
        item["decayed_through"] = now
        if new_conf < item["confidence"] - 0.01:
            item["confidence"] = round(new_conf, 4)
            item["changed"] = True
            report["decayed"].append(k)

    changed = [(k, v) for k, v in state.items() if v["changed"]]
    report["changedKeys"] = [k for k, _ in changed]
    if not apply or not changed:
        return report

    store.upsert_many(
        org_id=org_id,
        user_id=user_id,
        records=[(k, v["value"], round(float(v["confidence"]), 4), v["source"]) for k, v in changed],
    )
    touched = _now()
    for k, v in state.items():
        ledger_col.update_one(
            {"org_id": org_id, "user_id": user_id, "key": k},
            {
                "$set": {
                    "anchor": v["anchor"],
                    "decayed_through": v["decayed_through"],
                    # unchanged records keep their original updated_at as the touch marker
                    "touched_at": touched if v["changed"] else v["updated"],
                }
            },
            upsert=True,
        )
    return report


# Orchestrates memory consolidation across active users within an organization.
# Identifies recent users from RunStore and executes consolidation per user.
# Returns aggregated summary report of processed users and mutated memory keys.
def consolidate_org(org_id: str, *, store: Any = None, max_users: int = 50) -> Dict[str, Any]:
    """Consolidate users that have recent runs in ``org_id`` (org-scoped reads only)."""
    from .run_store import RunStore, days_ago

    runs = RunStore.for_org(org_id).runs(since=days_ago(30), limit=2000)
    users = []
    for run in runs:
        uid = run.get("user_id")
        if uid and uid not in users:
            users.append(uid)
        if len(users) >= max_users:
            break
    reports = {}
    for uid in users:
        try:
            reports[uid] = consolidate_user(org_id, uid, store=store)
        except Exception as exc:
            logger.debug("memory_consolidation_failed: %s", exc)
    return {"orgId": org_id, "users": len(reports), "changed": sum(len(r.get("changedKeys", [])) for r in reports.values())}
