"""Tests de integración para autenticación."""


def test_register_success(client):
    resp = client.post("/api/auth/register", json={
        "name": "Laura",
        "email": "laura@test.com",
        "password": "secret123",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "laura@test.com"


def test_register_duplicate_email(client):
    payload = {"name": "A", "email": "dup@test.com", "password": "pass123"}
    client.post("/api/auth/register", json=payload)
    resp = client.post("/api/auth/register", json=payload)
    assert resp.status_code == 400
    assert "registrado" in resp.json()["detail"]


def test_login_success(client):
    client.post("/api/auth/register", json={
        "name": "User", "email": "login@test.com", "password": "pass123"
    })
    resp = client.post("/api/auth/login", json={
        "email": "login@test.com", "password": "pass123"
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password(client):
    client.post("/api/auth/register", json={
        "name": "User", "email": "wrong@test.com", "password": "correct"
    })
    resp = client.post("/api/auth/login", json={
        "email": "wrong@test.com", "password": "incorrect"
    })
    assert resp.status_code == 401


def test_login_unknown_email(client):
    resp = client.post("/api/auth/login", json={
        "email": "nobody@test.com", "password": "pass"
    })
    assert resp.status_code == 401


def test_me_authenticated(client, registered_user, auth_headers):
    resp = client.get("/api/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == registered_user["user"]["email"]


def test_me_unauthenticated(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 403
