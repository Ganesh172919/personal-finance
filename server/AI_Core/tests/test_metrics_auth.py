import asyncio

import pytest
from fastapi import HTTPException

from api_service import metrics


def test_metrics_disabled_when_token_missing(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("AI_CORE_METRICS_TOKEN", raising=False)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(metrics(authorization=None))

    assert exc.value.status_code == 404


def test_metrics_requires_bearer_token(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AI_CORE_METRICS_TOKEN", "secret-token")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(metrics(authorization=None))
    assert exc.value.status_code == 403

    with pytest.raises(HTTPException) as exc:
        asyncio.run(metrics(authorization="Bearer wrong-token"))
    assert exc.value.status_code == 403

    response = asyncio.run(metrics(authorization="Bearer secret-token"))
    assert response.status_code == 200

