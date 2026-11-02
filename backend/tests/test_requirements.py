"""Tests for the requirements router (Phase 2)."""
from __future__ import annotations

import pytest


# ── helpers ──────────────────────────────────────────────────────────────────

def make_project(client, name="Req Test Project"):
    return client.post(
        "/api/projects",
        json={
            "name": name,
            "clientName": "Test Client",
            "ownerId": "u1",
            "description": "Requirements testing",
            "status": "draft",
        },
    ).json()


def create_req(client, pid, **kwargs):
    payload = {
        "title": "Default requirement",
        "type": "functional",
        "priority": "must",
        "status": "draft",
    }
    payload.update(kwargs)
    return client.post(f"/api/projects/{pid}/requirements", json=payload)


# ── tests ─────────────────────────────────────────────────────────────────────

def test_create_requirement_auto_codes(client):
    """Create 3 requirements and verify sequential REQ-001, REQ-002, REQ-003 codes."""
    project = make_project(client, "AutoCode Project")
    pid = project["id"]

    for i in range(1, 4):
        r = create_req(client, pid, title=f"Requirement {i}")
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["code"] == f"REQ-{i:03d}", f"Expected REQ-{i:03d}, got {data['code']}"
        assert data["projectId"] == pid
        assert data["title"] == f"Requirement {i}"


def test_requirement_status_workflow(client):
    """Draft → validated → approved workflow."""
    project = make_project(client, "Workflow Project")
    pid = project["id"]

    r = create_req(client, pid, title="Workflow req", status="draft")
    assert r.status_code == 201
    req_id = r.json()["id"]
    assert r.json()["status"] == "draft"

    # Validate
    v = client.post(f"/api/projects/{pid}/requirements/{req_id}/validate")
    assert v.status_code == 200, v.text
    assert v.json()["status"] == "validated"

    # Approve
    a = client.post(f"/api/projects/{pid}/requirements/{req_id}/approve")
    assert a.status_code == 200, a.text
    assert a.json()["status"] == "approved"


def test_requirement_filters(client):
    """Filter requirements by type, priority, status, and free-text q."""
    project = make_project(client, "Filter Project")
    pid = project["id"]

    create_req(client, pid, title="Functional must draft", type="functional", priority="must", status="draft")
    create_req(client, pid, title="Non-functional should draft", type="non-functional", priority="should", status="draft")
    create_req(client, pid, title="Integration could validated", type="integration", priority="could", status="validated")

    # Filter by type
    r = client.get(f"/api/projects/{pid}/requirements?type=functional")
    assert r.status_code == 200
    results = r.json()
    assert all(x["type"] == "functional" for x in results)
    assert len(results) == 1

    # Filter by priority
    r = client.get(f"/api/projects/{pid}/requirements?priority=should")
    assert r.status_code == 200
    results = r.json()
    assert all(x["priority"] == "should" for x in results)
    assert len(results) == 1

    # Filter by status
    r = client.get(f"/api/projects/{pid}/requirements?status=validated")
    assert r.status_code == 200
    results = r.json()
    assert all(x["status"] == "validated" for x in results)
    assert len(results) == 1

    # Free-text search
    r = client.get(f"/api/projects/{pid}/requirements?q=Integration")
    assert r.status_code == 200
    results = r.json()
    assert len(results) == 1
    assert "Integration" in results[0]["title"]


def test_requirement_crud_404(client):
    """Get, patch, and delete on nonexistent IDs return 404."""
    project = make_project(client, "404 Project")
    pid = project["id"]

    fake_id = "r-nonexistent"

    r = client.get(f"/api/projects/{pid}/requirements/{fake_id}")
    assert r.status_code == 404

    r = client.patch(f"/api/projects/{pid}/requirements/{fake_id}", json={"title": "x"})
    assert r.status_code == 404

    r = client.delete(f"/api/projects/{pid}/requirements/{fake_id}")
    assert r.status_code == 404

    # Also test with nonexistent project
    r = client.get("/api/projects/p-fake/requirements/r-fake")
    assert r.status_code == 404


