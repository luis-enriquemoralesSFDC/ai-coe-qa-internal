from __future__ import annotations
"""SRP — solo responsabilidad HTTP del Test Plan Coach (chat conversacional).

Headers de privacidad:
- TODAS las respuestas llevan `Cache-Control: no-store, no-cache, must-revalidate, private`
  + `Pragma: no-cache`. Garantiza que ningún proxy / CDN / browser cachee el
  contenido conversacional, que puede tener PII del cliente del proyecto.
- Los métodos siempre cargan el plan vía `repo.get_by_id(plan_id, user_id)`,
  que filtra por owner. Si el plan no es del user, devolvemos 404 (no 403)
  para no leakar existencia.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from ..auth.utils import get_current_user
from ..dependencies import (
    get_test_plan_coach_service,
    get_test_plan_repo,
)
from ..models import User
from ..repositories.test_plan_repository import TestPlanRepository
from ..schemas import (
    CoachMessageOut,
    CoachStartRequest,
    CoachTurnRequest,
    CoachTurnResponse,
    CoachValidateResponse,
    TestPlanWizardData,
)
from ..services.test_plan_coach_service import TestPlanCoachService
from ..services.usage_service import QuotaExceeded


router = APIRouter(prefix="/test-plans/{plan_id}/coach", tags=["test-plans-coach"])

_ALLOWED_LOCALES = {"es", "en", "pt"}


def _get_locale(request: Request) -> str:
    raw = request.headers.get("Accept-Language", "es")
    lang = raw.split(",")[0].split(";")[0].strip().split("-")[0].lower()
    return lang if lang in _ALLOWED_LOCALES else "es"


_NO_STORE_HEADERS = {
    # RFC 7234: no-store impide cache; private impide cache de proxies/CDN;
    # must-revalidate fuerza al browser a re-pedir si por algún caso lo guarda.
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Pragma": "no-cache",
}


def _apply_privacy_headers(response: Response) -> None:
    """Aplica los headers anti-cache/anti-retention a la respuesta del coach."""
    for k, v in _NO_STORE_HEADERS.items():
        response.headers[k] = v


def _load_plan_or_404(plan_id: int, repo: TestPlanRepository, user: User):
    plan = repo.get_by_id(plan_id, user.id)
    if not plan:
        # 404 (no 403) intencional: no leakar existencia de planes ajenos.
        raise HTTPException(status_code=404, detail="Test plan no encontrado")
    return plan


def _build_turn_response(
    message,
    plan,
    coach: TestPlanCoachService,
) -> CoachTurnResponse:
    actions, can_generate = coach.validate(plan)
    return CoachTurnResponse(
        message=CoachMessageOut.model_validate(message),
        wizard_data=TestPlanWizardData(**plan.wizard_data),
        violations=actions,
        can_generate=can_generate,
    )


@router.post("/start", response_model=CoachTurnResponse)
async def start_coach(
    request: Request,
    plan_id: int,
    body: CoachStartRequest,
    response: Response,
    repo: TestPlanRepository = Depends(get_test_plan_repo),
    coach: TestPlanCoachService = Depends(get_test_plan_coach_service),
    current_user: User = Depends(get_current_user),
):
    """
    Arranca (o re-saluda en) la conversación. Devuelve el primer mensaje del
    assistant + el wizard_data actual + las violaciones activas. No borra
    historial existente — si quieres reset, llama DELETE /messages primero.
    """
    _apply_privacy_headers(response)
    plan = _load_plan_or_404(plan_id, repo, current_user)
    try:
        msg = await coach.start(
            plan, current_user, project_context=body.project_context,
            language=_get_locale(request),
        )
    except QuotaExceeded as e:
        raise HTTPException(status_code=429, detail=str(e))
    return _build_turn_response(msg, plan, coach)


@router.post("/turn", response_model=CoachTurnResponse)
async def post_turn(
    request: Request,
    plan_id: int,
    body: CoachTurnRequest,
    response: Response,
    repo: TestPlanRepository = Depends(get_test_plan_repo),
    coach: TestPlanCoachService = Depends(get_test_plan_coach_service),
    current_user: User = Depends(get_current_user),
):
    """
    Procesa la respuesta del QA y devuelve el siguiente mensaje del assistant.

    El body acepta varias formas de respuesta combinables:
    - `text`: respuesta libre.
    - `picklist_answers`: dict {field: value} si el último turno emitió ask_picklist.
    - `accept_suggestion_for` / `reject_suggestion_for`: nombre del field cuya
       sugerencia se acepta/rechaza (busca el último suggest_replace activo).
    - `bulk_confirm`: bool si el último turno emitió confirm_bulk.
    """
    _apply_privacy_headers(response)
    plan = _load_plan_or_404(plan_id, repo, current_user)
    if not any([
        body.text, body.picklist_answers,
        body.accept_suggestion_for, body.reject_suggestion_for,
        body.bulk_confirm is not None,
    ]):
        raise HTTPException(
            status_code=400,
            detail="Manda al menos uno: text, picklist_answers, accept_suggestion_for, reject_suggestion_for o bulk_confirm.",
        )
    try:
        msg = await coach.turn(plan, current_user, body, language=_get_locale(request))
    except QuotaExceeded as e:
        raise HTTPException(status_code=429, detail=str(e))
    return _build_turn_response(msg, plan, coach)


@router.get("/messages", response_model=list[CoachMessageOut])
def list_messages(
    plan_id: int,
    response: Response,
    repo: TestPlanRepository = Depends(get_test_plan_repo),
    coach: TestPlanCoachService = Depends(get_test_plan_coach_service),
    current_user: User = Depends(get_current_user),
):
    """Historial completo de mensajes del Coach para este plan."""
    _apply_privacy_headers(response)
    plan = _load_plan_or_404(plan_id, repo, current_user)
    return coach.list_messages(plan, current_user)


@router.delete("/messages", status_code=204)
def reset_conversation(
    plan_id: int,
    response: Response,
    repo: TestPlanRepository = Depends(get_test_plan_repo),
    coach: TestPlanCoachService = Depends(get_test_plan_coach_service),
    current_user: User = Depends(get_current_user),
):
    """Borra todo el historial conversacional del plan (no toca wizard_data)."""
    _apply_privacy_headers(response)
    plan = _load_plan_or_404(plan_id, repo, current_user)
    coach.reset_messages(plan, current_user)


@router.post("/validate", response_model=CoachValidateResponse)
def validate_now(
    plan_id: int,
    response: Response,
    repo: TestPlanRepository = Depends(get_test_plan_repo),
    coach: TestPlanCoachService = Depends(get_test_plan_coach_service),
    current_user: User = Depends(get_current_user),
):
    """
    Re-evalúa todas las políticas estrictas sobre el wizard_data actual.
    NO llama al LLM (sin coste). Útil después de editar el wizard manualmente.
    """
    _apply_privacy_headers(response)
    plan = _load_plan_or_404(plan_id, repo, current_user)
    actions, can_generate = coach.validate(plan)
    blocking = sum(1 for a in actions if a.kind == "block")
    warning = sum(1 for a in actions if a.kind == "warn")
    return CoachValidateResponse(
        violations=actions,
        can_generate=can_generate,
        blocking_count=blocking,
        warning_count=warning,
    )


@router.post("/apply-action", response_model=CoachTurnResponse)
async def apply_action(
    plan_id: int,
    body: CoachTurnRequest,
    response: Response,
    repo: TestPlanRepository = Depends(get_test_plan_repo),
    coach: TestPlanCoachService = Depends(get_test_plan_coach_service),
    current_user: User = Depends(get_current_user),
):
    """
    Atajo cuando el frontend solo quiere aplicar una sugerencia y NO consultar
    al LLM otra vez (ahorra una call). Aplica el patch al wizard, persiste un
    mensaje sintético del user y devuelve el wizard_data + violations
    actualizadas.
    """
    _apply_privacy_headers(response)
    plan = _load_plan_or_404(plan_id, repo, current_user)
    summary = coach._apply_user_response_to_wizard(plan, current_user, body)  # type: ignore[attr-defined]
    msg = coach._messages.append(  # type: ignore[attr-defined]
        plan_id=plan.id,
        user_id=current_user.id,
        role="user",
        content=summary or "(acción aplicada sin descripción)",
        actions=[],
    )
    # Refresh para que validate vea el wizard nuevo
    repo._db.refresh(plan)  # type: ignore[attr-defined]
    return _build_turn_response(msg, plan, coach)
