from __future__ import annotations
"""Endpoints de métricas calculadas (KPIs)."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from ...models import User
from ...auth.utils import get_current_user
from ...repositories.project_repository import ProjectRepository
from ...repositories.bug_repository import BugRepository
from ...services.kpis.kpi_service import KpiService
from ...schemas import KpiSummaryOut, SeveritySprintRow, FpySprintRow
from ...dependencies import get_project_repo, get_bug_repo, get_kpi_service

router = APIRouter(prefix="/projects/{project_id}/kpis", tags=["kpis-metrics"])


def _require_project(project_id: int, user: User, repo: ProjectRepository):
    project = repo.get_by_id(project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return project


@router.get("/summary", response_model=KpiSummaryOut)
def get_kpi_summary(
    project_id: int,
    project_repo: ProjectRepository = Depends(get_project_repo),
    kpi_svc: KpiService = Depends(get_kpi_service),
    current_user: User = Depends(get_current_user),
):
    """Retorna todos los KPIs del proyecto en un solo response."""
    _require_project(project_id, current_user, project_repo)
    return kpi_svc.get_summary(project_id)


@router.get("/severity-by-sprint", response_model=List[SeveritySprintRow])
def get_severity_by_sprint(
    project_id: int,
    project_repo: ProjectRepository = Depends(get_project_repo),
    kpi_svc: KpiService = Depends(get_kpi_service),
    current_user: User = Depends(get_current_user),
):
    """Bug Severity desglosado por sprint (para gráfica de barras apiladas)."""
    _require_project(project_id, current_user, project_repo)
    return kpi_svc.get_severity_by_sprint(project_id)


@router.get("/fpy", response_model=List[FpySprintRow])
def get_fpy(
    project_id: int,
    project_repo: ProjectRepository = Depends(get_project_repo),
    kpi_svc: KpiService = Depends(get_kpi_service),
    current_user: User = Depends(get_current_user),
):
    """First Pass Yield por sprint."""
    _require_project(project_id, current_user, project_repo)
    return kpi_svc.get_fpy_by_sprint(project_id)


@router.get("/effectiveness")
def get_effectiveness(
    project_id: int,
    project_repo: ProjectRepository = Depends(get_project_repo),
    kpi_svc: KpiService = Depends(get_kpi_service),
    current_user: User = Depends(get_current_user),
):
    """TC Effectiveness por historia (bugs encontrados vs casos de prueba)."""
    _require_project(project_id, current_user, project_repo)
    return kpi_svc.get_effectiveness_by_story(project_id)


@router.get("/sprints")
def get_sprints(
    project_id: int,
    project_repo: ProjectRepository = Depends(get_project_repo),
    bug_repo: BugRepository = Depends(get_bug_repo),
    current_user: User = Depends(get_current_user),
):
    """Lista de sprints disponibles en el proyecto (de bugs importados)."""
    _require_project(project_id, current_user, project_repo)
    return {"sprints": bug_repo.list_sprints(project_id)}
