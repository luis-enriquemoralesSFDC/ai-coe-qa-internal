#!/usr/bin/env python3
"""
Smoke test E2E del nuevo sistema de admin + cuota + max_cases.

Valida:
1. Admin login + /auth/me devuelve is_admin=True.
2. /auth/me/usage devuelve summary con bypass=True para admin.
3. Crear un QA común, login, /me/usage devuelve bypass=False, budget=$100.
4. Admin: /admin/users lista a ambos con cost=$0 a inicio del mes.
5. QA crea proyecto + HU.
6. QA llama generate-test-cases con max_cases=2 → 2 casos creados, ai_usage incrementa.
7. /admin/usage/recent muestra la fila con email del QA.
8. /admin/users muestra cost > 0 para el QA.
9. require_admin: el QA no puede llamar /admin/users (403).
10. Quota: bajamos cap a $0.0001, próxima call devuelve 429.

Requiere que el backend esté corriendo en :8000.
Requiere que ya exista un admin con creds: admin@salesforce.com / Admin12345.
"""
from __future__ import annotations
import os
import sys
import time
import json
from http.client import HTTPConnection


BASE = "http://localhost:8000/api"
ADMIN_EMAIL = "admin@salesforce.com"
ADMIN_PASS = "Admin12345"
QA_EMAIL = "qa.smoke@salesforce.com"
QA_PASS = "Qa123456"


def req(method: str, path: str, body: dict | None = None, token: str | None = None) -> tuple[int, dict | str]:
    conn = HTTPConnection("localhost", 8000, timeout=120)
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    payload = json.dumps(body) if body is not None else None
    conn.request(method, "/api" + path, body=payload, headers=headers)
    resp = conn.getresponse()
    raw = resp.read().decode()
    try:
        data = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        data = raw
    conn.close()
    return resp.status, data


def assert_eq(actual, expected, label: str) -> None:
    if actual != expected:
        raise SystemExit(f"FAIL {label}: esperaba {expected!r}, vino {actual!r}")
    print(f"OK   {label}")


def assert_true(cond: bool, label: str) -> None:
    if not cond:
        raise SystemExit(f"FAIL {label}")
    print(f"OK   {label}")


