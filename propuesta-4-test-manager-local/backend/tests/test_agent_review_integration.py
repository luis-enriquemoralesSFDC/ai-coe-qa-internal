"""
Smoke tests de integración para POST /projects/{pid}/stories/{sid}/agent/review.

Cubren los 4 escenarios de seguridad/robustez que NO se pueden validar con
tests unitarios:

1. Auth — sin Bearer token, el endpoint NO responde 200.
2. Ownership cross-user (defensa IDOR) — User B no accede a HU de User A.
3. Cuota excedida → 429 con detail estructurado (mismo contrato que los demás
   endpoints de IA).
4. PII no-leak — la response NO contiene title/description/AC literales (defensa
   en profundidad: si en el futuro algún campo se agrega por accidente al
   response, este test lo detecta).
5. (Bonus) Idempotencia INVEST — re-run del agente sobre la misma HU saltea el
   step de INVEST y NO consume cuota extra del analyzer (sí del generator).

Diseño:
- Inserta usuarios/proyectos/HUs DIRECTO en BD para esquivar la validación de
  email @salesforce.com de las fixtures viejas del repo (deuda preexistente
  fuera del alcance del agente).
- Monkeypatchea los singletons _invest_analyzer y _tc_generator en
  app.dependencies con AsyncMocks que devuelven payloads sintéticos.
  Beneficios: cero red, cero costo USD, cero flakiness, ~50ms por test.
- Reusa las fixtures `client` y `db_session` de conftest.py existente.
"""
from unittest.mock import AsyncMock

import pytest

from app.auth.utils import create_access_token, hash_password
from app.interfaces.ai_provider import UsageInfo
from app.models import Project, User, UserStory
from app.services.usage_service import QuotaExceeded


# ── Helpers de setup ─────────────────────────────────────────────────────────

def _make_user(db, email: str, name: str = "Test") -> User:
    user = User(name=name, email=email, password_hash=hash_password("x"))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_project(db, user: User, name: str = "Proj") -> Project:
    p = Project(name=name, user_id=user.id)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _make_story(db, project: Project, **kwargs) -> UserStory:
    defaults = {
        "title": "Login con MFA",
        "description": "Permitir 2FA",
        "acceptance_criteria": "OTP correcto",
    }
    defaults.update(kwargs)
    s = UserStory(project_id=project.id, source="manual", **defaults)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def _auth(user: User) -> dict:
    token = create_access_token({"sub": user.id})
    return {"Authorization": f"Bearer {token}"}


# ── Helpers de payloads sintéticos ───────────────────────────────────────────

def _make_invest_payload() -> dict:
    return {
        "independent": {"score": 8, "feedback": "ok", "suggestions": []},
        "negotiable": {"score": 7, "feedback": "ok", "suggestions": []},
        "valuable": {"score": 9, "feedback": "ok", "suggestions": []},
        "estimable": {"score": 7, "feedback": "ok", "suggestions": []},
        "small": {"score": 8, "feedback": "ok", "suggestions": []},
        "testable": {"score": 9, "feedback": "ok", "suggestions": []},
        "overall_score": 8.0,
        "overall_feedback": "Buen story con MFA bien definido.",
    }


def _make_tc_payload(n: int = 5) -> list[dict]:
    return [
        {
            "title": f"Caso {i}",
            "test_type": "happy_path",
            "priority": "high",
            "precondition": "Data:\n- Usuario creado\nEntorno:\n- App OK",
            "steps": [{"order": 1, "action": "Hacer login", "expected": ""}],
            "expected_result": "UI:\n- Dashboard\nPersistencia:\n- Sesión activa\nIntegración:\n- 200 OK",
        }
        for i in range(n)
    ]


def _make_usage(operation: str = "tc_generate_single") -> UsageInfo:
    return UsageInfo(
        operation=operation, model="gpt-4o-test",
        tokens_in=100, tokens_out=200, cost_usd=0.001, latency_ms=50,
    )


