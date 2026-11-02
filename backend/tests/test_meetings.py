from pathlib import Path


def test_meetings_api_and_unassigned(client, tmp_root):
    # Test listing unassigned meetings
    res = client.get("/api/meetings/unassigned")
    assert res.status_code == 200
    assert isinstance(res.json(), list)

    # Test devices endpoint
    devices = client.get("/api/devices")
    assert devices.status_code == 200
    assert "inputs" in devices.json()

    # Test meeting status
    status = client.get("/api/meetings/status")
    assert status.status_code == 200
    assert "recording" in status.json()


def test_start_meeting_validation_and_attach(client, tmp_root):
    # Project 404 validation on start
    bad_start = client.post("/api/meetings/start", json={"projectId": "p-nonexistent"})
    assert bad_start.status_code == 404

    # Create a project
    project = client.post(
        "/api/projects",
        json={
            "name": "Meeting Project",
            "clientName": "Client ABC",
            "ownerId": "u1",
            "description": "Test meetings",
            "status": "draft",
        },
    ).json()
    pid = project["id"]

    # Create an unassigned meeting in tmp_root meetings dir to test storage import
    meetings_dir = tmp_root / "meetings"
    m_dir = meetings_dir / "meeting_2026-10-30_12-00-00"
    m_dir.mkdir(parents=True, exist_ok=True)
    (m_dir / "transcript.txt").write_text("Hello client from meeting transcript", encoding="utf-8")

    # Sync meetings
    sync_res = client.post("/api/meetings/sync-storage")
    assert sync_res.status_code == 200

    unassigned = client.get("/api/meetings/unassigned").json()
    meeting = next((m for m in unassigned if m["id"] == "meeting_2026-10-30_12-00-00"), None)
    assert meeting is not None
    assert "Hello client" in meeting["transcript"]

    # Attach meeting to project
    patch_res = client.patch(f"/api/meetings/{meeting['id']}", json={"projectId": pid})
    assert patch_res.status_code == 200
    assert patch_res.json()["projectId"] == pid

    # Verify project meetings
    proj_meetings = client.get(f"/api/projects/{pid}/meetings").json()
    assert any(m["id"] == meeting["id"] for m in proj_meetings)

    # Verify a transcript SourceDocument was created and counts updated
    sources = client.get(f"/api/projects/{pid}/sources").json()
    assert any(s["type"] == "transcript" for s in sources)
    proj_data = client.get(f"/api/projects/{pid}").json()
    assert proj_data["counts"]["sources"] >= 1
