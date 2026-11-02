def test_source_download_and_preview(client, tmp_root):
    # Create a project and upload a text file
    project = client.post(
        "/api/projects",
        json={
            "name": "Sources Project",
            "clientName": "Test Client",
            "ownerId": "u1",
            "description": "Test sources",
            "status": "draft",
        },
    ).json()
    pid = project["id"]

    upload_res = client.post(
        f"/api/projects/{pid}/sources",
        files={"file": ("notes.txt", b"Hello from notes file!", "text/plain")},
    )
    assert upload_res.status_code == 201
    source = upload_res.json()
    sid = source["id"]

    # Download source
    dl_res = client.get(f"/api/projects/{pid}/sources/{sid}/download")
    assert dl_res.status_code == 200
    assert dl_res.content == b"Hello from notes file!"

    # Preview source
    preview_res = client.get(f"/api/projects/{pid}/sources/{sid}/preview")
    assert preview_res.status_code == 200
    assert preview_res.json()["content"] == "Hello from notes file!"
    assert preview_res.json()["name"] == "notes.txt"

    # Non-existent source download -> 404
    assert client.get(f"/api/projects/{pid}/sources/s-fake/download").status_code == 404
    assert client.get("/api/projects/p-fake/sources/s-fake/download").status_code == 404


def test_source_delete_updates_counts_and_removes_file(client, tmp_root):
    project = client.post(
        "/api/projects",
        json={
            "name": "Delete Source Project",
            "clientName": "Test Client",
            "ownerId": "u1",
            "description": "Test delete",
            "status": "draft",
        },
    ).json()
    pid = project["id"]

    upload_res = client.post(
        f"/api/projects/{pid}/sources",
        files={"file": ("to_delete.txt", b"delete me", "text/plain")},
    )
    assert upload_res.status_code == 201
    sid = upload_res.json()["id"]

    # Verify counts
    assert client.get(f"/api/projects/{pid}").json()["counts"]["sources"] == 1

    # Delete source
    del_res = client.delete(f"/api/projects/{pid}/sources/{sid}")
    assert del_res.status_code == 204

    # Verify count decremented
    assert client.get(f"/api/projects/{pid}").json()["counts"]["sources"] == 0

    # Source no longer listed
    sources = client.get(f"/api/projects/{pid}/sources").json()
    assert all(s["id"] != sid for s in sources)

    # Subsequent delete or download gives 404
    assert client.delete(f"/api/projects/{pid}/sources/{sid}").status_code == 404
    assert client.get(f"/api/projects/{pid}/sources/{sid}/download").status_code == 404
