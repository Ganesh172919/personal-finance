"""
request_ids.py - Request-id and W3C trace-context validation
=============================================================

The gateway (and nginx) forward ``X-Request-Id`` and ``traceparent`` to AI
Core. Both are attacker-influenced strings that end up in logs and response
headers, so they are validated here: malformed values are replaced (request id)
or ignored (traceparent) rather than echoed.
"""

from __future__ import annotations

import re
from typing import Optional, Tuple
from uuid import uuid4

# Letters, digits and ``._:-``; must start alphanumeric; 8-128 chars. Covers
# UUIDs, nginx ``$request_id`` (32 hex) and gateway ids such as ``req-<uuid>``.
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:\-]{7,127}$")
# W3C trace-context level 1: version-traceid-parentid-flags.
_TRACEPARENT_RE = re.compile(r"^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$")


# Validates and sanitizes incoming HTTP request identifier header values.
# Replaces malformed or empty strings with fresh UUIDs to prevent header injection.
# Returns tuple containing sanitized request ID and boolean replacement indicator.
def sanitize_request_id(raw: Optional[str]) -> Tuple[str, bool]:
    """Return ``(request_id, replaced)``.

    A missing header yields a fresh UUID with ``replaced=False``; a present but
    malformed header yields a fresh UUID with ``replaced=True`` so the caller
    can log it (never log the raw value).
    """
    candidate = (raw or "").strip()
    if not candidate:
        return str(uuid4()), False
    if _REQUEST_ID_RE.match(candidate):
        return candidate, False
    return str(uuid4()), True


# Parses and validates W3C traceparent context header format.
# Checks version specifications, non-zero trace identifiers, and span boundaries.
# Returns tuple of trace ID and parent span ID, or none if header is invalid.
def parse_traceparent(raw: Optional[str]) -> Optional[Tuple[str, str]]:
    """Return ``(trace_id, parent_span_id)`` for a valid traceparent, else None."""
    match = _TRACEPARENT_RE.match((raw or "").strip().lower())
    if not match:
        return None
    version, trace_id, parent_id, _flags = match.groups()
    if version == "ff" or set(trace_id) == {"0"} or set(parent_id) == {"0"}:
        return None
    return trace_id, parent_id
