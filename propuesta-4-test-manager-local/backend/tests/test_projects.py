"""Tests de integración para proyectos."""


def test_create_project(client, auth_headers):
    resp = client.post("/api/projects/", json={"name": "Proyecto A"}, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Proyecto A"
    assert "id" in data


def test_list_projects_empty(client, auth_headers):
    resp = client.get("/api/projects/", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_list_projects_returns_own_only(client):
    # Dos usuarios distintos no comparten proyectos
    user_a = client.post("/api/auth/register", json={
        "name": "A", "email": "a@own.com", "password": "pass123"
    }).json()
    user_b = client.post("/api/auth/register", json={
        "name": "B", "email": "b@own.com", "password": "pass123"
    }).json()
    headers_a = {"Authorization": f"Bearer {user_a['access_token']}"}
    headers_b = {"Authorization": f"Bearer {user_b['access_token']}"}

    client.post("/api/projects/", json={"name": "De A"}, headers=headers_a)

    projects_b = client.get("/api/projects/", headers=headers_b).json()
    names = [p["name"] for p in projects_b]
    assert "De A" not in names


def test_get_project(client, auth_headers):
    project_id = client.post("/api/projects/", json={"name": "Get me"}, headers=auth_headers).json()["id"]
    resp = client.get(f"/api/projects/{project_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Get me"


def test_get_project_not_found(client, auth_headers):
    resp = client.get("/api/projects/99999", headers=auth_headers)
    assert resp.status_code == 404


def test_update_project(client, auth_headers):
    project_id = client.post("/api/projects/", json={"name": "Old"}, headers=auth_headers).json()["id"]
    resp = client.put(f"/api/projects/{project_id}", json={"name": "New"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "New"


def test_delete_project(client, auth_headers):
    project_id = client.post("/api/projects/", json={"name": "To delete"}, headers=auth_headers).json()["id"]
    resp = client.delete(f"/api/projects/{project_id}", headers=auth_headers)
    assert resp.status_code == 204
    assert client.get(f"/api/projects/{project_id}", headers=auth_headers).status_code == 404


def test_other_user_cannot_access_project(client):
    owner = client.post("/api/auth/register", json={
        "name": "Owner", "email": "owner@sec.com", "password": "pass123"
    }).json()
    intruder = client.post("/api/auth/register", json={
        "name": "Intruder", "email": "intruder@sec.com", "password": "pass123"
    }).json()

    headers_owner = {"Authorization": f"Bearer {owner['access_token']}"}
    headers_intruder = {"Authorization": f"Bearer {intruder['access_token']}"}

    project_id = client.post("/api/projects/", json={"name": "Private"}, headers=headers_owner).json()["id"]

    assert client.get(f"/api/projects/{project_id}", headers=headers_intruder).status_code == 404
    assert client.delete(f"/api/projects/{project_id}", headers=headers_intruder).status_code == 404


def test_create_project_requires_auth(client):
    resp = client.post("/api/projects/", json={"name": "No auth"})
    assert resp.status_code == 403
