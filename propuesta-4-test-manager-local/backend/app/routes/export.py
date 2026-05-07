from __future__ import annotations
"""SRP — solo responsabilidad HTTP de exportación."""
import io
import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from ..models import User
from ..auth.utils import get_current_user
from ..repositories.project_repository import ProjectRepository
from ..repositories.story_repository import StoryRepository
from ..services.export_service import export_project_to_excel
from ..dependencies import get_project_repo, get_story_repo

router = APIRouter(prefix="/projects/{project_id}/export", tags=["export"])


def _safe_filename(name: str) -> str:
    """Elimina caracteres no seguros para nombres de archivo."""
    safe = re.sub(r'[^\w\-]', '_', name.lower())
    return safe[:60] or "proyecto"


@router.get("/excel")
def export_excel(
    project_id: int,
    project_repo: ProjectRepository = Depends(get_project_repo),
    story_repo: StoryRepository = Depends(get_story_repo),
    current_user: User = Depends(get_current_user),
):
    project = project_repo.get_by_id(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    stories = story_repo.list_with_test_cases(project_id)
    if not stories:
        raise HTTPException(status_code=404, detail="El proyecto no tiene historias con casos de prueba")

    excel_bytes = export_project_to_excel(project.name, stories)
    filename = f"casos_prueba_{_safe_filename(project.name)}.xlsx"

    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
