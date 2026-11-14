"""
learning/redact.py - PII / amount redaction for anything persisted by the learner
===============================================================================

Replaces money amounts, long digit runs (account / card numbers), e-mails and
phone numbers with stable placeholders.  Free text that reaches the run store,
feedback corrections or exemplar mining always passes through ``redact``.

Placeholders: ``<EMAIL>``, ``<ACCT>``, ``<PHONE>``, ``<AMT>``, ``<NUM>``.
"""

from __future__ import annotations

import re
from typing import Any

_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
# 9+ digits, optionally separated by space/dash (cards, accounts, IBAN-ish, phones handled below)
_LONG_DIGITS = re.compile(r"(?<![\w.])(?:\d[ \-]?){9,}\d(?![\w])")
_PHONE = re.compile(r"(?<!\w)\+\d{1,3}[ \-]?\(?\d{2,4}\)?[ \-]?\d{3,4}[ \-]?\d{3,4}(?!\w)")
_CURRENCY_AMT = re.compile(
    r"(?:(?:₹|\$|€|£|rs\.?|inr|usd|eur|gbp)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|lakh|lakhs|crore|crores|cr|mn|bn))?)"
    r"|(?:\b\d[\d,]*(?:\.\d+)?\s?(?:rupees|dollars|euros|pounds|lakh|lakhs|crore|crores|inr|usd|eur|gbp)\b)",
    re.I,
)
_PERCENT = re.compile(r"\b\d+(?:\.\d+)?\s?%")
_BARE_NUMBER = re.compile(r"(?<![\w<])\d[\d,]*(?:\.\d+)?(?![\w>])")


# Redacts personally identifiable tokens and financial numbers from text strings.
# Substitutes emails, phones, account numbers, currencies, and bare digits.
# Bounds output length safely and guarantees zero exception propagation.
def redact(text: Any, max_length: int = 2000) -> str:
    """Return ``text`` with sensitive tokens replaced.  Never raises."""
    if text is None:
        return ""
    try:
        out = str(text)
    except Exception:
        return ""
    out = out[: max_length * 2]
    out = _EMAIL.sub("<EMAIL>", out)
    out = _PHONE.sub("<PHONE>", out)
    out = _LONG_DIGITS.sub("<ACCT>", out)
    out = _CURRENCY_AMT.sub("<AMT>", out)
    out = _PERCENT.sub("<NUM>", out)
    out = _BARE_NUMBER.sub("<NUM>", out)
    return out[:max_length]


# Detects whether input text contains sensitive information subject to masking.
# Compares original string with redacted variant to identify sensitive tokens.
# Used by prompt proposers and exemplar miners to reject exposed PII text.
def contains_sensitive(text: str) -> bool:
    """True when ``redact`` would change ``text`` (used by tests / exemplar filter)."""
    return redact(text, max_length=max(len(text), 1)) != text
