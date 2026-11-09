"""Tests for the Estimation & Pricing module."""
from __future__ import annotations


def make_project(client, name="Estimation Test Project"):
    r = client.post(
        "/api/projects",
        json={"name": name, "clientName": "Acme", "ownerId": "u1", "description": "Estimation testing", "status": "draft"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def base(pid):
    return f"/api/projects/{pid}/estimation"


def add_role(client, pid, name="Developer", rate=500, headcount=1):
    r = client.post(f"{base(pid)}/roles", json={"name": name, "dayRate": rate, "headcount": headcount})
    assert r.status_code == 201, r.text
    return r.json()


def add_item(client, pid, title="Build API", days=(2, 4, 12), **extra):
    r = client.post(f"{base(pid)}/items", json={"title": title, "optimisticDays": days[0], "likelyDays": days[1], "pessimisticDays": days[2], **extra})
    assert r.status_code == 201, r.text
    return r.json()


def test_empty_overview_and_unknown_project(client):
    pid = make_project(client, "Est empty")
    data = client.get(base(pid)).json()
    assert data["settings"]["currency"] == "USD" and data["settings"]["contingencyPct"] == 10 and data["settings"]["updatedAt"] is None
    assert data["roles"] == [] and data["items"] == []
    assert data["summary"]["total"] == 0 and data["summary"]["durationWeeks"] == 0 and data["summary"]["blendedDayRate"] == 0
    assert client.get(base("nope")).status_code == 404


def test_settings_partial_and_validation(client):
    pid = make_project(client, "Est settings")
    r = client.put(f"{base(pid)}/settings", json={"currency": "INR", "commercialModel": "fixed-price"})
    assert r.status_code == 200, r.text
    assert r.json()["updatedAt"]
    r = client.put(f"{base(pid)}/settings", json={"contingencyPct": 0, "assumptions": "Client provides test data"})
    assert r.json()["currency"] == "INR" and r.json()["contingencyPct"] == 0 and r.json()["assumptions"] == "Client provides test data"
    for bad in ({"currency": "XXX"}, {"contingencyPct": 101}, {"discountPct": -1}, {"daysPerPoint": 0}, {"commercialModel": "free"}):
        assert client.put(f"{base(pid)}/settings", json=bad).status_code == 422


def test_pert_cost_and_price_calculation(client):
    pid = make_project(client, "Est maths")
    dev = add_role(client, pid, "Developer", 600, headcount=2)
    qa = add_role(client, pid, "QA", 300)
    item = add_item(client, pid, "API", (2, 4, 12), roleId=dev["id"])  # (2 + 16 + 12) / 6 = 5 days
    assert item["expectedDays"] == 5 and item["cost"] == 3000
    add_item(client, pid, "Testing", (5, 5, 5), roleId=qa["id"], phase="test")
    client.put(f"{base(pid)}/settings", json={"contingencyPct": 10, "discountPct": 20})

    s = client.get(base(pid)).json()["summary"]
    assert s["totalDays"] == 10 and s["subtotal"] == 4500 and s["blendedDayRate"] == 450
    assert s["contingencyAmount"] == 450
    assert s["discountAmount"] == 990  # 20% of subtotal + contingency
    assert s["total"] == 3960
    assert s["durationWeeks"] == 1  # QA: 5 days / 1 person; developers: 5 days / 2 people
    assert {t["name"]: t["weeks"] for t in s["byRole"]} == {"Developer": 0.5, "QA": 1}
    assert [(p["phase"], p["cost"]) for p in s["byPhase"]] == [("build", 3000), ("test", 1500)]


def test_unassigned_and_unestimated_items_are_reported(client):
    pid = make_project(client, "Est unassigned")
    add_item(client, pid, "No role", (1, 1, 1))
    add_item(client, pid, "No numbers", (0, 0, 0))
    s = client.get(base(pid)).json()["summary"]
    assert s["totalDays"] == 1 and s["unassignedDays"] == 1 and s["unestimatedItems"] == 1 and s["subtotal"] == 0


def test_item_crud_and_codes_never_reused(client):
    pid = make_project(client, "Est items")
    first = add_item(client, pid, " Portal ")
    assert first["code"] == "EST-001" and first["title"] == "Portal" and first["phase"] == "build"
    second = add_item(client, pid, "Temporary")
    assert client.delete(f"{base(pid)}/items/{second['id']}").status_code == 204
    assert add_item(client, pid, "Third")["code"] == "EST-003"
    r = client.patch(f"{base(pid)}/items/{first['id']}", json={"phase": "design", "title": None})
    assert r.json()["phase"] == "design" and r.json()["title"] == "Portal"


def test_item_validation(client):
    pid = make_project(client, "Est validation")
    url = f"{base(pid)}/items"
    assert client.post(url, json={"title": ""}).status_code == 422
    assert client.post(url, json={"title": "X", "phase": "party"}).status_code == 422
    assert client.post(url, json={"title": "X", "likelyDays": -1}).status_code == 422
    assert client.post(url, json={"title": "X", "optimisticDays": 5, "likelyDays": 1, "pessimisticDays": 9}).status_code == 422
    assert client.post(url, json={"title": "X", "roleId": "er-nope"}).status_code == 422
    assert client.post(url, json={"title": "X", "requirementIds": ["r-nope"]}).status_code == 422
    item = add_item(client, pid, "Valid", (1, 2, 3))
    r = client.patch(f"{url}/{item['id']}", json={"likelyDays": 9})  # above the saved pessimistic value
    assert r.status_code == 422
    assert client.get(base(pid)).json()["items"][0]["likelyDays"] == 2


def test_patch_role_id_null_unassigns(client):
    pid = make_project(client, "Est unassign")
    role = add_role(client, pid)
    item = add_item(client, pid, "Work", (1, 1, 1), roleId=role["id"])
    assert item["cost"] == 500
    untouched = client.patch(f"{base(pid)}/items/{item['id']}", json={"phase": "test"}).json()
    assert untouched["roleId"] == role["id"]
    cleared = client.patch(f"{base(pid)}/items/{item['id']}", json={"roleId": None}).json()
    assert cleared["roleId"] is None and cleared["cost"] == 0


def test_role_crud_and_delete_unassigns_items(client):
    pid = make_project(client, "Est roles")
    role = add_role(client, pid, " Architect ", 900)
    assert role["name"] == "Architect" and role["headcount"] == 1
    item = add_item(client, pid, "Design", (1, 1, 1), roleId=role["id"])
    r = client.patch(f"{base(pid)}/roles/{role['id']}", json={"dayRate": 1000})
    assert r.json()["dayRate"] == 1000 and r.json()["name"] == "Architect"
    assert client.get(base(pid)).json()["items"][0]["cost"] == 1000
    assert client.post(f"{base(pid)}/roles", json={"name": "X", "headcount": 0}).status_code == 422
    assert client.post(f"{base(pid)}/roles", json={"name": "X", "dayRate": -5}).status_code == 422
    assert client.delete(f"{base(pid)}/roles/{role['id']}").status_code == 204
    data = client.get(base(pid)).json()
    assert data["roles"] == [] and data["items"][0]["id"] == item["id"] and data["items"][0]["roleId"] is None


def test_other_project_is_404_or_rejected(client):
    a, b = make_project(client, "Est A"), make_project(client, "Est B")
    role = add_role(client, a)
    item = add_item(client, a)
    assert client.patch(f"{base(b)}/roles/{role['id']}", json={"name": "x"}).status_code == 404
    assert client.delete(f"{base(b)}/roles/{role['id']}").status_code == 404
    assert client.patch(f"{base(b)}/items/{item['id']}", json={"title": "x"}).status_code == 404
    assert client.delete(f"{base(b)}/items/{item['id']}").status_code == 404
    assert client.post(f"{base(b)}/items", json={"title": "X", "roleId": role["id"]}).status_code == 422


def test_items_from_stories(client):
    pid = make_project(client, "Est stories")
    assert client.post(f"{base(pid)}/items/from-stories").status_code == 422
    req = client.post(f"/api/projects/{pid}/requirements", json={"title": "KYC", "type": "functional", "priority": "must"}).json()
    client.put(f"{base(pid)}/settings", json={"daysPerPoint": 2})
    sized = client.post(f"/api/projects/{pid}/stories", json={"title": "Upload ID", "storyPoints": 3, "requirementIds": [req["id"]]})
    assert sized.status_code == 201, sized.text
    client.post(f"/api/projects/{pid}/stories", json={"title": "Unsized"})

    r = client.post(f"{base(pid)}/items/from-stories")
    assert r.status_code == 201, r.text
    first, second = r.json()
    assert first["title"].endswith("Upload ID") and first["storyId"] == sized.json()["id"] and first["requirementIds"] == [req["id"]]
    assert (first["optimisticDays"], first["likelyDays"], first["pessimisticDays"]) == (4.5, 6, 9)
    assert second["pessimisticDays"] == 0
    assert client.get(base(pid)).json()["summary"]["unestimatedItems"] == 1
    assert client.post(f"{base(pid)}/items/from-stories").status_code == 422  # all linked now


def test_deleting_story_or_requirement_unlinks_items(client):
    pid = make_project(client, "Est unlink")
    req = client.post(f"/api/projects/{pid}/requirements", json={"title": "KYC", "type": "functional", "priority": "must"}).json()
    story = client.post(f"/api/projects/{pid}/stories", json={"title": "Story", "storyPoints": 1}).json()
    client.post(f"{base(pid)}/items/from-stories")
    add_item(client, pid, "Linked", requirementIds=[req["id"]])
    assert client.delete(f"/api/projects/{pid}/stories/{story['id']}").status_code == 204
    assert client.delete(f"/api/projects/{pid}/requirements/{req['id']}").status_code == 204
    items = client.get(base(pid)).json()["items"]
    assert len(items) == 2 and items[0]["storyId"] is None and items[1]["requirementIds"] == []


def test_export_markdown(client):
    pid = make_project(client, "Est Export")
    req = client.post(f"/api/projects/{pid}/requirements", json={"title": "KYC", "type": "functional", "priority": "must"}).json()
    role = add_role(client, pid, "Dev | Senior", 1000)
    add_item(client, pid, "API", (1, 1, 1), roleId=role["id"], requirementIds=[req["id"]])
    add_item(client, pid, "Unowned", (2, 2, 2))
    client.put(f"{base(pid)}/settings", json={"currency": "GBP", "commercialModel": "milestone", "assumptions": "UAT by client"})
    r = client.get(f"{base(pid)}/export")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/markdown")
    assert 'filename="est-export-estimate.md"' in r.headers["content-disposition"]
    text = r.text
    assert text.startswith("# Est Export: Estimate & Pricing") and "Commercial model: Milestone based" in text
    assert "| **Total** | **GBP 1,100.00** |" in text
    assert "_2 days have no role and are not priced._" in text
    assert "| Dev \\| Senior | 1 | GBP 1,000.00 | 1 | 0.2 | GBP 1,000.00 |" in text
    assert "| EST-001 | API | Build |" in text and req["code"] in text and "UAT by client" in text


def test_project_delete_and_reset_remove_estimation(client):
    pid = make_project(client, "Est cascade")
    role = add_role(client, pid)
    add_item(client, pid, roleId=role["id"])
    assert client.delete(f"/api/projects/{pid}").status_code == 204
    assert client.get(base(pid)).status_code == 404

    pid = make_project(client, "Est reset")
    add_role(client, pid)
    add_item(client, pid)
    assert client.post("/api/admin/reset-sample-data").status_code == 200
    assert client.get(base(pid)).status_code == 404
