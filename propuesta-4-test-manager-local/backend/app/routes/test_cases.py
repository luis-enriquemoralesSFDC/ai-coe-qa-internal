from __future__ import annotations
"""SRP — solo responsabilidad HTTP de casos de prueba."""
from fastapi import APIRouter, Depends, HTTPException
from typing import List
from ..models import User
from ..schemas import TestCaseCreate, TestCaseUpdate, TestCaseOut
from ..auth.utils import get_current_user
from ..repositories.test_case_repository import TestCaseRepository
from ..dependencies import get_tc_repo

router = APIRouter(prefix="/stories/{story_id}/test-cases", tags=["test-cases"])


def _require_story(story_id: int, user: User, repo: TestCaseRepository):
    story = repo.get_story_with_owner(story_id, user.id)
    if not story:
        raise HTTPException(status_code=404, detail="Historia no encontrada")
    return story


@router.get("/", response_model=List[TestCaseOut])
def list_test_cases(
    story_id: int,
    repo: TestCaseRepository = Depends(get_tc_repo),
    current_user: User = Depends(get_current_user),
):
    _require_story(story_id, current_user, repo)
    return repo.list_by_story(story_id)


@router.post("/", response_model=TestCaseOut, status_code=201)
def create_test_case(
    story_id: int,
    data: TestCaseCreate,
    repo: TestCaseRepository = Depends(get_tc_repo),
    current_user: User = Depends(get_current_user),
):
    story = _require_story(story_id, current_user, repo)
    count = repo.count_by_story(story_id)
    return repo.create(
        story_id=story_id,
        case_id=f"TC-{story.id:03d}-{count + 1:02d}",
        **data.model_dump(),
    )


@router.put("/{tc_id}", response_model=TestCaseOut)
def update_test_case(
    story_id: int,
    tc_id: int,
    data: TestCaseUpdate,
    repo: TestCaseRepository = Depends(get_tc_repo),
    current_user: User = Depends(get_current_user),
):
    _require_story(story_id, current_user, repo)
    tc = repo.get_by_id(tc_id, story_id)
    if not tc:
        raise HTTPException(status_code=404, detail="Caso de prueba no encontrado")
    return repo.update(tc, data.model_dump(exclude_unset=True))


@router.delete("/{tc_id}", status_code=204)
def delete_test_case(
    story_id: int,
    tc_id: int,
    repo: TestCaseRepository = Depends(get_tc_repo),
    current_user: User = Depends(get_current_user),
):
    _require_story(story_id, current_user, repo)
    tc = repo.get_by_id(tc_id, story_id)
    if not tc:
        raise HTTPException(status_code=404, detail="Caso de prueba no encontrado")
    repo.delete(tc)
