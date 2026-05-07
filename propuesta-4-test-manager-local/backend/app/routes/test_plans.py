from __future__ import annotations
"""SRP — solo responsabilidad HTTP de Test Plans."""
from fastapi import APIRouter, Depends, HTTPException, Response

from ..auth.utils import get_current_user
from ..dependencies import get_project_repo, get_test_plan_repo, get_test_plan_service
from ..models import User
from ..repositories.project_repository import ProjectRepository
from ..repositories.test_plan_repository import TestPlanRepository
from ..schemas import (
    AiAssistRequest,
    AiAssistResponse,
    TestPlanCreate,
    TestPlanGenerateRequest,
    TestPlanListItem,
    TestPlanOut,
    TestPlanUpdate,
)
from ..services.test_plan_policies import PolicyViolationsBlock
from ..services.test_plan_service import TestPlanService, filename_for_plan
from ..services.usage_service import QuotaExceeded


# Router 1: anidado al proyecto (listing y creación).
project_test_plans_router = APIRouter(
    prefix="/projects/{project_id}/test-plans", tags=["test-plans"],
)

# Router 2: directo (operaciones sobre un plan específico, ya identificado).
test_plans_router = APIRouter(prefix="/test-plans", tags=["test-plans"])


# ── Listing y creación (anidado al proyecto) ──────────────────────────────────

@project_test_plans_router.get("/", response_model=list[TestPlanListItem])
def list_test_plans(
    project_id: int,
    project_repo: ProjectRepository = Depends(get_project_repo),
    repo: TestPlanRepository = Depends(get_test_plan_repo),
    current_user: User = Depends(get_current_user),
):
    project = project_repo.get_by_id(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return repo.list_by_project(project_id, current_user.id)


@project_test_plans_router.post("/", response_model=TestPlanOut, status_code=201)
def create_test_plan(
    project_id: int,
    data: TestPlanCreate,
    project_repo: ProjectRepository = Depends(get_project_repo),
    service: TestPlanService = Depends(get_test_plan_service),
    current_user: User = Depends(get_current_user),
):
    """Crea un draft (sin generar markdown). Para generar luego: POST /test-plans/{id}/generate."""
    project = project_repo.get_by_id(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    plan = service.create_draft(project, current_user, data.wizard_data)
    return plan


# ── Operaciones sobre un plan específico ──────────────────────────────────────

@test_plans_router.get("/{plan_id}", response_model=TestPlanOut)
def get_test_plan(
    plan_id: int,
    repo: TestPlanRepository = Depends(get_test_plan_repo),
    current_user: User = Depends(get_current_user),
):
    plan = repo.get_by_id(plan_id, current_user.id)
    if not plan:
        raise HTTPException(status_code=404, detail="Test plan no encontrado")
    return plan


@test_plans_router.put("/{plan_id}", response_model=TestPlanOut)
def update_test_plan(
    plan_id: int,
    data: TestPlanUpdate,
    repo: TestPlanRepository = Depends(get_test_plan_repo),
    service: TestPlanService = Depends(get_test_plan_service),
    current_user: User = Depends(get_current_user),
):
    plan = repo.get_by_id(plan_id, current_user.id)
    if not plan:
        raise HTTPException(status_code=404, detail="Test plan no encontrado")
    return service.update_draft(plan, data.wizard_data)


@test_plans_router.post("/{plan_id}/generate", response_model=TestPlanOut)
async def generate_test_plan(
    plan_id: int,
    data: TestPlanGenerateRequest,
    repo: TestPlanRepository = Depends(get_test_plan_repo),
    service: TestPlanService = Depends(get_test_plan_service),
    current_user: User = Depends(get_current_user),
):
    """
    Renderiza el markdown final usando la plantilla canónica + wizard_data.

    Si `use_ai_for_prose=True` (default), llama a OpenAI para llenar campos
    narrativos vacíos (BUSINESS_GOAL, USER_STORY_LIFECYCLE, SALESFORCE_CAPACITY,
    SCOPE_OUT). Cada llamada cuenta contra la cuota mensual del usuario.
    """
    plan = repo.get_by_id(plan_id, current_user.id)
    if not plan:
        raise HTTPException(status_code=404, detail="Test plan no encontrado")
    try:
        return await service.generate(
            plan, current_user, use_ai_for_prose=data.use_ai_for_prose,
        )
    except PolicyViolationsBlock as e:
        # Defense-in-depth: el frontend bloquea con el banner inline (Tanda 5),
        # pero un cliente directo (curl/Postman) podría intentarlo igual.
        # Devolvemos 422 con el detalle estructurado para que cualquier cliente
        # pueda mostrar mensajes accionables al QA.
        blocking = [v for v in e.violations if v.blocks_generation]
        raise HTTPException(
            status_code=422,
            detail={
                "error": "policies_blocking",
                "message": (
                    f"El plan tiene {len(blocking)} regla(s) que bloquean la generación. "
                    "Resolvélas en el wizard o en el QA Coach antes de generar."
                ),
                "violations": [
                    {
                        "rule_id": v.rule_id,
                        "field": v.field,
                        "severity": v.severity,
                        "message": v.message,
                        "fix_suggestion": v.fix_suggestion,
                    }
                    for v in blocking
                ],
            },
        )
    except QuotaExceeded as e:
        raise HTTPException(status_code=429, detail=str(e))


@test_plans_router.get("/{plan_id}/download")
def download_test_plan(
    plan_id: int,
    repo: TestPlanRepository = Depends(get_test_plan_repo),
    current_user: User = Depends(get_current_user),
):
    """Descarga el .md final. 404 si no se ha generado todavía."""
    plan = repo.get_by_id(plan_id, current_user.id)
    if not plan:
        raise HTTPException(status_code=404, detail="Test plan no encontrado")
    if plan.status != "generated" or not plan.markdown_content:
        raise HTTPException(
            status_code=400,
            detail="Plan en estado draft. Genera el markdown primero (POST /generate).",
        )
    filename = filename_for_plan(plan)
    return Response(
        content=plan.markdown_content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@test_plans_router.delete("/{plan_id}", status_code=204)
def delete_test_plan(
    plan_id: int,
    repo: TestPlanRepository = Depends(get_test_plan_repo),
    service: TestPlanService = Depends(get_test_plan_service),
    current_user: User = Depends(get_current_user),
):
    plan = repo.get_by_id(plan_id, current_user.id)
    if not plan:
        raise HTTPException(status_code=404, detail="Test plan no encontrado")
    service.delete(plan)


# ── Asistente puntual de OpenAI (botón "✨ Generar con AI" en el wizard) ──────

@test_plans_router.post("/assist-field", response_model=AiAssistResponse)
async def assist_field(
    data: AiAssistRequest,
    service: TestPlanService = Depends(get_test_plan_service),
    current_user: User = Depends(get_current_user),
):
    """Genera/refine el contenido de un campo narrativo. No persiste nada."""
    try:
        text = await service.assist_field(
            current_user, data.field, data.user_input, data.project_context,
        )
        return AiAssistResponse(field=data.field, content=text)
    except QuotaExceeded as e:
        raise HTTPException(status_code=429, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
