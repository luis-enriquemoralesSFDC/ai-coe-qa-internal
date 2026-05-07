from __future__ import annotations
"""SRP — única responsabilidad: acceso a datos de Test Plans."""
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ..models import TestPlan


class TestPlanRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def list_by_project(self, project_id: int, user_id: int) -> list[TestPlan]:
        """Lista test plans del proyecto. Filtra también por user_id por defensa."""
        return (
            self._db.query(TestPlan)
            .filter(TestPlan.project_id == project_id, TestPlan.user_id == user_id)
            .order_by(TestPlan.created_at.desc())
            .all()
        )

    def get_by_id(self, plan_id: int, user_id: int) -> Optional[TestPlan]:
        return (
            self._db.query(TestPlan)
            .filter(TestPlan.id == plan_id, TestPlan.user_id == user_id)
            .first()
        )

    def create(
        self,
        *,
        project_id: int,
        user_id: int,
        client_name: str,
        doc_version: str,
        wizard_data: dict,
    ) -> TestPlan:
        plan = TestPlan(
            project_id=project_id,
            user_id=user_id,
            client_name=client_name,
            doc_version=doc_version,
            wizard_data=wizard_data,
            status="draft",
        )
        self._db.add(plan)
        self._db.commit()
        self._db.refresh(plan)
        return plan

    def update_wizard_data(self, plan: TestPlan, wizard_data: dict) -> TestPlan:
        plan.wizard_data = wizard_data
        plan.client_name = wizard_data.get("client_name", plan.client_name)
        plan.doc_version = wizard_data.get("doc_version", plan.doc_version)
        # Si ya estaba generated y el usuario edita, vuelve a draft hasta regenerar
        if plan.status == "generated":
            plan.status = "draft"
            plan.markdown_content = None
            plan.pending_fields = []
            plan.generated_at = None
        self._db.commit()
        self._db.refresh(plan)
        return plan

    def mark_generated(
        self, plan: TestPlan, markdown_content: str, pending_fields: list[str],
    ) -> TestPlan:
        plan.markdown_content = markdown_content
        plan.pending_fields = pending_fields
        plan.status = "generated"
        plan.generated_at = datetime.utcnow()
        self._db.commit()
        self._db.refresh(plan)
        return plan

    def delete(self, plan: TestPlan) -> None:
        self._db.delete(plan)
        self._db.commit()
