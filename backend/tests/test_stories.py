"""Tests for the User Stories module."""
from __future__ import annotations

import csv
import io


def make_project(client, name="Stories Test Project"):
    r = client.post(
        "/api/projects",
        json={"name": name, "clientName": "Acme", "ownerId": "u1", "description": "Backlog testing", "status": "draft"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def base(pid):
    return f"/api/projects/{pid}/stories"


def add_req(client, pid, title, type_="functional", priority="must", **extra):
    r = client.post(f"/api/projects/{pid}/requirements", json={"title": title, "type": type_, "priority": priority, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def project_counts(client, pid):
    return client.get(f"/api/projects/{pid}").json()["counts"]


def test_empty_backlog_and_unknown_project(client):
    pid = make_project(client, "Stories empty")
    assert client.get(base(pid)).json() == {"epics": [], "stories": []}
    assert client.get(base("nope")).status_code == 404


def test_epic_crud_and_codes(client):
    pid = make_project(client, "Stories epics")
    e1 = client.post(f"{base(pid)}/epics", json={"title": " Onboarding ", "description": "KYC"})
    assert e1.status_code == 201, e1.text
    assert e1.json()["code"] == "EPIC-001" and e1.json()["title"] == "Onboarding"
    e2 = client.post(f"{base(pid)}/epics", json={"title": "Reports"}).json()
    assert client.delete(f"{base(pid)}/epics/{e2['id']}").status_code == 204
    assert client.post(f"{base(pid)}/epics", json={"title": "Billing"}).json()["code"] == "EPIC-003"  # never reused

    r = client.patch(f"{base(pid)}/epics/{e1.json()['id']}", json={"title": "Customer onboarding"})
    assert r.json()["title"] == "Customer onboarding"
    assert client.post(f"{base(pid)}/epics", json={"title": ""}).status_code == 422


def test_story_crud_validation_and_count(client):
    pid = make_project(client, "Stories crud")
    req = add_req(client, pid, "Online KYC")
    epic = client.post(f"{base(pid)}/epics", json={"title": "Onboarding"}).json()

    r = client.post(base(pid), json={
        "title": "Upload ID document",
        "epicId": epic["id"],
        "persona": "new customer",
        "goal": "upload my passport",
        "benefit": "I can open an account online",
        "acceptanceCriteria": ["Given a JPG, when I upload, then it is accepted", "  ", ""],
        "priority": "must",
        "storyPoints": 5,
        "requirementIds": [req["id"], req["id"]],
    })
    assert r.status_code == 201, r.text
    s = r.json()
    assert s["code"] == "US-001" and s["status"] == "backlog"
    assert s["acceptanceCriteria"] == ["Given a JPG, when I upload, then it is accepted"]  # blanks dropped
    assert s["requirementIds"] == [req["id"]]  # de-duplicated
    assert project_counts(client, pid)["userStories"] == 1

    # Update: status, points cleared, moved out of the epic
    r = client.patch(f"{base(pid)}/{s['id']}", json={"status": "in-progress", "storyPoints": None, "epicId": None})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "in-progress" and r.json()["storyPoints"] is None and r.json()["epicId"] is None
    # Explicit null on a required field is ignored
    assert client.patch(f"{base(pid)}/{s['id']}", json={"title": None}).json()["title"] == "Upload ID document"

    # Validation
    assert client.post(base(pid), json={"title": "X", "storyPoints": 4}).status_code == 422
    assert client.post(base(pid), json={"title": "X", "status": "blocked"}).status_code == 422
    assert client.post(base(pid), json={"title": "X", "epicId": "ep-nope"}).status_code == 404
    assert client.post(base(pid), json={"title": "X", "requirementIds": ["r-nope"]}).status_code == 422
    assert client.post(base(pid), json={"title": ""}).status_code == 422

    assert client.delete(f"{base(pid)}/{s['id']}").status_code == 204
    assert project_counts(client, pid)["userStories"] == 0
    assert client.post(base(pid), json={"title": "Next"}).json()["code"] == "US-002"
    assert "story" in [a["kind"] for a in client.get(f"/api/projects/{pid}/activities").json()]


def test_deleting_epic_keeps_stories(client):
    pid = make_project(client, "Stories epic delete")
    epic = client.post(f"{base(pid)}/epics", json={"title": "Temp"}).json()
    story = client.post(base(pid), json={"title": "Keep me", "epicId": epic["id"]}).json()
    assert client.delete(f"{base(pid)}/epics/{epic['id']}").status_code == 204
    data = client.get(base(pid)).json()
    assert data["epics"] == []
    assert data["stories"][0]["id"] == story["id"] and data["stories"][0]["epicId"] is None


def test_deleting_requirement_unlinks_story(client):
    pid = make_project(client, "Stories req delete")
    req = add_req(client, pid, "Reports")
    story = client.post(base(pid), json={"title": "See report", "requirementIds": [req["id"]]}).json()
    client.delete(f"/api/projects/{pid}/requirements/{req['id']}")
    assert client.get(base(pid)).json()["stories"][0]["requirementIds"] == []
    assert story["id"]


def test_other_project_is_404(client):
    a, b = make_project(client, "Stories A"), make_project(client, "Stories B")
    story = client.post(base(a), json={"title": "Only A"}).json()
    epic = client.post(f"{base(a)}/epics", json={"title": "Only A"}).json()
    assert client.patch(f"{base(b)}/{story['id']}", json={"status": "done"}).status_code == 404
    assert client.delete(f"{base(b)}/{story['id']}").status_code == 404
    assert client.delete(f"{base(b)}/epics/{epic['id']}").status_code == 404
    assert client.post(base(b), json={"title": "X", "epicId": epic["id"]}).status_code == 404


def test_from_requirements_covers_only_uncovered(client):
    pid = make_project(client, "Stories from reqs")
    r1 = add_req(client, pid, "Online KYC", description="Verify identity online", rationale="Faster onboarding")
    add_req(client, pid, "99.9% uptime", type_="non-functional", priority="should")
    add_req(client, pid, "Core banking API", type_="integration", priority="could")
    # r1 is already covered by a hand-written story
    client.post(base(pid), json={"title": "Manual", "requirementIds": [r1["id"]]})

    r = client.post(f"{base(pid)}/from-requirements")
    assert r.status_code == 201, r.text
    data = r.json()
    assert sorted(e["title"] for e in data["epics"]) == ["Integrations", "Quality & performance"]
    assert [s["title"] for s in data["stories"]] == ["99.9% uptime", "Core banking API"]
    assert data["stories"][1]["priority"] == "could"
    assert project_counts(client, pid)["userStories"] == 3

    # Everything is covered now
    r = client.post(f"{base(pid)}/from-requirements")
    assert r.status_code == 422 and "already covered" in r.json()["detail"]

    # A new functional requirement reuses no epic (none for functional yet) -> creates "Core functionality" once
    add_req(client, pid, "Statements")
    add_req(client, pid, "Alerts")
    data = client.post(f"{base(pid)}/from-requirements").json()
    assert [e["title"] for e in data["epics"]] == ["Core functionality"]
    assert len(data["stories"]) == 2 and len({s["epicId"] for s in data["stories"]}) == 1


def test_from_requirements_story_fields(client):
    pid = make_project(client, "Stories fields")
    add_req(client, pid, "Online KYC", description="Verify identity online", rationale="Faster onboarding")
    story = client.post(f"{base(pid)}/from-requirements").json()["stories"][0]
    assert story["persona"] == "user"
    assert story["goal"] == "Verify identity online"
    assert story["benefit"] == "Faster onboarding"
    assert story["priority"] == "must"


def test_from_requirements_with_no_requirements(client):
    pid = make_project(client, "Stories none")
    assert client.post(f"{base(pid)}/from-requirements").status_code == 422


def test_bulk_creates_epics_and_stories(client):
    pid = make_project(client, "Stories bulk")
    req = add_req(client, pid, "Online KYC")
    r = client.post(f"{base(pid)}/bulk", json={"groups": [
        {"title": "Onboarding", "description": "d", "stories": [
            {"title": "Upload ID", "acceptanceCriteria": ["a"], "storyPoints": 3, "requirementIds": [req["id"]]},
            {"title": "Selfie check", "priority": "could"},
        ]},
        {"title": "Empty epic is skipped", "stories": []},
        {"title": None, "stories": [{"title": "Loose story"}]},
    ]})
    assert r.status_code == 201, r.text
    data = r.json()
    assert [e["title"] for e in data["epics"]] == ["Onboarding"]
    assert [s["code"] for s in data["stories"]] == ["US-001", "US-002", "US-003"]
    assert data["stories"][0]["epicId"] == data["epics"][0]["id"]
    assert data["stories"][2]["epicId"] is None
    assert project_counts(client, pid)["userStories"] == 3


def test_export_csv(client):
    pid = make_project(client, "Stories Export!")
    req = add_req(client, pid, "Online KYC")
    epic = client.post(f"{base(pid)}/epics", json={"title": "Onboarding"}).json()
    client.post(base(pid), json={
        "title": "Upload ID", "epicId": epic["id"], "persona": "customer", "goal": "upload my ID", "benefit": "I save time",
        "acceptanceCriteria": ["Given, when, then"], "priority": "must", "storyPoints": 5, "requirementIds": [req["id"]],
    })
    r = client.get(f"{base(pid)}/export")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert 'filename="stories-export-user-stories.csv"' in r.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert rows[0]["Issue Type"] == "Epic" and rows[0]["Summary"] == "Onboarding"
    story = rows[1]
    assert story["Issue Type"] == "Story" and story["Epic Link"] == "EPIC-001"
    assert story["Description"] == "As a customer, I want upload my ID, so that I save time"
    assert story["Priority"] == "High" and story["Story Points"] == "5"
    assert story["Acceptance Criteria"] == "- Given, when, then"
    assert story["Labels"] == "REQ-001"


def test_suggest_needs_requirements_then_ai(client):
    pid = make_project(client, "Stories AI")
    r = client.post(f"{base(pid)}/suggest")
    assert r.status_code == 422 and "requirements" in r.json()["detail"]
    add_req(client, pid, "X")
    r = client.post(f"{base(pid)}/suggest")
    assert r.status_code == 422 and "AI is not configured" in r.json()["detail"]


def test_project_delete_and_reset_remove_backlog(client):
    pid = make_project(client, "Stories cascade")
    client.post(f"{base(pid)}/epics", json={"title": "x"})
    client.post(base(pid), json={"title": "x"})
    assert client.delete(f"/api/projects/{pid}").status_code == 204
    assert client.get(base(pid)).status_code == 404

    pid = make_project(client, "Stories reset")
    client.post(base(pid), json={"title": "x"})
    assert client.post("/api/admin/reset-sample-data").status_code == 200
    assert client.get(base(pid)).status_code == 404
