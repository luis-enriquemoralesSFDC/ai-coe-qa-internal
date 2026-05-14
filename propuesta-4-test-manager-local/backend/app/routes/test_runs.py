from __future__ import annotations
"""SRP — solo responsabilidad HTTP de ejecuciones automáticas de casos.

Estos endpoints son la interfaz de coordinación entre el frontend y el worker
Node externo (qa-worker/). El worker NO usa estos endpoints: lee/escribe SQLite
directo. Estos endpoints existen para que el frontend pueda crear runs, ver su
estado y mandar señales (continuar tras login manual, cancelar).

Endpoints (montados con prefix=/api):
    POST   /test-runs                 → crea fila status=queued
    GET    /test-runs/{id}            → estado actual (para polling del frontend)
    POST   /test-runs/{id}/continue   → setea continue_signal=true
    POST   /test-runs/{id}/cancel     → setea cancel_signal=true

Idempotencia: continue/cancel son idempotentes — si el signal ya estaba prendido,
no pasa nada. El worker decide qué hacer con la señal según el status actual.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from ..auth.utils import get_current_user
from ..dependencies import get_test_run_repo
from ..models import User
from ..repositories.test_run_repository import TestRunRepository
from ..schemas import TestRunCreate, TestRunOut


router = APIRouter(prefix="/test-runs", tags=["test-runs"])


# Default que se aplica si el cliente no manda model_id explícito. Vive en el
# server (no en la UI) para no acoplar el pricing del modelo al frontend: si
# mañana cambias a haiku-5 o sonnet, lo haces aquí sin redeployar UI.
_DEFAULT_MODEL_ID = "claude-haiku-4-5"


@router.post("", response_model=TestRunOut, status_code=201)
def create_test_run(
    data: TestRunCreate,
    repo: TestRunRepository = Depends(get_test_run_repo),
    current_user: User = Depends(get_current_user),
) -> TestRunOut:
    """
    Encola un nuevo run. El worker Node lo va a tomar en su próximo poll.

    Validaciones:
    - Pydantic ya valida case_ids no vacío y <= MAX_CASES_PER_RUN.
    - Pydantic ya valida formato de base_url.
    - Aquí validamos que el project_id pertenezca al user (defensa profunda).
    """
    try:
        run = repo.create(
            user_id=current_user.id,
            project_id=data.project_id,
            case_ids=data.case_ids,
            env=data.env,
            base_url=data.base_url,
            prompt=data.prompt,
            model_id=data.model_id or _DEFAULT_MODEL_ID,
        )
    except PermissionError:
        # No revelamos si el proyecto existe o no para evitar enumeración.
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return run  # type: ignore[return-value]


@router.get("/{run_id}", response_model=TestRunOut)
def get_test_run(
    run_id: int,
    repo: TestRunRepository = Depends(get_test_run_repo),
    current_user: User = Depends(get_current_user),
) -> TestRunOut:
    """Estado actual del run. Lo usa el frontend para polling."""
    run = repo.get_by_id(run_id, current_user.id)
    if not run:
        raise HTTPException(status_code=404, detail="Test run no encontrado")
    return run  # type: ignore[return-value]


@router.get("", response_model=List[TestRunOut])
def list_test_runs(
    project_id: int,
    repo: TestRunRepository = Depends(get_test_run_repo),
    current_user: User = Depends(get_current_user),
) -> List[TestRunOut]:
    """Historial de runs del proyecto (más recientes primero, hasta 50)."""
    if not repo.verify_project_owned(project_id, current_user.id):
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return repo.list_by_project(project_id, current_user.id)  # type: ignore[return-value]


@router.post("/{run_id}/continue", response_model=TestRunOut)
def continue_test_run(
    run_id: int,
    repo: TestRunRepository = Depends(get_test_run_repo),
    current_user: User = Depends(get_current_user),
) -> TestRunOut:
    """
    Señaliza al worker que el QA terminó de loguearse manualmente y puede
    continuar. Solo válido cuando el run está en waiting_login; en otros
    estados es un no-op silencioso (devuelve la fila tal cual).

    Idempotente: si continue_signal ya estaba prendido, no falla.
    """
    run = repo.get_by_id(run_id, current_user.id)
    if not run:
        raise HTTPException(status_code=404, detail="Test run no encontrado")
    if run.status != "waiting_login":
        # No es error de cliente: el frontend puede mandar continue por race
        # con el worker. Devolver el estado actual sin modificar.
        return run  # type: ignore[return-value]
    return repo.set_continue_signal(run)  # type: ignore[return-value]


@router.post("/{run_id}/cancel", response_model=TestRunOut)
def cancel_test_run(
    run_id: int,
    repo: TestRunRepository = Depends(get_test_run_repo),
    current_user: User = Depends(get_current_user),
) -> TestRunOut:
    """
    Señaliza al worker que aborte el run. Solo tiene efecto en estados
    queued/running/waiting_login. En estados terminales (finished/error/
    cancelled) es no-op.
    """
    run = repo.get_by_id(run_id, current_user.id)
    if not run:
        raise HTTPException(status_code=404, detail="Test run no encontrado")
    if run.status in ("finished", "error", "cancelled"):
        return run  # type: ignore[return-value]
    return repo.set_cancel_signal(run)  # type: ignore[return-value]