@pytest.fixture()
def fake_providers(monkeypatch):
    """
    Monkeypatch de _invest_analyzer y _tc_generator en app.dependencies.

    Las funciones get_*_service se ejecutan por request y leen los singletons
    del módulo, así que esta sustitución toma efecto en cualquier request que
    cree el TestClient durante el test.
    """
    from app import dependencies as deps

    invest_mock = AsyncMock()
    invest_mock.analyze.return_value = (
        _make_invest_payload(), _make_usage("invest_analyze"),
    )

    gen_mock = AsyncMock()
    gen_mock.generate.return_value = (_make_tc_payload(5), _make_usage())
    gen_mock.generate_with_context.return_value = (
        _make_tc_payload(7), _make_usage(),
    )

    monkeypatch.setattr(deps, "_invest_analyzer", invest_mock)
    monkeypatch.setattr(deps, "_tc_generator", gen_mock)

    return invest_mock, gen_mock


# ── Tests ────────────────────────────────────────────────────────────────────

def test_unauthenticated_request_blocked(client):
    """Sin Bearer token, el endpoint NO debe ser accesible (401/403)."""
    resp = client.post("/api/projects/1/stories/1/agent/review")
    assert resp.status_code in (401, 403), (
        f"Esperaba 401/403 sin token, recibí {resp.status_code}"
    )


def test_cross_user_isolation_returns_404(client, db_session, fake_providers):
    """
    User B NO puede invocar el agente sobre una HU de User A (defensa IDOR).
    _require_project devuelve 404 (no 403) intencionalmente para no leakar
    si el proyecto existe o no.
    """
    user_a = _make_user(db_session, "agent_isoa@salesforce.com", "A")
    user_b = _make_user(db_session, "agent_isob@salesforce.com", "B")
    project_a = _make_project(db_session, user_a)
    story_a = _make_story(db_session, project_a)

    resp = client.post(
        f"/api/projects/{project_a.id}/stories/{story_a.id}/agent/review",
        headers=_auth(user_b),
    )

    assert resp.status_code == 404, (
        f"Cross-user debe devolver 404, recibí {resp.status_code}: {resp.text}"
    )


def test_quota_exceeded_returns_429(client, db_session, monkeypatch, fake_providers):
    """
    Si UsageService rechaza la cuota, el endpoint mapea a 429 con detail
    estructurado (mismo contrato que generate-test-cases / analyze-invest).
    """
    user = _make_user(db_session, "agent_quota@salesforce.com")
    project = _make_project(db_session, user)
    story = _make_story(db_session, project)

    from app.services.usage_service import UsageService

    def _raise_quota(self, _user):
        raise QuotaExceeded(user_id=_user.id, spent_usd=120.0, budget_usd=100.0)

    monkeypatch.setattr(UsageService, "ensure_within_budget", _raise_quota)

    resp = client.post(
        f"/api/projects/{project.id}/stories/{story.id}/agent/review",
        headers=_auth(user),
    )

    assert resp.status_code == 429
    body = resp.json()
    assert "detail" in body
    assert body["detail"]["spent_usd"] == 120.0
    assert body["detail"]["budget_usd"] == 100.0
    # El mensaje debe ser user-friendly (no stack trace ni internals).
    assert "message" in body["detail"]


def test_response_does_not_leak_pii(client, db_session, fake_providers):
    """
    La response del endpoint NO debe contener title/description/AC literales
    de la HU. Defensa en profundidad: si en el futuro alguien agrega un campo
    al response que filtra contenido, este test lo detecta inmediatamente.
    """
    user = _make_user(db_session, "agent_nopii@salesforce.com")
    project = _make_project(db_session, user)
    secret_title = "TITULO_SECRETO_PII_12345"
    secret_desc = "DESCRIPCION_SECRETA_PII_67890"
    secret_ac = "CRITERIOS_SECRETOS_PII_ABCDE"
    story = _make_story(
        db_session, project,
        title=secret_title,
        description=secret_desc,
        acceptance_criteria=secret_ac,
    )

    resp = client.post(
        f"/api/projects/{project.id}/stories/{story.id}/agent/review",
        headers=_auth(user),
    )

    assert resp.status_code == 200, resp.text
    body_text = resp.text
    assert secret_title not in body_text, "El title de la HU se está filtrando en el response"
    assert secret_desc not in body_text, "La description de la HU se está filtrando"
    assert secret_ac not in body_text, "Los acceptance_criteria se están filtrando"
    # Sanity check: el body sí contiene los campos esperados (story_id, steps, etc.)
    body = resp.json()
    assert body["story_id"] == story.id
    assert body["project_id"] == project.id
    assert isinstance(body["steps"], list)
    assert body["test_cases_created"] >= 0


