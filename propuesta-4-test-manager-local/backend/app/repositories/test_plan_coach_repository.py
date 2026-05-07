from __future__ import annotations
"""SRP — única responsabilidad: acceso a datos de mensajes del Coach.

Defensa en profundidad / zero-retention cross-user:
TODOS los métodos de lectura/escritura piden `user_id` y hacen JOIN con TestPlan
para verificar ownership. Aunque las rutas ya filtran al cargar el plan, este
filtro extra evita que un cambio futuro en el call-site (o un repo reusado en
otra capa) pueda leakar mensajes entre usuarios.

`append` es la única excepción explícita: recibe `plan_id` ya validado por el
service (que cargó el plan vía `TestPlanRepository.get_by_id(plan_id, user_id)`).
Para hacer la validación visible, exponemos `verify_owned()` separado que el
service llama al inicio de cada operación.
"""
from typing import Optional

from sqlalchemy.orm import Session

from ..models import TestPlan, TestPlanCoachMessage


class TestPlanCoachMessageRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def verify_owned(self, plan_id: int, user_id: int) -> bool:
        """Verifica que el plan exista y pertenezca al user. True/False sin lanzar."""
        return (
            self._db.query(TestPlan.id)
            .filter(TestPlan.id == plan_id, TestPlan.user_id == user_id)
            .first()
            is not None
        )

    def list_by_plan(self, plan_id: int, user_id: int) -> list[TestPlanCoachMessage]:
        """Mensajes en orden cronológico, filtrados por ownership del plan."""
        return (
            self._db.query(TestPlanCoachMessage)
            .join(TestPlan, TestPlan.id == TestPlanCoachMessage.plan_id)
            .filter(
                TestPlanCoachMessage.plan_id == plan_id,
                TestPlan.user_id == user_id,
            )
            .order_by(TestPlanCoachMessage.turn_index.asc())
            .all()
        )

    def last_turn_index(self, plan_id: int, user_id: int) -> int:
        """Último turn_index, o -1. Filtra por ownership del plan."""
        last = (
            self._db.query(TestPlanCoachMessage.turn_index)
            .join(TestPlan, TestPlan.id == TestPlanCoachMessage.plan_id)
            .filter(
                TestPlanCoachMessage.plan_id == plan_id,
                TestPlan.user_id == user_id,
            )
            .order_by(TestPlanCoachMessage.turn_index.desc())
            .first()
        )
        return last.turn_index if last else -1

    def append(
        self,
        *,
        plan_id: int,
        user_id: int,
        role: str,
        content: str,
        actions: Optional[list[dict]] = None,
    ) -> TestPlanCoachMessage:
        """
        Persiste un mensaje. Requiere user_id y verifica ownership antes de
        escribir, para que un service mal escrito no pueda escribir en el
        historial de otro user.
        """
        if not self.verify_owned(plan_id, user_id):
            raise PermissionError(
                f"plan_id={plan_id} no pertenece a user_id={user_id} (or doesn't exist)"
            )
        next_idx = self.last_turn_index(plan_id, user_id) + 1
        msg = TestPlanCoachMessage(
            plan_id=plan_id,
            turn_index=next_idx,
            role=role,
            content=content,
            actions=actions or [],
        )
        self._db.add(msg)
        self._db.commit()
        self._db.refresh(msg)
        return msg

    def recent(
        self, plan_id: int, user_id: int, limit: int = 10,
    ) -> list[TestPlanCoachMessage]:
        """
        Últimos N mensajes en orden cronológico, filtrados por ownership.
        Usado para construir el contexto del LLM sin token bloat.
        """
        rows = (
            self._db.query(TestPlanCoachMessage)
            .join(TestPlan, TestPlan.id == TestPlanCoachMessage.plan_id)
            .filter(
                TestPlanCoachMessage.plan_id == plan_id,
                TestPlan.user_id == user_id,
            )
            .order_by(TestPlanCoachMessage.turn_index.desc())
            .limit(limit)
            .all()
        )
        return list(reversed(rows))

    def delete_all_for_plan(self, plan_id: int, user_id: int) -> int:
        """Limpia historial. Requiere ownership; retorna 0 si no es dueño."""
        if not self.verify_owned(plan_id, user_id):
            return 0
        n = (
            self._db.query(TestPlanCoachMessage)
            .filter(TestPlanCoachMessage.plan_id == plan_id)
            .delete()
        )
        self._db.commit()
        return n
