from __future__ import annotations
"""Rutas para subir reportes de bugs y gestión de bugs individuales."""
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from ...models import User
from ...auth.utils import get_current_user
from ...repositories.project_repository import ProjectRepository
from ...repositories.bug_repository import BugRepository
from ...services.kpis.bug_import_service import parse_csv_bugs
from ...schemas import BugOut, BugReportOut, BugLinkUpdate
from ...dependencies import get_project_repo, get_bug_repo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/kpis/bugs", tags=["kpis-bugs"])

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


def _require_project(project_id: int, user: User, repo: ProjectRepository):
    project = repo.get_by_id(project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return project


@router.post("/upload", response_model=BugReportOut, status_code=201)
async def upload_bug_report(
    project_id: int,
    file: UploadFile = File(...),
    sprint_name: Optional[str] = Query(None, description="Sprint al que pertenece el reporte"),
    source: Optional[str] = Query("csv", description="Herramienta origen: jira, azure, csv"),
    project_repo: ProjectRepository = Depends(get_project_repo),
    bug_repo: BugRepository = Depends(get_bug_repo),
    current_user: User = Depends(get_current_user),
):
    """Sube un reporte CSV de bugs (Jira, Azure DevOps, o genérico)."""
    _require_project(project_id, current_user, project_repo)

    filename = file.filename or "reporte.csv"
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos CSV")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 5 MB")

    # Crear el reporte primero para obtener su ID
    report = bug_repo.create_report(
        project_id=project_id,
        uploaded_by=current_user.id,
        sprint_name=sprint_name,
        source=source or "csv",
        filename=filename,
    )

    # Obtener historias del proyecto para el cruce automático
    stories = bug_repo.get_story_ids_in_project(project_id)

    try:
        bugs = parse_csv_bugs(content, report, stories)
    except Exception as e:
        logger.error("Error parseando CSV: %s", e, exc_info=True)
        # Borrar el reporte vacío si falla el parseo
        bug_repo.delete_report(report)
        raise HTTPException(status_code=422, detail=f"Error al procesar el CSV: {e}")

    if not bugs:
        bug_repo.delete_report(report)
        raise HTTPException(status_code=422, detail="El archivo CSV no contiene bugs válidos")

    bug_repo.create_many_bugs(bugs)
    logger.info("Reporte %d: %d bugs importados para proyecto %d", report.id, len(bugs), project_id)

    return {**report.__dict__, "bugs_count": len(bugs)}


@router.get("/reports", response_model=List[BugReportOut])
def list_reports(
    project_id: int,
    project_repo: ProjectRepository = Depends(get_project_repo),
    bug_repo: BugRepository = Depends(get_bug_repo),
    current_user: User = Depends(get_current_user),
):
    _require_project(project_id, current_user, project_repo)
    reports = bug_repo.list_reports(project_id)
    return [
        {**r.__dict__, "bugs_count": len(r.bugs)}
        for r in reports
    ]


@router.delete("/reports/{report_id}", status_code=204)
def delete_report(
    project_id: int,
    report_id: int,
    project_repo: ProjectRepository = Depends(get_project_repo),
    bug_repo: BugRepository = Depends(get_bug_repo),
    current_user: User = Depends(get_current_user),
):
    _require_project(project_id, current_user, project_repo)
    report = bug_repo.get_report(report_id, project_id)
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    bug_repo.delete_report(report)


@router.get("/", response_model=List[BugOut])
def list_bugs(
    project_id: int,
    sprint_name: Optional[str] = Query(None),
    environment: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    project_repo: ProjectRepository = Depends(get_project_repo),
    bug_repo: BugRepository = Depends(get_bug_repo),
    current_user: User = Depends(get_current_user),
):
    _require_project(project_id, current_user, project_repo)
    return bug_repo.list_bugs(project_id, sprint_name, environment, severity, status)


@router.patch("/{bug_id}/link", response_model=BugOut)
def link_bug_to_story(
    project_id: int,
    bug_id: int,
    data: BugLinkUpdate,
    project_repo: ProjectRepository = Depends(get_project_repo),
    bug_repo: BugRepository = Depends(get_bug_repo),
    current_user: User = Depends(get_current_user),
):
    """Vincula manualmente un bug a una historia o caso de prueba."""
    _require_project(project_id, current_user, project_repo)
    bug = bug_repo.get_bug(bug_id, project_id)
    if not bug:
        raise HTTPException(status_code=404, detail="Bug no encontrado")
    return bug_repo.update_bug_link(bug, data.story_id, data.linked_case_id)
