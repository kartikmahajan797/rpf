"""Tests for the Business Analysis module."""
from __future__ import annotations


def make_project(client, name="BA Test Project"):
    r = client.post(
        "/api/projects",
        json={"name": name, "clientName": "Test Client", "ownerId": "u1", "description": "BA testing", "status": "draft"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def base(pid):
    return f"/api/projects/{pid}/analysis"


def test_empty_overview(client):
    pid = make_project(client, "Empty BA")
    r = client.get(base(pid))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["state"] == {"projectId": pid, "currentState": "", "futureState": "", "objectives": "", "updatedAt": None}
    assert data["gaps"] == [] and data["stakeholders"] == [] and data["processMaps"] == []


def test_overview_unknown_project_404(client):
    assert client.get(base("does-not-exist")).status_code == 404


def test_save_state_partial_updates(client):
    pid = make_project(client, "State BA")
    r = client.put(f"{base(pid)}/state", json={"currentState": "Manual spreadsheets", "futureState": "Automated portal"})
    assert r.status_code == 200, r.text
    assert r.json()["currentState"] == "Manual spreadsheets"
    assert r.json()["updatedAt"]

    # Only objectives sent: the other fields are kept.
    r = client.put(f"{base(pid)}/state", json={"objectives": "Cut onboarding time by 50%"})
    data = r.json()
    assert data["currentState"] == "Manual spreadsheets"
    assert data["futureState"] == "Automated portal"
    assert data["objectives"] == "Cut onboarding time by 50%"

    kinds = [a["kind"] for a in client.get(f"/api/projects/{pid}/activities").json()]
    assert "analysis" in kinds


def test_gap_crud_codes_and_requirement_links(client):
    pid = make_project(client, "Gap BA")
    req = client.post(
        f"/api/projects/{pid}/requirements", json={"title": "Online KYC", "type": "functional", "priority": "must"}
    ).json()

    g1 = client.post(f"{base(pid)}/gaps", json={"area": "Onboarding", "impact": "high", "requirementIds": [req["id"]]})
    assert g1.status_code == 201, g1.text
    assert g1.json()["code"] == "GAP-001"
    assert g1.json()["requirementIds"] == [req["id"]]
    g2 = client.post(f"{base(pid)}/gaps", json={"area": "Reporting"}).json()
    assert g2["code"] == "GAP-002" and g2["impact"] == "medium" and g2["status"] == "open"

    # Codes never repeat after a delete.
    assert client.delete(f"{base(pid)}/gaps/{g2['id']}").status_code == 204
    assert client.post(f"{base(pid)}/gaps", json={"area": "Billing"}).json()["code"] == "GAP-003"

    # Update
    r = client.patch(f"{base(pid)}/gaps/{g1.json()['id']}", json={"status": "in-progress", "target": "Same-day"})
    assert r.status_code == 200 and r.json()["status"] == "in-progress" and r.json()["target"] == "Same-day"

    # Validation
    assert client.post(f"{base(pid)}/gaps", json={"area": "X", "impact": "huge"}).status_code == 422
    assert client.post(f"{base(pid)}/gaps", json={"area": ""}).status_code == 422
    assert client.post(f"{base(pid)}/gaps", json={"area": "X", "requirementIds": ["r-nope"]}).status_code == 422

    # Deleting a requirement removes it from the gap's links.
    client.delete(f"/api/projects/{pid}/requirements/{req['id']}")
    gap = next(g for g in client.get(base(pid)).json()["gaps"] if g["id"] == g1.json()["id"])
    assert gap["requirementIds"] == []


def test_gap_of_other_project_is_404(client):
    pid_a = make_project(client, "BA A")
    pid_b = make_project(client, "BA B")
    gap = client.post(f"{base(pid_a)}/gaps", json={"area": "Only in A"}).json()
    assert client.patch(f"{base(pid_b)}/gaps/{gap['id']}", json={"status": "closed"}).status_code == 404
    assert client.delete(f"{base(pid_b)}/gaps/{gap['id']}").status_code == 404


def test_bulk_gaps(client):
    pid = make_project(client, "Bulk BA")
    r = client.post(f"{base(pid)}/gaps/bulk", json=[{"area": "A", "impact": "low"}, {"area": "B"}])
    assert r.status_code == 201, r.text
    assert [g["code"] for g in r.json()] == ["GAP-001", "GAP-002"]


def test_stakeholder_crud(client):
    pid = make_project(client, "Stakeholder BA")
    r = client.post(
        f"{base(pid)}/stakeholders",
        json={"name": "  Priya Shah ", "role": "CFO", "influence": "high", "interest": "low", "attitude": "champion"},
    )
    assert r.status_code == 201, r.text
    sh = r.json()
    assert sh["name"] == "Priya Shah" and sh["attitude"] == "champion"

    r = client.patch(f"{base(pid)}/stakeholders/{sh['id']}", json={"interest": "high", "notes": "Budget owner"})
    assert r.json()["interest"] == "high" and r.json()["notes"] == "Budget owner"

    assert client.post(f"{base(pid)}/stakeholders", json={"name": "X", "attitude": "angry"}).status_code == 422
    assert client.delete(f"{base(pid)}/stakeholders/{sh['id']}").status_code == 204
    assert client.get(base(pid)).json()["stakeholders"] == []


def test_process_map_crud(client):
    pid = make_project(client, "Process BA")
    steps = [
        {"actor": "Customer", "action": "Fills paper form"},
        {"actor": "Clerk", "action": "Re-types form into system", "painPoint": "Typos, 2-day delay"},
    ]
    r = client.post(f"{base(pid)}/processes", json={"name": "Account opening", "kind": "as-is", "steps": steps})
    assert r.status_code == 201, r.text
    pm = r.json()
    assert pm["steps"][1]["painPoint"] == "Typos, 2-day delay"
    assert pm["steps"][0]["painPoint"] == ""

    r = client.patch(f"{base(pid)}/processes/{pm['id']}", json={"kind": "to-be", "steps": [{"action": "Applies online"}]})
    assert r.status_code == 200
    assert r.json()["kind"] == "to-be" and len(r.json()["steps"]) == 1

    assert client.post(f"{base(pid)}/processes", json={"name": "Bad", "steps": [{"actor": "x", "action": ""}]}).status_code == 422
    assert client.delete(f"{base(pid)}/processes/{pm['id']}").status_code == 204


def test_suggest_needs_material_then_ai(client):
    pid = make_project(client, "Suggest BA")
    r = client.post(f"{base(pid)}/suggest")
    assert r.status_code == 422 and "requirements or meetings" in r.json()["detail"]

    client.post(f"/api/projects/{pid}/requirements", json={"title": "Reports", "type": "functional", "priority": "must"})
    r = client.post(f"{base(pid)}/suggest")
    # Tests always run with AI off.
    assert r.status_code == 422 and "AI is not configured" in r.json()["detail"]


def test_deleting_project_removes_analysis(client):
    pid = make_project(client, "Cascade BA")
    client.put(f"{base(pid)}/state", json={"currentState": "x"})
    client.post(f"{base(pid)}/gaps", json={"area": "x"})
    client.post(f"{base(pid)}/stakeholders", json={"name": "x"})
    client.post(f"{base(pid)}/processes", json={"name": "x"})
    assert client.delete(f"/api/projects/{pid}").status_code == 204
    assert client.get(base(pid)).status_code == 404


def test_reset_sample_data_clears_analysis(client):
    pid = make_project(client, "Reset BA")
    client.post(f"{base(pid)}/stakeholders", json={"name": "x"})
    assert client.post("/api/admin/reset-sample-data").status_code == 200
    assert client.get(base(pid)).status_code == 404
