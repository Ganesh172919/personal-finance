"""
memory/extract.py - Deterministic Memory Extraction
=====================================================

Extracts user preferences and facts from free-text input using
**deterministic regex patterns** (no LLM calls).  The extracted
memories are persisted in the ``MemoryStore`` and used to enrich
future requests with personalised context.

What it extracts
----------------
- **Risk tolerance** -- phrases like "conservative", "moderate",
  "aggressive" mapped to standardised values.
- **Preferences** -- "I prefer/like/love/avoid/hate ..." patterns.
- **Budgeting style** -- mentions of "envelope" budgeting.
- **Time horizon** -- "in 6 months", "for 3 years" patterns.

Security
--------
- The ``_looks_like_secret()`` guard prevents storing API keys,
  tokens, passwords, or high-entropy strings as memories.
- Empty or whitespace-only inputs are silently skipped.

Returns
-------
List of ``(key, value, confidence, source)`` tuples where:
- ``key`` is the memory category (e.g. "risk_tolerance")
- ``value`` is the extracted value (e.g. "moderate")
- ``confidence`` is a float 0-1 (higher for explicit statements)
- ``source`` is "explicit" or "inferred"
"""

from __future__ import annotations

import re
from typing import List, Tuple

# Maps natural language phrases to standardised risk tolerance values.
_RISK_MAP = {
    "conservative": "low",
    "low risk": "low",
    "low-risk": "low",
    "moderate": "moderate",
    "balanced": "moderate",
    "aggressive": "high",
    "high risk": "high",
    "high-risk": "high",
}


def _looks_like_secret(text: str) -> bool:
    t = (text or "").strip()
    if not t:
        return False
    if re.search(r"\b(api\s*key|token|password|secret)\b", t, flags=re.IGNORECASE):
        return True
    # Long, high-entropy-ish strings.
    if len(t) >= 32 and re.fullmatch(r"[A-Za-z0-9_\-]{32,}", t):
        return True
    return False


def extract_memories(user_input: str) -> List[Tuple[str, str, float, str]]:
    """
    Deterministic memory extraction from user text.

    Returns: list of (key, value, confidence, source)
    """
    text = (user_input or "").strip()
    if not text or _looks_like_secret(text):
        return []

    memories: List[Tuple[str, str, float, str]] = []
    lower = text.lower()

    for phrase, mapped in _RISK_MAP.items():
        if phrase in lower:
            memories.append(("risk_tolerance", mapped, 0.8, "explicit"))
            break

    # Simple preferences.
    pref_match = re.search(r"\b(i\s+(?:prefer|like|love|avoid|hate))\s+(.+)$", text, flags=re.IGNORECASE)
    if pref_match:
        verb = pref_match.group(1).strip().lower()
        value = pref_match.group(2).strip()
        if value and not _looks_like_secret(value):
            key = "preference"
            memories.append((key, f"{verb}: {value[:240]}", 0.7, "explicit"))

    # Envelope budgeting preference.
    if "envelope" in lower or "envelopes" in lower:
        memories.append(("budgeting_style", "envelope", 0.75, "inferred"))

    # Horizon (rough).
    horizon = re.search(r"\b(in|for)\s+(\d{1,2})\s+(months|month|years|year)\b", lower)
    if horizon:
        count = int(horizon.group(2))
        unit = horizon.group(3)
        months = count * (12 if unit.startswith("year") else 1)
        memories.append(("time_horizon_months", str(max(1, months)), 0.65, "inferred"))

    # Deduplicate by key (keep first).
    seen = set()
    unique: List[Tuple[str, str, float, str]] = []
    for rec in memories:
        if rec[0] in seen:
            continue
        seen.add(rec[0])
        unique.append(rec)

    return unique

