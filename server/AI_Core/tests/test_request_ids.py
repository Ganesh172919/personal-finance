"""Request-id / traceparent validation and the HTTP middleware that uses it."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from utils.request_ids import parse_traceparent, sanitize_request_id

GOOD_TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"


@pytest.mark.parametrize(
    "value",
    ["req-1234567890", "3f2b8c1e-8c5d-4c3a-9f0a-0123456789ab", "a" * 32, "gateway:req.1_2-3abc"],
)
def test_valid_request_ids_pass_through(value):
    assert sanitize_request_id(value) == (value, False)


@pytest.mark.parametrize(
    "value",
    ["short", "has space in it", "bad\r\nInjected: header", "x" * 129, "-leading-dash-id", "emoji-\u2603-id-123"],
)
def test_malformed_request_ids_are_replaced(value):
    rid, replaced = sanitize_request_id(value)
    assert replaced is True
    assert rid != value
    assert len(rid) == 36  # fresh uuid4


def test_missing_request_id_generates_one_without_flagging():
    rid, replaced = sanitize_request_id(None)
    assert replaced is False and len(rid) == 36
    assert sanitize_request_id("   ")[1] is False


def test_parse_traceparent():
    assert parse_traceparent(GOOD_TRACEPARENT) == ("4bf92f3577b34da6a3ce929d0e0e4736", "00f067aa0ba902b7")
    assert parse_traceparent(GOOD_TRACEPARENT.upper()) is not None
    for bad in (
        None,
        "",
        "garbage",
        "00-" + "0" * 32 + "-00f067aa0ba902b7-01",
        "00-4bf92f3577b34da6a3ce929d0e0e4736-" + "0" * 16 + "-01",
        "ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7",
    ):
        assert parse_traceparent(bad) is None


def test_middleware_echoes_valid_and_replaces_malformed_ids(monkeypatch):
    monkeypatch.delenv("AI_CORE_INTERNAL_TOKEN", raising=False)
    import api_service

    monkeypatch.setattr(api_service, "_INTERNAL_TOKEN", "")
    client = TestClient(api_service.app)

    ok = client.get("/health", headers={"X-Request-Id": "req-abcdef123456", "traceparent": GOOD_TRACEPARENT})
    assert ok.headers["X-Request-Id"] == "req-abcdef123456"

    bad = client.get("/health", headers={"X-Request-Id": "bad id with spaces"})
    assert bad.headers["X-Request-Id"] != "bad id with spaces"
    assert len(bad.headers["X-Request-Id"]) == 36

    none = client.get("/health")
    assert len(none.headers["X-Request-Id"]) == 36
