from fastapi.testclient import TestClient

import api_service


def test_internal_transport_rejects_missing_and_incorrect_tokens(monkeypatch):
    monkeypatch.setattr(api_service, "_INTERNAL_TOKEN", "synthetic-unit-service-token")
    with TestClient(api_service.app) as client:
        assert client.get("/api/ai/models").status_code == 401
        assert client.get("/api/ai/models", headers={"X-Internal-Token": "wrong"}).status_code == 401
        assert client.get("/health").status_code == 200


def test_internal_transport_accepts_the_matching_gateway_token(monkeypatch):
    monkeypatch.setattr(api_service, "_INTERNAL_TOKEN", "synthetic-unit-service-token")
    with TestClient(api_service.app) as client:
        response = client.get("/api/ai/models", headers={"X-Internal-Token": "synthetic-unit-service-token"})
        assert response.status_code == 200
