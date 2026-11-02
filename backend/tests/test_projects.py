NEW_PROJECT = {
    "name": "Test Project",
    "clientName": "Acme Health",
    "industry": "Healthcare",
    "ownerId": "u1",
    "description": "Project created in pytest.",
    "status": "draft",
}


def create(client, **overrides):
    response = client.post("/api/projects", json={**NEW_PROJECT, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


def test_sample_data_is_seeded(client):
    projects = client.get("/api/projects").json()
    ids = {p["id"] for p in projects}
    assert "p-1001" in ids
    assert len(projects) >= 7
    # camelCase keys, matching lib/types.ts
    assert {"ownerId", "createdAt", "updatedAt", "stages", "counts"} <= projects[0].keys()


def test_team_endpoint(client):
    team = client.get("/api/team").json()
    assert {m["id"] for m in team} >= {"u1", "u2", "u3", "u4", "u5"}


def test_create_and_fetch_project(client):
    created = create(client)
    assert created["client"]["name"] == "Acme Health"
    assert created["stages"][0] == {"key": "sources", "state": "current"}
    assert client.get(f"/api/projects/{created['id']}").json()["id"] == created["id"]

    activities = client.get(f"/api/projects/{created['id']}/activities").json()
    assert activities[0]["message"] == "created the project"


def test_create_rejects_bad_input(client):
    assert client.post("/api/projects", json={**NEW_PROJECT, "name": ""}).status_code == 422
    assert client.post("/api/projects", json={**NEW_PROJECT, "status": "bogus"}).status_code == 422


def test_list_filters(client):
    create(client, name="Filter Target Zebra", status="on-hold")
    hits = client.get("/api/projects", params={"q": "zebra"}).json()
    assert [p["name"] for p in hits] == ["Filter Target Zebra"]
    on_hold = client.get("/api/projects", params={"status": "on-hold"}).json()
    assert all(p["status"] == "on-hold" for p in on_hold)


def test_patch_project(client):
    project = create(client)
    response = client.patch(
        f"/api/projects/{project['id']}",
        json={"status": "in-progress", "progress": 40, "client": {"region": "EMEA"}},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "in-progress"
    assert body["progress"] == 40
    assert body["client"]["region"] == "EMEA"
    assert body["client"]["name"] == "Acme Health"


def test_patch_cannot_change_id_or_set_bad_values(client):
    project = create(client)
    response = client.patch(f"/api/projects/{project['id']}", json={"id": "hacked"})
    assert response.status_code == 200
    assert response.json()["id"] == project["id"]
    assert client.patch(f"/api/projects/{project['id']}", json={"progress": 500}).status_code == 422


def test_delete_project(client):
    project = create(client, status="on-hold")
    assert client.delete(f"/api/projects/{project['id']}").status_code == 204
    assert client.get(f"/api/projects/{project['id']}").status_code == 404


def test_upload_source_updates_count_and_is_safe(client, tmp_root):
    project = create(client)
    pid = project["id"]
    for _ in range(2):  # same name twice must not overwrite
        r = client.post(
            f"/api/projects/{pid}/sources",
            files={"file": ("../../evil notes.txt", b"hello", "text/plain")},
        )
        assert r.status_code == 201, r.text
        assert r.json()["name"] == "evil notes.txt"
        assert r.json()["type"] == "transcript"

    assert client.get(f"/api/projects/{pid}").json()["counts"]["sources"] == 2
    assert len(client.get(f"/api/projects/{pid}/sources").json()) == 2
    stored = list((tmp_root / "uploads" / pid).iterdir())
    assert len(stored) == 2
    assert not (tmp_root / "evil notes.txt").exists()


def test_reset_sample_data(client):
    create(client, name="Will be wiped")
    assert client.post("/api/admin/reset-sample-data").status_code == 200
    names = [p["name"] for p in client.get("/api/projects").json()]
    assert "Will be wiped" not in names
    assert len(names) == 7