def test_invest_idempotency_skips_on_second_call(client, db_session, fake_providers):
    """
    Re-run del agente sobre la misma HU con mode default ('skip'):
    - Primera vez: ejecuta INVEST + generate (cuenta análisis y casos).
    - Segunda vez: skip INVEST (ya estaba) Y skip GENERATE (ya hay casos).
                   → 0 calls extra al LLM. Defensa anti-acumulación que también
                   protege ediciones manuales del QA en sus casos.
    """
    user = _make_user(db_session, "agent_idem@salesforce.com")
    project = _make_project(db_session, user)
    story = _make_story(db_session, project)
    invest_mock, gen_mock = fake_providers

    # Primera llamada: INVEST y generate corren ambos.
    resp1 = client.post(
        f"/api/projects/{project.id}/stories/{story.id}/agent/review",
        headers=_auth(user),
    )
    assert resp1.status_code == 200, resp1.text
    invest_step_1 = next(
        s for s in resp1.json()["steps"] if s["kind"] == "invest_analysis"
    )
    gen_step_1 = next(
        s for s in resp1.json()["steps"] if s["kind"] == "generate_test_cases"
    )
    assert invest_step_1["status"] == "ok"
    assert gen_step_1["status"] == "ok"
    assert invest_mock.analyze.await_count == 1
    assert gen_mock.generate_with_context.await_count == 1

    # Segunda llamada — ambos steps deben skipear con mode default 'skip'.
    resp2 = client.post(
        f"/api/projects/{project.id}/stories/{story.id}/agent/review",
        headers=_auth(user),
    )
    assert resp2.status_code == 200, resp2.text
    invest_step_2 = next(
        s for s in resp2.json()["steps"] if s["kind"] == "invest_analysis"
    )
    gen_step_2 = next(
        s for s in resp2.json()["steps"] if s["kind"] == "generate_test_cases"
    )
    # INVEST skipeado por idempotencia (HU no cambió).
    assert invest_step_2["status"] == "skipped"
    assert invest_step_2["reason"] == "already_analyzed"
    # Generate skipeado por anti-acumulación (HU ya tiene casos del run 1).
    assert gen_step_2["status"] == "skipped"
    assert gen_step_2["reason"] == "already_has_cases"
    assert gen_step_2["existing_cases_count"] > 0
    assert gen_step_2["test_cases_created"] == 0
    # Ningún LLM call extra: ni invest ni generate llamaron al provider.
    assert invest_mock.analyze.await_count == 1
    assert gen_mock.generate_with_context.await_count == 1


# ── Tests del flag mode ──────────────────────────────────────────────────────

def test_invalid_mode_returns_422(client, db_session, fake_providers):
    """
    Pydantic Literal['skip','append','replace'] debe rechazar valores raros con
    422 antes de tocar el service. Defensa contra mode injection / typos.
    """
    user = _make_user(db_session, "agent_invmode@salesforce.com")
    project = _make_project(db_session, user)
    story = _make_story(db_session, project)

    resp = client.post(
        f"/api/projects/{project.id}/stories/{story.id}/agent/review",
        headers=_auth(user),
        json={"mode": "DESTROY_EVERYTHING"},
    )
    assert resp.status_code == 422


def test_append_mode_accumulates_cases(client, db_session, fake_providers):
    """
    mode='append' es el comportamiento legacy: el agente genera y suma encima
    en cada llamada. Confirma que el counter del provider sí sube en el segundo run
    (en contraste con 'skip').
    """
    user = _make_user(db_session, "agent_append@salesforce.com")
    project = _make_project(db_session, user)
    story = _make_story(db_session, project)
    invest_mock, gen_mock = fake_providers

    # Run 1: append sobre HU vacía → genera normal
    resp1 = client.post(
        f"/api/projects/{project.id}/stories/{story.id}/agent/review",
        headers=_auth(user),
        json={"mode": "append"},
    )
    assert resp1.status_code == 200, resp1.text
    assert resp1.json()["test_cases_created"] > 0
    assert gen_mock.generate_with_context.await_count == 1

    # Run 2: append sobre HU con casos → SUMA encima (NO skipea)
    resp2 = client.post(
        f"/api/projects/{project.id}/stories/{story.id}/agent/review",
        headers=_auth(user),
        json={"mode": "append"},
    )
    assert resp2.status_code == 200, resp2.text
    gen_step_2 = next(
        s for s in resp2.json()["steps"] if s["kind"] == "generate_test_cases"
    )
    assert gen_step_2["status"] == "ok"
    assert gen_step_2["test_cases_created"] > 0
    assert gen_step_2["mode"] == "append"
    # El generador SÍ se llamó dos veces (a diferencia de skip).
    assert gen_mock.generate_with_context.await_count == 2


