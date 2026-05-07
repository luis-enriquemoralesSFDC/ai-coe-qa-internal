from __future__ import annotations
"""SRP — solo responsabilidad HTTP de proyectos."""
from fastapi import APIRouter, Depends, HTTPException
from ..models import User
from ..schemas import ProjectCreate, ProjectOut, ProjectUpdate
from ..auth.utils import get_current_user
from ..repositories.project_repository import ProjectRepository
from ..dependencies import get_project_repo

router = APIRouter(prefix="/projects", tags=["projects"])


def _enrich(project, repo: ProjectRepository) -> dict:
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "created_at": project.created_at,
        "stories_count": repo.count_stories(project.id),
        "test_cases_count": repo.count_test_cases(project.id),
    }


@router.get("/", response_model=list[ProjectOut])
def list_projects(
    repo: ProjectRepository = Depends(get_project_repo),
    current_user: User = Depends(get_current_user),
):
    projects = repo.list_by_user(current_user.id)
    return [_enrich(p, repo) for p in projects]


@router.post("/", response_model=ProjectOut, status_code=201)
def create_project(
    data: ProjectCreate,
    repo: ProjectRepository = Depends(get_project_repo),
    current_user: User = Depends(get_current_user),
):
    project = repo.create(data.name, data.description, current_user.id)
    return _enrich(project, repo)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    repo: ProjectRepository = Depends(get_project_repo),
    current_user: User = Depends(get_current_user),
):
    project = repo.get_by_id(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return _enrich(project, repo)


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    data: ProjectUpdate,
    repo: ProjectRepository = Depends(get_project_repo),
    current_user: User = Depends(get_current_user),
):
    project = repo.get_by_id(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    project = repo.update(project, data.name, data.description)
    return _enrich(project, repo)


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: int,
    repo: ProjectRepository = Depends(get_project_repo),
    current_user: User = Depends(get_current_user),
):
    project = repo.get_by_id(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    repo.delete(project)
