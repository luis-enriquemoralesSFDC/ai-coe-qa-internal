from __future__ import annotations
"""SRP — única responsabilidad: acceso a datos de historias de usuario."""
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from ..models import UserStory, TestCase


class StoryRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def list_by_project(self, project_id: int) -> list[UserStory]:
        return (self._db.query(UserStory)
                .filter(UserStory.project_id == project_id)
                .order_by(UserStory.created_at.desc())
                .all())

    def get_by_id(self, story_id: int, project_id: int) -> UserStory | None:
        return (self._db.query(UserStory)
                .filter(UserStory.id == story_id, UserStory.project_id == project_id)
                .first())

    def get_many_by_ids(self, story_ids: list[int], project_id: int) -> list[UserStory]:
        return (self._db.query(UserStory)
                .filter(UserStory.id.in_(story_ids), UserStory.project_id == project_id)
                .all())

    def list_with_test_cases(self, project_id: int) -> list[UserStory]:
        return (self._db.query(UserStory)
                .options(joinedload(UserStory.test_cases))
                .filter(UserStory.project_id == project_id)
                .all())

    def create(self, project_id: int, source: str, **fields) -> UserStory:
        story = UserStory(project_id=project_id, source=source, **fields)
        self._db.add(story)
        self._db.commit()
        self._db.refresh(story)
        return story

    def create_many(self, project_id: int, source: str, items: list[dict]) -> list[UserStory]:
        stories = [UserStory(project_id=project_id, source=source, **item) for item in items]
        self._db.add_all(stories)
        self._db.commit()
        for s in stories:
            self._db.refresh(s)
        return stories

    def update(self, story: UserStory, fields: dict) -> UserStory:
        for key, value in fields.items():
            setattr(story, key, value)
        self._db.commit()
        self._db.refresh(story)
        return story

    def delete(self, story: UserStory) -> None:
        self._db.delete(story)
        self._db.commit()

    def count_test_cases(self, story_id: int) -> int:
        return (self._db.query(func.count(TestCase.id))
                .filter(TestCase.story_id == story_id)
                .scalar())
