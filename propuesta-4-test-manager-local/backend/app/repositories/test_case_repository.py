from __future__ import annotations
"""SRP — única responsabilidad: acceso a datos de casos de prueba."""
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..models import TestCase, UserStory, Project


class TestCaseRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def list_by_story(self, story_id: int) -> list[TestCase]:
        return (self._db.query(TestCase)
                .filter(TestCase.story_id == story_id)
                .order_by(TestCase.created_at)
                .all())

    def get_by_id(self, tc_id: int, story_id: int) -> TestCase | None:
        return (self._db.query(TestCase)
                .filter(TestCase.id == tc_id, TestCase.story_id == story_id)
                .first())

    def get_story_with_owner(self, story_id: int, user_id: int) -> UserStory | None:
        return (self._db.query(UserStory)
                .join(Project, UserStory.project_id == Project.id)
                .filter(UserStory.id == story_id, Project.user_id == user_id)
                .first())

    def count_by_story(self, story_id: int) -> int:
        return (self._db.query(func.count(TestCase.id))
                .filter(TestCase.story_id == story_id)
                .scalar())

    def create(self, story_id: int, case_id: str, **fields) -> TestCase:
        tc = TestCase(story_id=story_id, case_id=case_id, **fields)
        self._db.add(tc)
        self._db.commit()
        self._db.refresh(tc)
        return tc

    def create_many(self, test_cases: list[TestCase]) -> None:
        self._db.add_all(test_cases)
        self._db.commit()

    def update(self, tc: TestCase, fields: dict) -> TestCase:
        for key, value in fields.items():
            setattr(tc, key, value)
        self._db.commit()
        self._db.refresh(tc)
        return tc

    def delete(self, tc: TestCase) -> None:
        self._db.delete(tc)
        self._db.commit()

    def delete_by_story(self, story_id: int) -> int:
        """
        Borra TODOS los casos de una HU en bloque y devuelve cuántos se borraron.

        Uso típico: StoryReviewService con mode="replace" — pre-borra antes de
        regenerar para no acumular contenido.

        Seguridad / robustez:
        - El filtro por `story_id` es estricto: NUNCA borra casos de otras HUs.
        - El caller es responsable de validar ownership del story_id ANTES de
          llamar este método (lo hace la route con _require_project + StoryRepository).
        - La operación es atómica (un único commit). Si falla a media transacción,
          SQLAlchemy rollbackea automáticamente y se propaga la excepción al caller.
        - Retorna el conteo para que el caller pueda loggear/reportar al QA.
        """
        deleted = (
            self._db.query(TestCase)
            .filter(TestCase.story_id == story_id)
            .delete(synchronize_session=False)
        )
        self._db.commit()
        return int(deleted or 0)
