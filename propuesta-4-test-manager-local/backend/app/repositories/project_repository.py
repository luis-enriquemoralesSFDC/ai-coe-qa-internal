from __future__ import annotations
"""SRP — única responsabilidad: acceso a datos de proyectos."""
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..models import Project, UserStory, TestCase


class ProjectRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def list_by_user(self, user_id: int) -> list[Project]:
        return (self._db.query(Project)
                .filter(Project.user_id == user_id)
                .order_by(Project.created_at.desc())
                .all())

    def get_by_id(self, project_id: int, user_id: int) -> Project | None:
        return (self._db.query(Project)
                .filter(Project.id == project_id, Project.user_id == user_id)
                .first())

    def create(self, name: str, description: str | None, user_id: int) -> Project:
        project = Project(name=name, description=description, user_id=user_id)
        self._db.add(project)
        self._db.commit()
        self._db.refresh(project)
        return project

    def update(self, project: Project, name: str | None, description: str | None) -> Project:
        if name is not None:
            project.name = name
        if description is not None:
            project.description = description
        self._db.commit()
        self._db.refresh(project)
        return project

    def delete(self, project: Project) -> None:
        self._db.delete(project)
        self._db.commit()

    def count_stories(self, project_id: int) -> int:
        return (self._db.query(func.count(UserStory.id))
                .filter(UserStory.project_id == project_id)
                .scalar())

    def count_test_cases(self, project_id: int) -> int:
        return (self._db.query(func.count(TestCase.id))
                .join(UserStory, TestCase.story_id == UserStory.id)
                .filter(UserStory.project_id == project_id)
                .scalar())
