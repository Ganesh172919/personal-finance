from fastapi.testclient import TestClient

from api_service import app
from utils.session_manager import SessionStatus


class _Session:
    def __init__(self, session_id: str, org_id: str, user_id: str):
        self.id = session_id
        self.org_id = org_id
        self.user_id = user_id
        self.status = SessionStatus.PAUSED

    def to_dict(self):
        return {
            "id": self.id,
            "org_id": self.org_id,
            "user_id": self.user_id,
            "status": self.status.value,
        }


class _SessionManager:
    def __init__(self):
        self.owned = _Session("owned", "org-a", "user-a")
        self.other = _Session("other", "org-b", "user-b")
        self.updated = []

    def get_resumable_sessions(self, org_id, user_id, limit):
        return [self.owned] if (org_id, user_id) == ("org-a", "user-a") else []

    def get_session(self, session_id):
        return {"owned": self.owned, "other": self.other}.get(session_id)

    def get_checkpoints(self, *_args, **_kwargs):
        return []

    def get_latest_checkpoint(self, *_args, **_kwargs):
        return None

    def update_session(self, session):
        self.updated.append(session.id)


def _headers(org_id="org-a", user_id="user-a"):
    return {"x-internal-org-id": org_id, "x-internal-user-id": user_id}


def test_session_routes_require_and_enforce_gateway_actor(monkeypatch):
    manager = _SessionManager()
    monkeypatch.setattr("utils.session_manager.get_session_manager", lambda: manager)

    with TestClient(app) as client:
        assert client.get("/api/ai/sessions/owned").status_code == 403

        listing = client.get("/api/ai/sessions", headers=_headers())
        assert listing.status_code == 200
        assert listing.json()["sessions"] == [manager.owned.to_dict()]

        # Query parameters cannot override the actor authenticated by Node.
        spoofed_list = client.get(
            "/api/ai/sessions?org_id=org-b&user_id=user-b",
            headers=_headers(),
        )
        assert spoofed_list.status_code == 403

        # A valid-looking opaque ID owned by another tenant remains invisible.
        assert client.get("/api/ai/sessions/other", headers=_headers()).status_code == 404
        assert client.post("/api/ai/sessions/other/resume", headers=_headers()).status_code == 404

        resumed = client.post("/api/ai/sessions/owned/resume", headers=_headers())
        assert resumed.status_code == 200
        assert manager.updated == ["owned"]
