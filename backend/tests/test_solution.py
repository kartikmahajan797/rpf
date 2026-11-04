"""Tests for the Solution Design module."""
from __future__ import annotations


def make_project(client, name="Solution Test Project"):
    r = client.post(
        "/api/projects",
        json={"name": name, "clientName": "Acme", "ownerId": "u1", "description": "Solution testing", "status": "draft"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def base(pid):
    return f"/api/projects/{pid}/solution"


def add_req(client, pid, title, type_="functional", **extra):
    r = client.post(f"/api/projects/{pid}/requirements", json={"title": title, "type": type_, "priority": "must", **extra})
    assert r.status_code == 201, r.text
    return r.json()


def test_empty_overview_and_unknown_project(client):
    pid = make_project(client, "Sol empty")
    data = client.get(base(pid)).json()
    assert data["design"]["hosting"] == "tbd" and data["design"]["overview"] == "" and data["design"]["updatedAt"] is None
    assert data["components"] == [] and data["integrations"] == [] and data["decisions"] == []
    assert client.get(base("nope")).status_code == 404


def test_save_design_partial(client):
    pid = make_project(client, "Sol design")
    r = client.put(f"{base(pid)}/design", json={"overview": "Portal + APIs", "hosting": "cloud", "architectureStyle": "  Modular monolith "})
    assert r.status_code == 200, r.text
    assert r.json()["architectureStyle"] == "Modular monolith" and r.json()["updatedAt"]
    r = client.put(f"{base(pid)}/design", json={"nfrApproach": "SSO, 99.9%"})
    assert r.json()["overview"] == "Portal + APIs" and r.json()["hosting"] == "cloud" and r.json()["nfrApproach"] == "SSO, 99.9%"
    assert client.put(f"{base(pid)}/design", json={"hosting": "mars"}).status_code == 422
    assert "document" in [a["kind"] for a in client.get(f"/api/projects/{pid}/activities").json()]


def test_component_crud(client):
    pid = make_project(client, "Sol components")
    req = add_req(client, pid, "Online KYC")
    r = client.post(f"{base(pid)}/components", json={"name": " Customer portal ", "layer": "channel", "technology": "Next.js", "requirementIds": [req["id"]]})
    assert r.status_code == 201, r.text
    c = r.json()
    assert c["name"] == "Customer portal" and c["isNew"] is True and c["requirementIds"] == [req["id"]]
    r = client.patch(f"{base(pid)}/components/{c['id']}", json={"isNew": False, "layer": "service", "name": None})
    assert r.json()["isNew"] is False and r.json()["layer"] == "service" and r.json()["name"] == "Customer portal"
    assert client.post(f"{base(pid)}/components", json={"name": "X", "layer": "cloud"}).status_code == 422
    assert client.post(f"{base(pid)}/components", json={"name": "X", "requirementIds": ["r-nope"]}).status_code == 422
    assert client.post(f"{base(pid)}/components", json={"name": ""}).status_code == 422
    assert client.delete(f"{base(pid)}/components/{c['id']}").status_code == 204
    assert client.get(base(pid)).json()["components"] == []


def test_integration_crud(client):
    pid = make_project(client, "Sol integrations")
    r = client.post(f"{base(pid)}/integrations", json={"name": "Credit check", "externalSystem": "Experian", "direction": "both", "protocol": "soap", "frequency": "on-demand"})
    assert r.status_code == 201, r.text
    i = r.json()
    assert i["status"] == "proposed" and i["protocol"] == "soap"
    r = client.patch(f"{base(pid)}/integrations/{i['id']}", json={"status": "agreed"})
    assert r.json()["status"] == "agreed"
    assert client.post(f"{base(pid)}/integrations", json={"name": "X", "protocol": "fax"}).status_code == 422
    assert client.delete(f"{base(pid)}/integrations/{i['id']}").status_code == 204


def test_decision_codes_never_reused(client):
    pid = make_project(client, "Sol decisions")
    d1 = client.post(f"{base(pid)}/decisions", json={"title": "Use PostgreSQL", "decision": "Postgres 16"}).json()
    assert d1["code"] == "ADR-001" and d1["status"] == "proposed"
    d2 = client.post(f"{base(pid)}/decisions", json={"title": "Use Kafka"}).json()
    assert client.delete(f"{base(pid)}/decisions/{d2['id']}").status_code == 204
    assert client.post(f"{base(pid)}/decisions", json={"title": "Use SSO"}).json()["code"] == "ADR-003"
    r = client.patch(f"{base(pid)}/decisions/{d1['id']}", json={"status": "accepted"})
    assert r.json()["status"] == "accepted"
    assert client.post(f"{base(pid)}/decisions", json={"title": "X", "status": "maybe"}).status_code == 422


def test_other_project_is_404(client):
    a, b = make_project(client, "Sol A"), make_project(client, "Sol B")
    c = client.post(f"{base(a)}/components", json={"name": "A only"}).json()
    i = client.post(f"{base(a)}/integrations", json={"name": "A only"}).json()
    d = client.post(f"{base(a)}/decisions", json={"title": "A only"}).json()
    assert client.patch(f"{base(b)}/components/{c['id']}", json={"name": "x"}).status_code == 404
    assert client.delete(f"{base(b)}/integrations/{i['id']}").status_code == 404
    assert client.patch(f"{base(b)}/decisions/{d['id']}", json={"status": "accepted"}).status_code == 404


def test_deleting_requirement_unlinks_components_and_integrations(client):
    pid = make_project(client, "Sol unlink")
    req = add_req(client, pid, "Payments API", type_="integration")
    client.post(f"{base(pid)}/components", json={"name": "Gateway", "requirementIds": [req["id"]]})
    client.post(f"{base(pid)}/integrations", json={"name": "Payments", "requirementIds": [req["id"]]})
    client.delete(f"/api/projects/{pid}/requirements/{req['id']}")
    data = client.get(base(pid)).json()
    assert data["components"][0]["requirementIds"] == [] and data["integrations"][0]["requirementIds"] == []


def test_integrations_from_requirements(client):
    pid = make_project(client, "Sol from reqs")
    add_req(client, pid, "Portal")  # functional: ignored
    assert client.post(f"{base(pid)}/integrations/from-requirements").status_code == 422
    r1 = add_req(client, pid, "Core banking sync", type_="integration", description="Accounts and balances")
    add_req(client, pid, "Credit bureau check", type_="integration")
    client.post(f"{base(pid)}/integrations", json={"name": "Already done", "requirementIds": [r1["id"]]})
    r = client.post(f"{base(pid)}/integrations/from-requirements")
    assert r.status_code == 201, r.text
    assert [i["name"] for i in r.json()] == ["Credit bureau check"]
    assert client.post(f"{base(pid)}/integrations/from-requirements").status_code == 422


def test_bulk(client):
    pid = make_project(client, "Sol bulk")
    r = client.post(f"{base(pid)}/bulk", json={
        "components": [{"name": "Portal", "layer": "channel"}, {"name": "DB", "layer": "data", "isNew": False}],
        "integrations": [{"name": "CRM sync"}],
        "decisions": [{"title": "Cloud first"}, {"title": "SSO"}],
    })
    assert r.status_code == 201, r.text
    data = r.json()
    assert len(data["components"]) == 2 and len(data["integrations"]) == 1
    assert [d["code"] for d in data["decisions"]] == ["ADR-001", "ADR-002"]


def test_export_markdown(client):
    pid = make_project(client, "Sol Export")
    req = add_req(client, pid, "Online KYC")
    client.put(f"{base(pid)}/design", json={"overview": "A portal.", "hosting": "hybrid", "architectureStyle": "Microservices"})
    client.post(f"{base(pid)}/components", json={"name": "Portal | web", "layer": "channel", "technology": "React", "requirementIds": [req["id"]]})
    client.post(f"{base(pid)}/integrations", json={"name": "KYC", "externalSystem": "Onfido", "protocol": "rest"})
    client.post(f"{base(pid)}/decisions", json={"title": "Hybrid hosting", "decision": "Keep core on-prem"})
    r = client.get(f"{base(pid)}/export")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/markdown")
    assert 'filename="sol-export-solution-design.md"' in r.headers["content-disposition"]
    text = r.text
    assert text.startswith("# Sol Export: Solution Design")
    assert "Hosting: Hybrid · Architecture: Microservices" in text
    assert "### Channels & front-ends" in text
    assert "| Portal \\| web | React | New |" in text and "REQ-001" in text
    assert "| KYC | Onfido | outbound | REST |" in text
    assert "### ADR-001: Hybrid hosting (proposed)" in text and "**Decision:** Keep core on-prem" in text


def test_suggest_needs_material_then_ai(client):
    pid = make_project(client, "Sol AI")
    r = client.post(f"{base(pid)}/suggest")
    assert r.status_code == 422 and "requirements or meetings" in r.json()["detail"]
    add_req(client, pid, "X")
    r = client.post(f"{base(pid)}/suggest")
    assert r.status_code == 422 and "AI is not configured" in r.json()["detail"]


def test_project_delete_and_reset_remove_solution(client):
    pid = make_project(client, "Sol cascade")
    client.put(f"{base(pid)}/design", json={"overview": "x"})
    client.post(f"{base(pid)}/components", json={"name": "x"})
    client.post(f"{base(pid)}/integrations", json={"name": "x"})
    client.post(f"{base(pid)}/decisions", json={"title": "x"})
    assert client.delete(f"/api/projects/{pid}").status_code == 204
    assert client.get(base(pid)).status_code == 404

    pid = make_project(client, "Sol reset")
    client.post(f"{base(pid)}/decisions", json={"title": "x"})
    assert client.post("/api/admin/reset-sample-data").status_code == 200
    assert client.get(base(pid)).status_code == 404
