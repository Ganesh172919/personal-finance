"""
finwise_server.py - FinWise Server Communication Client
========================================================

Provides HTTP client functions for communicating with the FinWise
Node.js/Express backend server.  Used primarily for **tool call
validation** -- before surfacing automation suggestions to the user,
the AI Core simulates the tool call against the server to check
RBAC permissions and eligibility.

Functions
---------
- ``simulate_tool_call()`` -- sends a tool call to the server's
  ``/api/internal/tools/simulate`` endpoint for validation.
- ``fetch_tool_catalog()`` -- retrieves the list of available tools
  from the server (unused currently, but available for future use).

Design decisions
----------------
- Uses a shared, pooled ``httpx.Client`` (keep-alive, thread-safe) instead of
  blocking ``urllib`` calls that open a new connection per tool simulation.
- Timeouts are short (1.5-2s) to avoid blocking the AI response when
  the server is slow or unreachable -- connectivity failures are
  silently caught by the caller.
"""

from __future__ import annotations

import json
import logging
import threading
from typing import Any, Dict, Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)


# Encapsulates HTTP client errors returned by the FinWise backend server.
# Preserves HTTP status code, internal error code, and response body.
# Enables callers to handle authorization or validation failures gracefully.
class FinWiseServerHttpError(RuntimeError):
    """Structured HTTP error from the FinWise server.

    Carries ``status_code``, ``code``, and ``message`` so the caller
    can make informed decisions (e.g. 401/403 means skip validation).
    """
    # Initializes structured FinWise HTTP error instance with error details.
    # Constructs descriptive exception message combining status and code.
    # Stores parsed error properties for downstream inspection and handling.
    def __init__(
        self,
        *,
        status_code: int,
        code: Optional[str],
        message: Optional[str],
        body: str,
    ):
        super().__init__(f"HTTP {status_code} {code or ''} {message or ''}".strip())
        self.status_code = status_code
        self.code = code
        self.message = message
        self.body = body


# Joins base URL and relative endpoint path safely into unified URL string.
# Strips extraneous trailing and leading forward slashes from components.
# Returns clean fully-qualified endpoint URL for HTTP client dispatch.
def _join_url(base: str, path: str) -> str:
    base_clean = (base or "").strip().rstrip("/")
    path_clean = "/" + (path or "").strip().lstrip("/")
    return base_clean + path_clean


_client: Optional[httpx.Client] = None
_client_lock = threading.Lock()


# Returns lazily initialized, thread-safe HTTPX connection-pooled client.
# Configures connection limits, keep-alive pools, and redirect policies.
# Provides reusable singleton client instance across AI Core threads.
def _get_client() -> httpx.Client:
    """Lazily create the process-wide pooled client (httpx.Client is thread-safe)."""
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = httpx.Client(
                    limits=httpx.Limits(max_connections=20, max_keepalive_connections=10, keepalive_expiry=30.0),
                    follow_redirects=False,
                )
    return _client


# Executes JSON HTTP request against backend server handling error status codes.
# Injects authorization bearer tokens, headers, and request tracking IDs.
# Returns parsed JSON response dictionary or raises FinWiseServerHttpError.
def _request_json(
    *,
    method: str,
    url: str,
    token: str,
    payload: Optional[Dict[str, Any]] = None,
    timeout_seconds: float = 2.0,
    request_id: Optional[str] = None,
) -> Dict[str, Any]:
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    if request_id:
        headers["X-Request-Id"] = request_id

    resp = _get_client().request(
        method.upper(),
        url,
        content=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers=headers,
        timeout=timeout_seconds,
    )

    if resp.status_code >= 400:
        body = resp.text or ""
        code: Optional[str] = None
        message: Optional[str] = None
        try:
            parsed = json.loads(body) if body else None
            if isinstance(parsed, dict):
                code = str(parsed.get("code") or "") or None
                message = str(parsed.get("message") or "") or None
        except Exception:
            code = None
            message = None

        raise FinWiseServerHttpError(
            status_code=int(resp.status_code),
            code=code,
            message=message,
            body=body[:800],
        )

    if not resp.content:
        return {}
    return resp.json()


# Simulates proposed agent tool call against backend validation endpoint.
# Verifies tenant permissions and action parameter eligibility before UI display.
# Returns dictionary containing tool validation results and simulation details.
def simulate_tool_call(
    *,
    org_id: str,
    user_id: str,
    tool_call: Dict[str, Any],
    request_id: Optional[str] = None,
    timeout_seconds: float = 1.5,
) -> Dict[str, Any]:
    server_url = (settings.FINWISE_SERVER_URL or "").strip()
    token = (settings.FINWISE_TOOLS_TOKEN or "").strip()

    if not server_url or not token:
        raise RuntimeError("FINWISE_SERVER_URL / FINWISE_TOOLS_TOKEN not configured.")

    url = _join_url(server_url, "/api/internal/tools/simulate")
    return _request_json(
        method="POST",
        url=url,
        token=token,
        payload={"org_id": org_id, "user_id": user_id, "tool_call": tool_call},
        timeout_seconds=timeout_seconds,
        request_id=request_id,
    )


# Retrieves catalog of available system tools from backend server endpoint.
# Checks server configuration and executes authenticated GET request.
# Returns dictionary describing available tools and capability schemas.
def fetch_tool_catalog(*, request_id: Optional[str] = None, timeout_seconds: float = 1.5) -> Dict[str, Any]:
    server_url = (settings.FINWISE_SERVER_URL or "").strip()
    token = (settings.FINWISE_TOOLS_TOKEN or "").strip()

    if not server_url or not token:
        raise RuntimeError("FINWISE_SERVER_URL / FINWISE_TOOLS_TOKEN not configured.")

    url = _join_url(server_url, "/api/internal/tools/catalog")
    return _request_json(
        method="GET",
        url=url,
        token=token,
        payload=None,
        timeout_seconds=timeout_seconds,
        request_id=request_id,
    )