def test_requirement_validation(client):
    """Invalid type, priority, or status return 422."""
    project = make_project(client, "Validation Project")
    pid = project["id"]

    # Invalid type
    r = client.post(
        f"/api/projects/{pid}/requirements",
        json={"title": "Bad type", "type": "invalid-type", "priority": "must", "status": "draft"},
    )
    assert r.status_code == 422

    # Invalid priority
    r = client.post(
        f"/api/projects/{pid}/requirements",
        json={"title": "Bad priority", "type": "functional", "priority": "extreme", "status": "draft"},
    )
    assert r.status_code == 422

    # Invalid status
    r = client.post(
        f"/api/projects/{pid}/requirements",
        json={"title": "Bad status", "type": "functional", "priority": "must", "status": "rejected"},
    )
    assert r.status_code == 422

    # Missing title
    r = client.post(
        f"/api/projects/{pid}/requirements",
        json={"type": "functional", "priority": "must", "status": "draft"},
    )
    assert r.status_code == 422


def test_bulk_create_requirements(client):
    """Bulk create 5 requirements and verify count on project."""
    project = make_project(client, "Bulk Create Project")
    pid = project["id"]

    bulk_payload = [
        {"title": f"Bulk req {i}", "type": "functional", "priority": "must", "status": "draft"}
        for i in range(1, 6)
    ]
    r = client.post(f"/api/projects/{pid}/requirements/bulk", json=bulk_payload)
    assert r.status_code == 201, r.text

    created = r.json()
    assert len(created) == 5

    # Verify sequential codes
    codes = [item["code"] for item in created]
    assert codes == ["REQ-001", "REQ-002", "REQ-003", "REQ-004", "REQ-005"]

    # Verify project counts updated
    project_data = client.get(f"/api/projects/{pid}").json()
    assert project_data["counts"]["requirements"] == 5


def test_extract_requirements_no_llm(client):
    """When LLM is not configured, extract endpoint returns 422."""
    # Create a project and upload a source
    project = make_project(client, "Extract No LLM Project")
    pid = project["id"]

    upload_res = client.post(
        f"/api/projects/{pid}/sources",
        files={"file": ("test.txt", b"Some requirement content here", "text/plain")},
    )
    assert upload_res.status_code == 201
    source_id = upload_res.json()["id"]

    # Should get 422 since LLM is not configured in test environment
    r = client.post(f"/api/projects/{pid}/sources/{source_id}/extract-requirements")
    assert r.status_code == 422
    assert "LLM not configured" in r.json()["detail"]


def test_requirement_patch(client):
    """Patch a requirement updates fields correctly."""
    project = make_project(client, "Patch Test Project")
    pid = project["id"]

    r = create_req(client, pid, title="Original title", description="Original desc")
    assert r.status_code == 201
    req_id = r.json()["id"]

    patch = client.patch(
        f"/api/projects/{pid}/requirements/{req_id}",
        json={"title": "Updated title", "priority": "could", "notes": "A note"},
    )
    assert patch.status_code == 200
    data = patch.json()
    assert data["title"] == "Updated title"
    assert data["priority"] == "could"
    assert data["notes"] == "A note"
    # Unchanged fields preserved
    assert data["description"] == "Original desc"


def test_requirement_delete_updates_count(client):
    """Deleting a requirement decrements project counts."""
    project = make_project(client, "Delete Count Project")
    pid = project["id"]

    r = create_req(client, pid, title="To delete")
    assert r.status_code == 201
    req_id = r.json()["id"]

    assert client.get(f"/api/projects/{pid}").json()["counts"]["requirements"] == 1

    del_res = client.delete(f"/api/projects/{pid}/requirements/{req_id}")
    assert del_res.status_code == 204

    assert client.get(f"/api/projects/{pid}").json()["counts"]["requirements"] == 0
    # Subsequent get returns 404
    assert client.get(f"/api/projects/{pid}/requirements/{req_id}").status_code == 404


# ── Phase 2 completion: codes, AI paths (LLM is faked, never called for real) ──

import json as _json

from app.models import Meeting
from app.routers import requirements as req_router


