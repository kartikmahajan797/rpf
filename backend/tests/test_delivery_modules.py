"""Tests for Traceability, Proposals, Presentations, Handoff and Templates."""
from __future__ import annotations

import io
import zipfile

from pptx import Presentation


def make_project(client, name):
    r = client.post("/api/projects", json={"name": name, "clientName": "Acme", "ownerId": "u1", "description": "Portal programme", "status": "draft"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def add_req(client, pid, title="Online KYC"):
    r = client.post(f"/api/projects/{pid}/requirements", json={"title": title, "type": "functional", "priority": "must"})
    assert r.status_code == 201, r.text
    return r.json()


def add_doc(client, pid, kind, **extra):
    r = client.post(f"/api/projects/{pid}/documents", json={"kind": kind, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def approve(client, pid, doc):
    url = f"/api/projects/{pid}/documents/{doc['id']}"
    assert client.post(f"{url}/submit").status_code == 200
    assert client.post(f"{url}/approve").status_code == 200


def priced_project(client, name):
    """A project with one requirement carried right through to a priced estimate."""
    pid = make_project(client, name)
    req = add_req(client, pid)
    story = client.post(f"/api/projects/{pid}/stories", json={"title": "Upload ID", "storyPoints": 5, "requirementIds": [req["id"]], "acceptanceCriteria": ["ID is stored"]})
    assert story.status_code == 201, story.text
    client.post(f"/api/projects/{pid}/solution/components", json={"name": "Portal", "technology": "Next.js", "requirementIds": [req["id"]]})
    client.put(f"/api/projects/{pid}/solution/design", json={"overview": "A secure portal.", "technicalApproach": "Agile sprints."})
    role = client.post(f"/api/projects/{pid}/estimation/roles", json={"name": "Developer", "dayRate": 1000}).json()
    items = client.post(f"/api/projects/{pid}/estimation/items/from-stories").json()
    client.patch(f"/api/projects/{pid}/estimation/items/{items[0]['id']}", json={"roleId": role["id"]})
    return pid, req


# ── Traceability ────────────────────────────────────────────────────────────


def test_traceability_links_and_cost(client):
    pid, req = priced_project(client, "Trace full")
    data = client.get(f"/api/projects/{pid}/traceability").json()
    row = data["rows"][0]
    assert row["code"] == req["code"] and row["hasStory"] and row["hasDesign"] and row["hasEstimate"]
    assert row["components"][0]["label"] == "Portal" and len(row["estimateItems"]) == 1
    assert row["estimateDays"] > 0 and row["estimateCost"] == 5208.33
    assert data["summary"] == {"total": 1, "fullyTraced": 1, "withoutStory": 0, "withoutDesign": 0, "withoutEstimate": 0}
    assert data["orphans"] == []


def test_traceability_finds_gaps_orphans_and_documents(client):
    pid = make_project(client, "Trace gaps")
    req = add_req(client, pid)
    client.post(f"/api/projects/{pid}/stories", json={"title": "Loose story"})
    doc = add_doc(client, pid, "brd")
    data = client.get(f"/api/projects/{pid}/traceability").json()
    assert data["summary"]["withoutStory"] == 1 and data["summary"]["fullyTraced"] == 0
    assert [o["kind"] for o in data["orphans"]] == ["User story"]
    assert data["rows"][0]["id"] == req["id"] and data["rows"][0]["documents"][0]["id"] == doc["id"]
    assert client.get("/api/projects/nope/traceability").status_code == 404


def test_traceability_export_guards_formulas(client):
    pid = make_project(client, "Trace CSV")
    add_req(client, pid, "=HYPERLINK('x')")
    r = client.get(f"/api/projects/{pid}/traceability/export")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "'=HYPERLINK" in r.text and 'filename="trace-csv-traceability.csv"' in r.headers["content-disposition"]


# ── Proposals & presentations ───────────────────────────────────────────────


def test_proposal_is_filled_from_project_data(client):
    pid, req = priced_project(client, "Prop full")
    client.put(f"/api/projects/{pid}/estimation/settings", json={"currency": "GBP", "contingencyPct": 0, "commercialModel": "fixed-price", "assumptions": "Client hosts UAT"})
    doc = add_doc(client, pid, "proposal")
    assert doc["title"] == "Prop full: Client Proposal"
    bodies = {s["key"]: s["body"] for s in doc["sections"]}
    assert "GBP" in bodies["commercials"] and "Fixed price" in bodies["commercials"]
    assert req["code"] in bodies["scope"] and "A secure portal." in bodies["solution"] and "Developer" in bodies["team"]
    assert bodies["assumptions"] == "Client hosts UAT"


def test_empty_proposal_and_deck_get_placeholders(client):
    pid = make_project(client, "Prop empty")
    bodies = {s["key"]: s["body"] for s in add_doc(client, pid, "proposal")["sections"]}
    assert bodies["commercials"].startswith("_No estimate yet")
    bodies = {s["key"]: s["body"] for s in add_doc(client, pid, "deck")["sections"]}
    assert bodies["investment"].startswith("_No estimate yet")


def test_section_refresh_picks_up_new_estimate(client):
    pid = make_project(client, "Prop refresh")
    doc = add_doc(client, pid, "proposal")
    role = client.post(f"/api/projects/{pid}/estimation/roles", json={"name": "Dev", "dayRate": 100}).json()
    client.post(f"/api/projects/{pid}/estimation/items", json={"title": "Work", "optimisticDays": 1, "likelyDays": 1, "pessimisticDays": 1, "roleId": role["id"]})
    r = client.post(f"/api/projects/{pid}/documents/{doc['id']}/sections/commercials/refresh")
    assert r.status_code == 200, r.text
    body = next(s["body"] for s in r.json()["sections"] if s["key"] == "commercials")
    assert "USD 110.00" in body


def test_proposal_approval_workflow(client):
    pid = make_project(client, "Prop approve")
    doc = add_doc(client, pid, "proposal")
    approve(client, pid, doc)
    assert client.get(f"/api/projects/{pid}/documents/{doc['id']}").json()["status"] == "approved"


def test_pdf_export_handles_markdown_and_special_characters(client):
    pid, _ = priced_project(client, "Prop PDF")
    doc = add_doc(client, pid, "proposal")
    sections = doc["sections"] + [{"key": "custom-x", "title": "A & B <tag>", "body": "**bold** _it_ → x\n\n- one\n- two\n\n1. first\n\n| a | b \\| c |\n| --- | --- |\n| 1 | 2 |"}]
    assert client.patch(f"/api/projects/{pid}/documents/{doc['id']}", json={"sections": sections}).status_code == 200
    r = client.get(f"/api/projects/{pid}/documents/{doc['id']}/export/pdf")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf" and r.content.startswith(b"%PDF")


def test_pptx_export(client):
    pid, _ = priced_project(client, "Deck PPT")
    doc = add_doc(client, pid, "deck")
    long_body = "\n".join(f"- point {i}" for i in range(10))
    sections = doc["sections"] + [{"key": "custom-long", "title": "Long", "body": long_body}]
    client.patch(f"/api/projects/{pid}/documents/{doc['id']}", json={"sections": sections})
    r = client.get(f"/api/projects/{pid}/documents/{doc['id']}/export/pptx")
    assert r.status_code == 200, r.text
    titles = [s.shapes.title.text for s in Presentation(io.BytesIO(r.content)).slides]
    assert titles[0] == "Deck PPT: Presentation" and "Investment" in titles
    assert titles[-2:] == ["Long", "Long (continued)"]
    other = add_doc(client, pid, "brd")
    assert client.get(f"/api/projects/{pid}/documents/{other['id']}/export/pptx").status_code == 422


# ── Templates ───────────────────────────────────────────────────────────────


def test_template_crud_and_validation(client):
    outlines = client.get("/api/templates/outlines").json()
    assert set(outlines) == {"brd", "frd", "proposal", "deck"} and outlines["brd"][0]["key"] == "summary"
    r = client.post("/api/templates", json={"kind": "brd", "name": " Bank BRD ", "sections": [{"key": "summary", "title": "Summary"}]})
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["name"] == "Bank BRD"
    assert client.patch(f"/api/templates/{t['id']}", json={"name": "Renamed"}).json()["name"] == "Renamed"
    assert client.post("/api/templates", json={"kind": "brd", "name": "X", "sections": []}).status_code == 422
    dupes = [{"key": "a", "title": "A"}, {"key": "a", "title": "B"}]
    assert client.post("/api/templates", json={"kind": "brd", "name": "X", "sections": dupes}).status_code == 422
    assert client.post("/api/templates", json={"kind": "memo", "name": "X", "sections": dupes[:1]}).status_code == 422
    assert client.delete(f"/api/templates/{t['id']}").status_code == 204
    assert client.delete(f"/api/templates/{t['id']}").status_code == 404


def test_document_from_template_fills_blank_standard_sections(client):
    pid = make_project(client, "Tpl use")
    req = add_req(client, pid)
    t = client.post("/api/templates", json={"kind": "brd", "name": "Short", "sections": [
        {"key": "requirements", "title": "What we need"},
        {"key": "summary", "title": "Summary", "body": "Standard wording."},
        {"key": "custom-legal", "title": "Legal", "body": "Confidential."},
    ]}).json()
    doc = add_doc(client, pid, "brd", templateId=t["id"])
    assert [s["title"] for s in doc["sections"]] == ["What we need", "Summary", "Legal"]
    assert req["code"] in doc["sections"][0]["body"] and doc["sections"][1]["body"] == "Standard wording." and doc["sections"][2]["body"] == "Confidential."
    assert client.post(f"/api/projects/{pid}/documents", json={"kind": "frd", "templateId": t["id"]}).status_code == 422
    assert client.post(f"/api/projects/{pid}/documents", json={"kind": "brd", "templateId": "nope"}).status_code == 422


def test_template_from_document_drops_client_data(client):
    pid = make_project(client, "Tpl copy")
    doc = add_doc(client, pid, "brd")
    extra = doc["sections"] + [{"key": "custom-1", "title": "Boilerplate", "body": "Keep me"}]
    client.patch(f"/api/projects/{pid}/documents/{doc['id']}", json={"sections": extra})
    r = client.post("/api/templates/from-document", json={"projectId": pid, "documentId": doc["id"], "name": "Copied"})
    assert r.status_code == 201, r.text
    sections = {s["key"]: s["body"] for s in r.json()["sections"]}
    assert sections["summary"] == "" and sections["custom-1"] == "Keep me"
    assert client.post("/api/templates/from-document", json={"projectId": "other", "documentId": doc["id"], "name": "X"}).status_code == 404


# ── Handoff ─────────────────────────────────────────────────────────────────


def test_handoff_blocked_until_required_checks_pass(client):
    pid, req = priced_project(client, "Handoff flow")
    base = f"/api/projects/{pid}/handoff"
    data = client.get(base).json()
    assert data["ready"] is False and data["handoff"]["handedOffAt"] is None
    assert {c["key"] for c in data["checks"] if c["passed"] and c["required"]} == {"stories", "solution", "estimate"}
    r = client.post(f"{base}/complete")
    assert r.status_code == 409 and "BRD approved" in r.json()["detail"]

    client.post(f"/api/projects/{pid}/requirements/{req['id']}/validate")
    assert client.post(f"/api/projects/{pid}/requirements/{req['id']}/approve").status_code == 200
    for kind in ("brd", "frd"):
        approve(client, pid, add_doc(client, pid, kind))
    assert client.get(base).json()["ready"] is True

    done = client.post(f"{base}/complete")
    assert done.status_code == 200, done.text
    assert done.json()["handoff"]["handedOffAt"] and done.json()["handoff"]["handedOffBy"] == "u1"
    assert client.post(f"{base}/complete").status_code == 409
    assert client.post(f"{base}/reopen").json()["handoff"]["handedOffAt"] is None
    assert client.post(f"{base}/reopen").status_code == 409


def test_handoff_details_saved_partially(client):
    pid = make_project(client, "Handoff details")
    base = f"/api/projects/{pid}/handoff"
    r = client.put(base, json={"deliveryLead": " Priya ", "startDate": "2027-01-04"})
    assert r.status_code == 200, r.text
    r = client.put(base, json={"notes": "Sandbox ready"})
    h = r.json()["handoff"]
    assert h["deliveryLead"] == "Priya" and h["startDate"] == "2027-01-04" and h["notes"] == "Sandbox ready"
    assert client.put(base, json={"startDate": "soon"}).status_code == 422
    assert client.put(base, json={"startDate": ""}).status_code == 200


def test_handoff_package_contents(client):
    pid, _ = priced_project(client, "Handoff Zip")
    add_doc(client, pid, "brd")
    add_doc(client, pid, "brd")  # same title twice must not collide
    client.put(f"/api/projects/{pid}/handoff", json={"deliveryLead": "Priya", "notes": "Sandbox ready"})
    r = client.get(f"/api/projects/{pid}/handoff/export")
    assert r.status_code == 200, r.text
    assert 'filename="handoff-zip-handoff.zip"' in r.headers["content-disposition"]
    archive = zipfile.ZipFile(io.BytesIO(r.content))
    names = archive.namelist()
    assert {"README.md", "backlog/user-stories.csv", "solution-design.md", "estimate.md", "traceability.csv"} <= set(names)
    assert len([n for n in names if n.startswith("documents/")]) == 2 and len(names) == len(set(names))
    readme = archive.read("README.md").decode()
    assert "Delivery lead: Priya" in readme and "Sandbox ready" in readme and "- [ ] BRD approved" in readme


def test_project_delete_and_reset_remove_handoff(client):
    pid = make_project(client, "Handoff cascade")
    client.put(f"/api/projects/{pid}/handoff", json={"notes": "x"})
    assert client.delete(f"/api/projects/{pid}").status_code == 204
    assert client.get(f"/api/projects/{pid}/handoff").status_code == 404
    pid = make_project(client, "Handoff reset")
    client.put(f"/api/projects/{pid}/handoff", json={"notes": "x"})
    assert client.post("/api/admin/reset-sample-data").status_code == 200
    assert client.get(f"/api/projects/{pid}/handoff").status_code == 404