def test_replace_mode_deletes_previous_and_regenerates(
    client, db_session, fake_providers,
):
    """
    mode='replace' debe pre-borrar los casos previos en una transacción atómica
    Y luego regenerar. El step debe reportar deleted_count > 0 y test_cases_created > 0.

    Ownership: el delete_by_story usa story_id ya validado por _require_project,
    así que NUNCA borra casos de otra HU. Eso lo cubre el test de cross-user
    isolation arriba; aquí solo verificamos el comportamiento happy-path del modo.
    """
    user = _make_user(db_session, "agent_replace@salesforce.com")
    project = _make_project(db_session, user)
    story = _make_story(db_session, project)
    invest_mock, gen_mock = fake_providers

    # Run 1: HU vacía, sin existing_cases → genera normal con cualquier modo
    resp1 = client.post(
        f"/api/projects/{project.id}/stories/{story.id}/agent/review",
        headers=_auth(user),
    )
    assert resp1.status_code == 200, resp1.text
    cases_after_run1 = resp1.json()["test_cases_created"]
    assert cases_after_run1 > 0

    # Run 2: replace sobre HU con casos → debe borrar y regenerar
    resp2 = client.post(
        f"/api/projects/{project.id}/stories/{story.id}/agent/review",
        headers=_auth(user),
        json={"mode": "replace"},
    )
    assert resp2.status_code == 200, resp2.text
    gen_step_2 = next(
        s for s in resp2.json()["steps"] if s["kind"] == "generate_test_cases"
    )
    assert gen_step_2["status"] == "ok"
    assert gen_step_2["mode"] == "replace"
    assert gen_step_2["deleted_count"] == cases_after_run1
    assert gen_step_2["existing_cases_count"] == cases_after_run1
    assert gen_step_2["test_cases_created"] > 0
    # El generador SÍ se llamó dos veces (replace no skipea).
    assert gen_mock.generate_with_context.await_count == 2


def test_replace_mode_on_empty_story_does_not_delete(
    client, db_session, fake_providers,
):
    """
    mode='replace' sobre HU SIN casos previos NO debe ejecutar el delete (no hay
    nada que borrar). Solo genera. Verifica que deleted_count NO aparece o es 0.
    """
    user = _make_user(db_session, "agent_replace_empty@salesforce.com")
    project = _make_project(db_session, user)
    story = _make_story(db_session, project)

    resp = client.post(
        f"/api/projects/{project.id}/stories/{story.id}/agent/review",
        headers=_auth(user),
        json={"mode": "replace"},
    )
    assert resp.status_code == 200, resp.text
    gen_step = next(
        s for s in resp.json()["steps"] if s["kind"] == "generate_test_cases"
    )
    assert gen_step["status"] == "ok"
    # Como no había casos previos, el delete_by_story no se llamó (existing=0).
    # El campo deleted_count no se debe haber incluido en la response.
    assert gen_step.get("deleted_count") in (None, 0)
    assert gen_step["existing_cases_count"] == 0
    assert gen_step["test_cases_created"] > 0


def test_default_max_cases_is_capped_at_10(client, db_session, fake_providers):
    """
    Cuando el QA NO pasa max_cases, el agente debe forzar el cap default = 10
    al provider (en vez de None). Esto previene que el LLM genere 30+ casos
    en HUs con muchos CAs (problema raíz del issue '41 casos').
    """
    user = _make_user(db_session, "agent_cap@salesforce.com")
    project = _make_project(db_session, user)
    story = _make_story(db_session, project)
    _, gen_mock = fake_providers

    resp = client.post(
        f"/api/projects/{project.id}/stories/{story.id}/agent/review",
        headers=_auth(user),
        json={},  # sin max_cases
    )
    assert resp.status_code == 200, resp.text
    # El generador fue llamado UNA vez con max_cases=10 (cap default del agente).
    assert gen_mock.generate_with_context.await_count == 1
    call_kwargs = gen_mock.generate_with_context.call_args.kwargs
    assert call_kwargs.get("max_cases") == 10, (
        f"Se esperaba max_cases=10 (cap default), recibí {call_kwargs.get('max_cases')}"
    )