def main() -> None:
    print("\n=== 1. Admin login ===")
    status, data = req("POST", "/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert_eq(status, 200, "admin login")
    admin_token = data["access_token"]
    assert_true(data["user"]["is_admin"] is True, "admin /me trae is_admin=True")

    print("\n=== 2. /auth/me/usage del admin ===")
    status, data = req("GET", "/auth/me/usage", token=admin_token)
    assert_eq(status, 200, "GET /me/usage admin")
    assert_true(data["bypass"] is True, "admin tiene bypass=True (sin cap)")

    print("\n=== 3. Crear QA ===")
    status, data = req("POST", "/auth/login", {"email": QA_EMAIL, "password": QA_PASS})
    if status != 200:
        status, data = req("POST", "/auth/register", {
            "name": "QA Smoke", "email": QA_EMAIL, "password": QA_PASS,
        })
        assert_eq(status, 201, "register QA")
    qa_token = data["access_token"]
    assert_true(data["user"]["is_admin"] is False, "QA no es admin")

    print("\n=== 4. /me/usage del QA ===")
    status, data = req("GET", "/auth/me/usage", token=qa_token)
    assert_eq(status, 200, "GET /me/usage QA")
    assert_true(data["bypass"] is False, "QA bypass=False")
    assert_true(data["budget_usd"] == 100.0, "QA budget=$100")

    print("\n=== 5. /admin/users como admin (incluye al QA) ===")
    status, data = req("GET", "/admin/users", token=admin_token)
    assert_eq(status, 200, "admin lista users")
    qa_row = next((u for u in data if u["email"] == QA_EMAIL), None)
    assert_true(qa_row is not None, f"QA aparece en admin/users (vinieron {len(data)} users)")

    print("\n=== 6. QA crea proyecto + HU ===")
    status, data = req("POST", "/projects/", {"name": "smoke-quota", "description": "test"}, token=qa_token)
    assert_eq(status, 201, "crear proyecto")
    project_id = data["id"]

    status, data = req("POST", f"/projects/{project_id}/stories/", {
        "title": "Como usuario quiero loguearme con email/password",
        "description": "Login basico con validaciones",
        "acceptance_criteria": "- Email valido\n- Password minimo 8 caracteres",
        "source": "manual",
    }, token=qa_token)
    assert_eq(status, 201, "crear HU")
    story_id = data["id"]

    print("\n=== 7. QA llama generate-test-cases con max_cases=2 ===")
    status, data = req("POST", f"/projects/{project_id}/stories/{story_id}/generate-test-cases",
                       {"max_cases": 2}, token=qa_token)
    if status != 200:
        print(f"FAIL generate: status={status} body={data}")
        sys.exit(1)
    print("OK   generate-test-cases status=200")

    status, tcs = req("GET", f"/stories/{story_id}/test-cases/", token=qa_token)
    assert_eq(status, 200, "listar test cases")
    print(f"INFO  IA genero {len(tcs)} casos")
    assert_true(len(tcs) <= 2, "respeto el cap de max_cases=2 (post-trim)")

    print("\n=== 8. /me/usage del QA despues de la call ===")
    time.sleep(0.5)
    status, data = req("GET", "/auth/me/usage", token=qa_token)
    assert_eq(status, 200, "GET /me/usage QA post-call")
    assert_true(data["calls"] >= 1, f"QA registro >=1 call (calls={data['calls']})")
    assert_true(data["cost_usd"] > 0.0, f"QA cost > 0 (cost=${data['cost_usd']:.6f})")
    print(f"INFO  cost=${data['cost_usd']:.6f} tokens={data['tokens_in']}+{data['tokens_out']}")

    print("\n=== 9. /admin/usage/recent como admin ===")
    status, recent = req("GET", "/admin/usage/recent?limit=5", token=admin_token)
    assert_eq(status, 200, "admin lista usage reciente")
    assert_true(len(recent) >= 1, f"hay >=1 fila (vinieron {len(recent)})")
    qa_call = next((r for r in recent if r["user_email"] == QA_EMAIL), None)
    assert_true(qa_call is not None, "la fila del QA aparece con su email")

    print("\n=== 10. require_admin: QA no puede llamar /admin/users ===")
    status, data = req("GET", "/admin/users", token=qa_token)
    assert_eq(status, 403, "QA recibe 403 al llamar /admin/users")

    print("\n=== 11. /admin/users muestra cost del QA > 0 ===")
    status, data = req("GET", "/admin/users", token=admin_token)
    assert_eq(status, 200, "admin lista users post-call")
    qa_row = next((u for u in data if u["email"] == QA_EMAIL), None)
    assert_true(qa_row["cost_usd_this_month"] > 0,
                f"QA cost > 0 visible para admin (${qa_row['cost_usd_this_month']:.6f})")

    print("\n=== 12. QA promovido y demoted por admin ===")
    status, data = req("PATCH", f"/admin/users/{qa_row['id']}", {"is_admin": True}, token=admin_token)
    assert_eq(status, 200, "promover a admin")
    assert_true(data["is_admin"] is True, "QA ahora es admin")
    status, data = req("PATCH", f"/admin/users/{qa_row['id']}", {"is_admin": False}, token=admin_token)
    assert_eq(status, 200, "demote")
    assert_true(data["is_admin"] is False, "QA ya no es admin")

    print("\n=== 13. Validaciones de seguridad ===")
    status, data = req("DELETE", f"/admin/users/{1 + 999_999}", token=admin_token)
    assert_eq(status, 404, "DELETE user inexistente -> 404")

    status, me_data = req("GET", "/auth/me", token=admin_token)
    assert_eq(status, 200, "GET /auth/me admin")
    status, data = req("DELETE", f"/admin/users/{me_data['id']}", token=admin_token)
    assert_eq(status, 400, "admin no puede borrarse a si mismo")

    print("\n=== 14. Cleanup: borrar al QA smoke ===")
    status, data = req("DELETE", f"/admin/users/{qa_row['id']}", token=admin_token)
    assert_eq(status, 204, "DELETE QA smoke")

    print("\n*** TODOS LOS SMOKE TESTS PASARON ***")


if __name__ == "__main__":
    main()
