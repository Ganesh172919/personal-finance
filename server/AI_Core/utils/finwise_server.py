from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

from config import settings

logger = logging.getLogger(__name__)


class FinWiseServerHttpError(RuntimeError):
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


def _join_url(base: str, path: str) -> str:
    base_clean = (base or "").strip().rstrip("/")
    path_clean = "/" + (path or "").strip().lstrip("/")
    return base_clean + path_clean


def _request_json(
    *,
    method: str,
    url: str,
    token: str,
    payload: Optional[Dict[str, Any]] = None,
    timeout_seconds: float = 2.0,
    request_id: Optional[str] = None,
) -> Dict[str, Any]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None

    req = urllib.request.Request(url=url, data=data, method=method.upper())
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {token}")
    if request_id:
        req.add_header("X-Request-Id", request_id)

    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
            raw = resp.read()
            if not raw:
                return {}
            return json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        code: Optional[str] = None
        message: Optional[str] = None
        try:
            payload = json.loads(body) if body else None
            if isinstance(payload, dict):
                code = str(payload.get("code") or "") or None
                message = str(payload.get("message") or "") or None
        except Exception:
            code = None
            message = None

        raise FinWiseServerHttpError(
            status_code=int(getattr(exc, "code", 0) or 0),
            code=code,
            message=message,
            body=body[:800],
        ) from exc


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
