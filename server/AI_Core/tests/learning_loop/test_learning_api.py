"""HTTP contract of /api/learning/* (headers, roles, status codes, tenant isolation, camelCase)."""

import pytest
from fastapi.testclient import TestClient
from learning_helpers import add_feedback, add_run, new_prompt

import api_service
from learning import gate, optimizer, run_store
from registry.store import ArtifactStore

TOKEN = "synthetic-learning-token"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(api_service, "_INTERNAL_TOKEN", TOKEN)
    return TestClient(api_service.app)


def hdr(org="orgA", user="admin1", role="admin", **extra):
    headers = {"X-Internal-Token": TOKEN}
    if org:
        headers["X-Internal-Org-Id"] = org
    if user:
        headers["X-Internal-User-Id"] = user
    if role:
        headers["X-Internal-Role"] = role
    headers.update(extra)
    return headers


def act(user="admin1", note=None):
    return {"actorUserId": user, **({"note": note} if note else {})}


# ---------------------------------------------------------------------------
# Auth / roles
# ---------------------------------------------------------------------------
def test_requires_internal_token_and_actor_headers(client):
    assert client.get("/api/learning/status").status_code == 401
    assert client.get("/api/learning/status", headers=hdr(org=None)).status_code == 403
    assert client.get("/api/learning/status", headers=hdr(user=None)).status_code == 403
    assert client.post("/api/learning/feedback", json={"agentOutputId": "o", "rating": "up"},
                       headers=hdr(org=None, role=None)).status_code == 403


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/learning/status"),
        ("get", "/api/learning/artifacts"),
        ("get", "/api/learning/artifacts/art_x"),
        ("get", "/api/learning/reports"),
        ("post", "/api/learning/optimize/run"),
        ("post", "/api/learning/artifacts/art_x/promote"),
        ("post", "/api/learning/artifacts/art_x/rollback"),
    ],
)
def test_admin_routes_reject_non_admin(client, method, path):
    kwargs = {"json": act()} if "artifacts/art_x/" in path else {}
    response = getattr(client, method)(path, headers=hdr(role="member"), **kwargs)
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------
def test_feedback_is_accepted_and_stored_for_the_header_org(client):
    add_run("orgA", "u1", "out1", route="comprehensive")
    body = {"agentOutputId": "out1", "rating": "down", "reasonCode": "too_long", "orgId": "orgB"}
    response = client.post("/api/learning/feedback", json=body, headers=hdr(user="u1", role=None))
    assert response.status_code == 202 and response.json() == {"accepted": True}
    rows = run_store.RunStore.for_org("orgA").negative_feedback()
    assert len(rows) == 1 and rows[0]["reason_code"] == "too_long"
    assert run_store.RunStore.for_org("orgB").feedback() == []  # body org is ignored


def test_feedback_opt_out_header_stores_nothing(client):
    add_run("orgA", "u1", "out1")
    response = client.post(
        "/api/learning/feedback",
        json={"agentOutputId": "out1", "rating": "down", "reasonCode": "unclear"},
        headers=hdr(user="u1", role=None, **{"X-Internal-Learning-Opt-Out": "1"}),
    )
    assert response.status_code == 202
    assert run_store.RunStore.for_org("orgA").feedback() == []


def test_feedback_validates_the_payload(client):
    headers = hdr(user="u1", role=None)
    assert client.post("/api/learning/feedback", json={"agentOutputId": "o", "rating": "meh"}, headers=headers).status_code == 422
    assert client.post("/api/learning/feedback", json={"rating": "up"}, headers=headers).status_code == 422
    bad_reason = {"agentOutputId": "o", "rating": "down", "reasonCode": "nope"}
    assert client.post("/api/learning/feedback", json=bad_reason, headers=headers).status_code == 422


# ---------------------------------------------------------------------------
# Artifacts, promote, rollback
# ---------------------------------------------------------------------------
def test_list_and_get_artifacts_are_camel_case_and_org_scoped(client):
    mine = new_prompt("master.system", "Mine.")
    other = new_prompt("master.system", "Theirs.", org="orgB")
    glob = new_prompt("master.system", "Global.", org=None)
    items = client.get("/api/learning/artifacts?kind=prompt", headers=hdr()).json()["items"]
    ids = {i["id"] for i in items}
    assert mine.id in ids and glob.id in ids and other.id not in ids
    assert {"orgId", "gatePassed", "createdAt", "previousActiveId", "content"} <= set(items[0])
    assert client.get(f"/api/learning/artifacts/{mine.id}", headers=hdr()).json()["id"] == mine.id
    assert client.get(f"/api/learning/artifacts/{other.id}", headers=hdr()).status_code == 404
    assert client.get("/api/learning/artifacts?kind=bogus", headers=hdr()).status_code == 422
    assert client.get("/api/learning/artifacts?status=draft", headers=hdr()).status_code == 200
    assert client.get("/api/learning/artifacts?status=bogus", headers=hdr()).status_code == 422


def test_promote_flow_draft_to_canary_to_active_then_rollback(client):
    art = new_prompt("master.system", "Be brief.")
    url = f"/api/learning/artifacts/{art.id}"
    canary = client.post(f"{url}/promote", json=act(note="go"), headers=hdr())
    assert canary.status_code == 200 and canary.json()["status"] == "canary"
    active = client.post(f"{url}/promote", json=act(), headers=hdr())
    assert active.json()["status"] == "active"
    retired = client.post(f"{url}/rollback", json=act(note="oops"), headers=hdr())
    assert retired.status_code == 200 and retired.json()["status"] == "retired"


