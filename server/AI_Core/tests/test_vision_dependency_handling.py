from fastapi.testclient import TestClient

import api_service
from vision.errors import VisionDependencyError


def test_health_reports_vision_dependency_status():
    with TestClient(api_service.app) as client:
        response = client.get("/health")

    assert response.status_code == 200, response.text
    payload = response.json()

    assert "vision" in payload
    assert isinstance(payload["vision"].get("ready"), bool)
    assert isinstance(payload["vision"].get("missing"), list)


def test_receipt_parse_returns_503_when_vision_dependencies_missing(monkeypatch):
    def _raise_dependency_error(*_args, **_kwargs):
        raise VisionDependencyError("Vision OCR dependencies are unavailable.")

    monkeypatch.setattr(api_service, "ocr_image_to_lines", _raise_dependency_error)

    with TestClient(api_service.app) as client:
        response = client.post(
            "/api/vision/receipts/parse",
            content=b"fake-image-bytes",
            headers={"Content-Type": "application/octet-stream"},
        )

    assert response.status_code == 503, response.text
    assert "Vision OCR dependencies are unavailable" in response.json().get("detail", "")