@pytest.fixture
def fake_llm(monkeypatch):
    """Pretend an AI provider is configured and return canned replies."""
    replies: list[str] = []
    monkeypatch.setattr(req_router, "llm_enabled", lambda: True)
    monkeypatch.setattr(req_router, "call_llm", lambda system, user: replies.pop(0))
    return replies


def test_codes_do_not_repeat_after_delete(client):
    pid = make_project(client, "Code Reuse Project")["id"]
    a = create_req(client, pid, title="A").json()
    b = create_req(client, pid, title="B").json()
    assert client.delete(f"/api/projects/{pid}/requirements/{a['id']}").status_code == 204
    c = create_req(client, pid, title="C").json()
    assert c["code"] != b["code"]
    assert c["code"] == "REQ-003"


def test_ai_status_disabled_in_tests(client):
    assert client.get("/api/ai/status").json() == {"enabled": False, "provider": None, "model": None}


def test_extract_from_source_with_fake_llm(client, fake_llm):
    pid = make_project(client, "Fake LLM Source Project")["id"]
    sid = client.post(
        f"/api/projects/{pid}/sources",
        files={"file": ("notes.txt", b"Users must log in with SSO.", "text/plain")},
    ).json()["id"]
    fake_llm.append("```json\n" + _json.dumps([
        {"title": "Support SSO login", "type": "integration", "priority": "must", "rationale": "r", "quote": "SSO"},
        {"title": "Weird", "type": "bogus", "priority": "bogus"},
    ]) + "\n```")
    r = client.post(f"/api/projects/{pid}/sources/{sid}/extract-requirements")
    assert r.status_code == 200, r.text
    items = r.json()
    assert items[0]["title"] == "Support SSO login"
    assert items[1]["type"] == "functional" and items[1]["priority"] == "should"  # coerced
    # Extraction only suggests; nothing saved until bulk create.
    assert client.get(f"/api/projects/{pid}/requirements").json() == []


def test_extract_bad_json_returns_502(client, fake_llm):
    pid = make_project(client, "Bad JSON Project")["id"]
    sid = client.post(
        f"/api/projects/{pid}/sources",
        files={"file": ("n.txt", b"text", "text/plain")},
    ).json()["id"]
    fake_llm.append("sorry, not json")
    r = client.post(f"/api/projects/{pid}/sources/{sid}/extract-requirements")
    assert r.status_code == 502
    assert "not valid JSON" in r.json()["detail"]


def _make_meeting(project_id: str | None, transcript: str) -> str:
    from app.database import SessionLocal
    import uuid

    mid = f"m-test-{uuid.uuid4().hex[:6]}"
    with SessionLocal() as db:
        db.add(Meeting(id=mid, project_id=project_id, title="Kickoff", transcript=transcript))
        db.commit()
    return mid


def test_extract_from_meeting_and_summarize(client, fake_llm):
    pid = make_project(client, "Meeting AI Project")["id"]
    mid = _make_meeting(pid, "Client: we need monthly reports. Decision: go with cloud hosting.")

    fake_llm.append(_json.dumps([{"title": "Monthly reports", "type": "functional", "priority": "should"}]))
    r = client.post(f"/api/meetings/{mid}/extract-requirements")
    assert r.status_code == 200, r.text
    assert r.json()[0]["title"] == "Monthly reports"

    fake_llm.append(_json.dumps({"decisions": ["Cloud hosting"], "action_items": [], "open_questions": ["Budget?"]}))
    s = client.post(f"/api/meetings/{mid}/summarize")
    assert s.status_code == 200, s.text
    assert s.json()["decisions"] == ["Cloud hosting"]
    assert client.get(f"/api/meetings/{mid}").json()["summary"]["open_questions"] == ["Budget?"]


def test_meeting_ai_errors(client):
    assert client.post("/api/meetings/does-not-exist/extract-requirements").status_code == 404
    mid = _make_meeting(None, "")
    assert client.post(f"/api/meetings/{mid}/extract-requirements").status_code == 422


def test_ai_input_too_long_is_rejected_not_truncated(client, fake_llm):
    mid = _make_meeting(None, "x" * (req_router.MAX_AI_INPUT_CHARS + 1))
    r = client.post(f"/api/meetings/{mid}/extract-requirements")
    assert r.status_code == 413