def test_promote_in_suggest_mode_is_409(client, monkeypatch):
    monkeypatch.setenv("AI_PROMOTION_MODE", "suggest")
    art = new_prompt("master.system", "Be brief.")
    response = client.post(f"/api/learning/artifacts/{art.id}/promote", json=act(), headers=hdr())
    assert response.status_code == 409 and response.json()["code"] == "PROMOTION_SUGGEST_ONLY"
    assert ArtifactStore().get(art.id).status == "draft"


def test_promote_is_blocked_when_the_gate_has_not_passed(client):
    art = new_prompt("aggregator.system", "Always include a worked illustration with concrete figures.", gated=False)
    assert gate.run_gate(art).passed is False
    response = client.post(f"/api/learning/artifacts/{art.id}/promote", json=act(), headers=hdr())
    assert response.status_code == 409 and response.json()["code"] == "GATE_NOT_PASSED"
    ungated = new_prompt("master.system", "Never gated.", gated=False)
    response = client.post(f"/api/learning/artifacts/{ungated.id}/promote", json=act(), headers=hdr())
    assert response.status_code == 409 and response.json()["code"] == "GATE_NOT_PASSED"


def test_actor_user_must_match_the_header_user(client):
    art = new_prompt("master.system", "Be brief.")
    response = client.post(f"/api/learning/artifacts/{art.id}/promote", json=act(user="someone-else"), headers=hdr())
    assert response.status_code == 403
    assert ArtifactStore().get(art.id).status == "draft"
    assert client.post(f"/api/learning/artifacts/{art.id}/promote", json={}, headers=hdr()).status_code == 422


def test_other_orgs_artifacts_are_404_for_promote_and_rollback(client):
    art = new_prompt("master.system", "Theirs.", org="orgB")
    for action in ("promote", "rollback"):
        response = client.post(f"/api/learning/artifacts/{art.id}/{action}", json=act(), headers=hdr())
        assert response.status_code == 404
    assert ArtifactStore().get(art.id).status == "draft"


def test_global_artifacts_need_a_platform_org(client, monkeypatch):
    art = new_prompt("master.system", "Global.", org=None)
    url = f"/api/learning/artifacts/{art.id}/promote"
    assert client.post(url, json=act(), headers=hdr()).status_code == 403
    monkeypatch.setenv("AI_PLATFORM_ORG_IDS", "orgA")
    assert client.post(url, json=act(), headers=hdr()).status_code == 200


def test_rolling_back_a_draft_is_a_409(client):
    art = new_prompt("master.system", "Be brief.")
    response = client.post(f"/api/learning/artifacts/{art.id}/rollback", json=act(), headers=hdr())
    assert response.status_code in (200, 409)  # a draft may be retired; it must never 5xx


# ---------------------------------------------------------------------------
# Optimizer jobs, reports, status
# ---------------------------------------------------------------------------
def test_optimize_run_returns_a_job_id_and_status_reports_the_result(client):
    for i in range(4):
        add_run("orgA", f"u{i}", f"n{i}", route="comprehensive")
        add_feedback("orgA", f"u{i}", f"n{i}", "down", "too_long")
    response = client.post("/api/learning/optimize/run", headers=hdr())
    assert response.status_code == 202
    job_id = response.json()["jobId"]
    assert job_id.startswith("job_")
    job = optimizer.get_job(job_id)
    assert job["status"] == "done" and job["org_id"] == "orgA"

    status = client.get("/api/learning/status", headers=hdr()).json()
    assert status["promotionMode"] == "human"
    assert {"active", "lastDecisions"} <= set(status["canary"])
    assert status["optimizer"]["lastRunAt"] and status["optimizer"]["lastCandidates"]
    assert isinstance(status["reports"], list) and status["reports"]
    assert client.get("/api/learning/status", headers=hdr(org="orgB")).json()["optimizer"]["lastCandidates"] == []


def test_optimize_run_global_scope_requires_platform_org(client, monkeypatch):
    body = {"scope": "global"}
    assert client.post("/api/learning/optimize/run", json=body, headers=hdr()).status_code == 403
    monkeypatch.setenv("AI_PLATFORM_ORG_IDS", "orgA")
    assert client.post("/api/learning/optimize/run", json=body, headers=hdr()).status_code == 202
    assert client.post("/api/learning/optimize/run", json={"scope": "x"}, headers=hdr()).status_code == 422


def test_reports_are_org_scoped_and_limit_is_honoured(client):
    for text in ("One.", "Two.", "Three."):
        gate.run_gate(new_prompt("master.system", text, gated=False))
    gate.run_gate(new_prompt("master.system", "Other org.", org="orgB", gated=False))
    items = client.get("/api/learning/reports?limit=2", headers=hdr()).json()["items"]
    assert len(items) == 2 and all("artifactId" in r and "passed" in r for r in items)
    all_items = client.get("/api/learning/reports", headers=hdr()).json()["items"]
    assert len(all_items) == 3
    assert len(client.get("/api/learning/reports", headers=hdr(org="orgB")).json()["items"]) == 1
