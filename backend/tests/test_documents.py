"""Tests for the BRD / FRD documents module."""
from __future__ import annotations


def make_project(client, name="Docs Test Project"):
    r = client.post(
        "/api/projects",
        json={"name": name, "clientName": "Acme Bank", "ownerId": "u2", "description": "Digital onboarding", "status": "draft"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def base(pid):
    return f"/api/projects/{pid}/documents"


def seed_material(client, pid):
    """Requirements + analysis so the generated sections have real content."""
    req = client.post(
        f"/api/projects/{pid}/requirements",
        json={"title": "Online KYC check", "type": "functional", "priority": "must", "description": "Verify ID | selfie"},
    ).json()
    client.post(f"/api/projects/{pid}/requirements", json={"title": "99.9% uptime", "type": "non-functional", "priority": "should"})
    a = f"/api/projects/{pid}/analysis"
    client.put(f"{a}/state", json={"currentState": "Paper forms", "futureState": "Online portal", "objectives": "Cut onboarding to 1 day\n- Reduce errors"})
    client.post(f"{a}/gaps", json={"area": "Onboarding", "current": "5 days", "target": "1 day", "requirementIds": [req["id"]]})
    client.post(f"{a}/stakeholders", json={"name": "Priya Shah", "role": "COO", "influence": "high"})
    client.post(f"{a}/processes", json={"name": "Account opening", "steps": [{"actor": "Clerk", "action": "Re-keys form", "painPoint": "Typos"}]})
    return req


def section(doc, key):
    return next(s for s in doc["sections"] if s["key"] == key)


def test_empty_list_and_unknown_project(client):
    pid = make_project(client, "Docs empty")
    assert client.get(base(pid)).json() == []
    assert client.get(base("nope")).status_code == 404
    assert client.post(base("nope"), json={"kind": "brd"}).status_code == 404


def test_generate_brd_from_project_data(client):
    pid = make_project(client, "Docs BRD")
    seed_material(client, pid)
    r = client.post(base(pid), json={"kind": "brd"})
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["title"] == "Docs BRD: Business Requirements Document"
    assert doc["status"] == "draft" and doc["version"] == 1
    assert [s["key"] for s in doc["sections"]][:4] == ["summary", "objectives", "current-state", "future-state"]
    assert doc["sectionCount"] == len(doc["sections"])

    assert "- Cut onboarding to 1 day" in section(doc, "objectives")["body"]
    assert "- Reduce errors" in section(doc, "objectives")["body"]
    assert section(doc, "current-state")["body"] == "Paper forms"
    assert "REQ-001" in section(doc, "requirements")["body"]
    assert "GAP-001" in section(doc, "gaps")["body"]
    assert "Priya Shah" in section(doc, "stakeholders")["body"]
    assert "Priya Shah" in section(doc, "sign-off")["body"]  # high-influence stakeholder signs off

    listed = client.get(base(pid)).json()
    assert len(listed) == 1 and "sections" not in listed[0]
    assert "document" in [a["kind"] for a in client.get(f"/api/projects/{pid}/activities").json()]


def test_generate_frd_with_traceability(client):
    pid = make_project(client, "Docs FRD")
    seed_material(client, pid)
    doc = client.post(base(pid), json={"kind": "frd", "title": "  Custom FRD "}).json()
    assert doc["title"] == "Custom FRD"
    functional = section(doc, "functional")["body"]
    assert "### REQ-001: Online KYC check" in functional
    assert "**Closes gaps:** GAP-001" in functional
    assert "REQ-002" in section(doc, "non-functional")["body"]
    assert "No integration requirements" in section(doc, "integration")["body"]
    assert "**Clerk**: Re-keys form _(pain point: Typos)_" in section(doc, "processes")["body"]
    assert "GAP-001" in section(doc, "traceability")["body"]


def test_empty_project_gets_placeholders(client):
    pid = make_project(client, "Docs placeholder")
    doc = client.post(base(pid), json={"kind": "brd"}).json()
    assert section(doc, "requirements")["body"].startswith("_No requirements")
    assert client.post(base(pid), json={"kind": "xyz"}).status_code == 422


def test_table_cells_escape_pipes_and_newlines(client):
    pid = make_project(client, "Docs pipes")
    client.post(f"/api/projects/{pid}/requirements", json={"title": "Export A | B", "type": "functional", "priority": "must"})
    doc = client.post(base(pid), json={"kind": "brd"}).json()
    assert "| REQ-001 | Export A \\| B |" in section(doc, "requirements")["body"]


def test_edit_sections_and_validation(client):
    pid = make_project(client, "Docs edit")
    doc = client.post(base(pid), json={"kind": "brd"}).json()
    sections = doc["sections"]
    sections[0]["body"] = "Rewritten summary"
    sections.append({"key": "glossary", "title": "Glossary", "body": "KYC: know your customer"})
    r = client.patch(f"{base(pid)}/{doc['id']}", json={"title": "BRD v1", "sections": sections})
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "BRD v1"
    assert r.json()["sections"][0]["body"] == "Rewritten summary"
    assert r.json()["sections"][-1]["key"] == "glossary"

    dup = sections + [{"key": "glossary", "title": "Again", "body": ""}]
    assert client.patch(f"{base(pid)}/{doc['id']}", json={"sections": dup}).status_code == 422
    assert client.patch(f"{base(pid)}/{doc['id']}", json={"sections": [{"key": "x", "title": "  ", "body": ""}]}).status_code == 422
    assert client.patch(f"{base(pid)}/{doc['id']}", json={"title": ""}).status_code == 422


def test_refresh_section_picks_up_new_data(client):
    pid = make_project(client, "Docs refresh")
    doc = client.post(base(pid), json={"kind": "brd"}).json()
    assert "REQ-001" not in section(doc, "requirements")["body"]
    client.post(f"/api/projects/{pid}/requirements", json={"title": "Reports", "type": "functional", "priority": "must"})
    r = client.post(f"{base(pid)}/{doc['id']}/sections/requirements/refresh")
    assert r.status_code == 200, r.text
    assert "REQ-001" in section(r.json(), "requirements")["body"]

    assert client.post(f"{base(pid)}/{doc['id']}/sections/missing/refresh").status_code == 404
    sections = r.json()["sections"] + [{"key": "custom", "title": "Custom", "body": "x"}]
    client.patch(f"{base(pid)}/{doc['id']}", json={"sections": sections})
    assert client.post(f"{base(pid)}/{doc['id']}/sections/custom/refresh").status_code == 422


def test_review_workflow_and_approvals(client):
    pid = make_project(client, "Docs review")
    doc = client.post(base(pid), json={"kind": "frd"}).json()
    url = f"{base(pid)}/{doc['id']}"

    assert client.post(f"{url}/approve").status_code == 409  # not in review yet
    r = client.post(f"{url}/submit")
    assert r.status_code == 200 and r.json()["status"] == "in-review"
    approvals = client.get(f"/api/projects/{pid}/approvals").json()
    assert len(approvals) == 1
    assert approvals[0]["artifact"] == "FRD" and approvals[0]["state"] == "pending" and approvals[0]["assigneeId"] == "u2"

    # Locked while in review
    assert client.patch(url, json={"title": "Changed"}).status_code == 409
    assert client.post(f"{url}/submit").status_code == 409

    # Changes requested -> back to draft, approval flagged
    r = client.post(f"{url}/request-changes")
    assert r.json()["status"] == "draft"
    assert client.get(f"/api/projects/{pid}/approvals").json()[0]["state"] == "changes-requested"

    # Resubmit reuses the same approval
    client.post(f"{url}/submit")
    approvals = client.get(f"/api/projects/{pid}/approvals").json()
    assert len(approvals) == 1 and approvals[0]["state"] == "pending"

    r = client.post(f"{url}/approve")
    assert r.json()["status"] == "approved" and r.json()["approvedAt"] and r.json()["approvedBy"] == "u1"
    assert client.get(f"/api/projects/{pid}/approvals").json() == []

    # Editing an approved document starts version 2 as a draft
    r = client.patch(url, json={"title": "FRD (revised)"})
    assert r.json()["status"] == "draft" and r.json()["version"] == 2 and r.json()["approvedAt"] is None

    # A no-op save does not bump the version again
    r = client.patch(url, json={"title": "FRD (revised)"})
    assert r.json()["version"] == 2


def test_delete_removes_pending_approval(client):
    pid = make_project(client, "Docs delete")
    doc = client.post(base(pid), json={"kind": "brd"}).json()
    client.post(f"{base(pid)}/{doc['id']}/submit")
    assert len(client.get(f"/api/projects/{pid}/approvals").json()) == 1
    assert client.delete(f"{base(pid)}/{doc['id']}").status_code == 204
    assert client.get(f"/api/projects/{pid}/approvals").json() == []
    assert client.get(f"{base(pid)}/{doc['id']}").status_code == 404


def test_document_of_other_project_is_404(client):
    a, b = make_project(client, "Docs A"), make_project(client, "Docs B")
    doc = client.post(base(a), json={"kind": "brd"}).json()
    assert client.get(f"{base(b)}/{doc['id']}").status_code == 404
    assert client.delete(f"{base(b)}/{doc['id']}").status_code == 404


def test_export_markdown(client):
    pid = make_project(client, "Docs export")
    seed_material(client, pid)
    doc = client.post(base(pid), json={"kind": "brd", "title": "Acme BRD"}).json()
    r = client.get(f"{base(pid)}/{doc['id']}/export")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/markdown")
    assert 'filename="acme-brd-v1.md"' in r.headers["content-disposition"]
    assert r.text.startswith("# Acme BRD")
    assert "## 1. Executive summary" in r.text
    assert "| REQ-001 | Online KYC check |" in r.text


def test_suggest_section_needs_material_then_ai(client):
    pid = make_project(client, "Docs AI")
    doc = client.post(base(pid), json={"kind": "brd"}).json()
    url = f"{base(pid)}/{doc['id']}/sections/summary/suggest"
    r = client.post(url)
    assert r.status_code == 422 and "requirements or meetings" in r.json()["detail"]
    client.post(f"/api/projects/{pid}/requirements", json={"title": "X", "type": "functional", "priority": "must"})
    r = client.post(url)
    assert r.status_code == 422 and "AI is not configured" in r.json()["detail"]
    assert client.post(f"{base(pid)}/{doc['id']}/sections/nope/suggest").status_code == 404


def test_project_delete_and_reset_remove_documents(client):
    pid = make_project(client, "Docs cascade")
    client.post(base(pid), json={"kind": "brd"})
    assert client.delete(f"/api/projects/{pid}").status_code == 204
    assert client.get(base(pid)).status_code == 404

    pid = make_project(client, "Docs reset")
    client.post(base(pid), json={"kind": "frd"})
    assert client.post("/api/admin/reset-sample-data").status_code == 200
    assert client.get(base(pid)).status_code == 404
