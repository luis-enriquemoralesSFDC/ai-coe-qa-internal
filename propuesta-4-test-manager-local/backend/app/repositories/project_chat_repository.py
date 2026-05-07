from __future__ import annotations
"""SRP — única responsabilidad: acceso a datos de mensajes del chat de proyecto.

Defensa en profundidad / zero-retention cross-user:
TODOS los métodos de lectura/escritura piden `user_id` y hacen JOIN con Project
para verificar ownership. Aunque las rutas ya filtran al cargar el proyecto,
este filtro extra evita que un cambio futuro en el call-site (o un repo reusado
en otra capa) pueda leakar mensajes entre usuarios.

`append` es la única excepción explícita: recibe `project_id` ya validado por
el service. Para hacer la validación visible, exponemos `verify_owned()`
separado que el service llama al inicio de cada operación de escritura.

Mismo patrón que TestPlanCoachMessageRepository (ver
test_plan_coach_repository.py para racional original).
"""
from typing import Optional

from sqlalchemy.orm import Session

from ..models import Project, ProjectChatMessage


class ProjectChatMessageRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def verify_owned(self, project_id: int, user_id: int) -> bool:
        """Verifica que el proyecto exista y pertenezca al user. True/False sin lanzar."""
        return (
            self._db.query(Project.id)
            .filter(Project.id == project_id, Project.user_id == user_id)
            .first()
            is not None
        )

    def list_by_project(self, project_id: int, user_id: int) -> list[ProjectChatMessage]:
        """Mensajes en orden cronológico, filtrados por ownership del proyecto."""
        return (
            self._db.query(ProjectChatMessage)
            .join(Project, Project.id == ProjectChatMessage.project_id)
            .filter(
                ProjectChatMessage.project_id == project_id,
                Project.user_id == user_id,
            )
            .order_by(ProjectChatMessage.turn_index.asc())
            .all()
        )

    def last_turn_index(self, project_id: int, user_id: int) -> int:
        """Último turn_index, o -1. Filtra por ownership del proyecto."""
        last = (
            self._db.query(ProjectChatMessage.turn_index)
            .join(Project, Project.id == ProjectChatMessage.project_id)
            .filter(
                ProjectChatMessage.project_id == project_id,
                Project.user_id == user_id,
            )
            .order_by(ProjectChatMessage.turn_index.desc())
            .first()
        )
        return last.turn_index if last else -1

    def append(
        self,
        *,
        project_id: int,
        user_id: int,
        role: str,
        content: str,
        story_id: Optional[int] = None,
    ) -> ProjectChatMessage:
        """
        Persiste un mensaje. Requiere user_id y verifica ownership ANTES de
        escribir, para que un service mal escrito no pueda escribir en el
        historial de otro user.

        Defensa adicional: solo aceptamos roles válidos. Cualquier otro valor
        levanta ValueError (defensa contra bugs internos que pasen "system" u
        otro role inesperado al chat).
        """
        if role not in ("user", "assistant"):
            raise ValueError(f"role inválido: {role!r}. Solo 'user' o 'assistant'.")
        if not self.verify_owned(project_id, user_id):
            raise PermissionError(
                f"project_id={project_id} no pertenece a user_id={user_id} (or doesn't exist)"
            )
        next_idx = self.last_turn_index(project_id, user_id) + 1
        msg = ProjectChatMessage(
            project_id=project_id,
            turn_index=next_idx,
            role=role,
            content=content,
            story_id=story_id,
        )
        self._db.add(msg)
        self._db.commit()
        self._db.refresh(msg)
        return msg

    def append_pair(
        self,
        *,
        project_id: int,
        user_id: int,
        user_content: str,
        assistant_content: str,
        story_id: Optional[int] = None,
    ) -> tuple[ProjectChatMessage, ProjectChatMessage]:
        """
        Persiste user + assistant en una sola transacción.

        Garantía: si el commit falla, NINGUNO de los dos queda escrito (rollback
        atómico). Esto evita estados raros como "se ve el mensaje del user pero
        nunca llegó la respuesta del assistant".

        Verifica ownership UNA vez (no dos veces como append individual).
        """
        if not self.verify_owned(project_id, user_id):
            raise PermissionError(
                f"project_id={project_id} no pertenece a user_id={user_id} (or doesn't exist)"
            )
        next_idx = self.last_turn_index(project_id, user_id) + 1

        user_msg = ProjectChatMessage(
            project_id=project_id,
            turn_index=next_idx,
            role="user",
            content=user_content,
            story_id=story_id,
        )
        assistant_msg = ProjectChatMessage(
            project_id=project_id,
            turn_index=next_idx + 1,
            role="assistant",
            content=assistant_content,
            story_id=story_id,
        )
        self._db.add_all([user_msg, assistant_msg])
        self._db.commit()
        self._db.refresh(user_msg)
        self._db.refresh(assistant_msg)
        return user_msg, assistant_msg

    def recent(
        self, project_id: int, user_id: int, limit: int = 10,
    ) -> list[ProjectChatMessage]:
        """
        Últimos N mensajes en orden cronológico, filtrados por ownership.
        Usado para construir el contexto del LLM sin token bloat.
        """
        rows = (
            self._db.query(ProjectChatMessage)
            .join(Project, Project.id == ProjectChatMessage.project_id)
            .filter(
                ProjectChatMessage.project_id == project_id,
                Project.user_id == user_id,
            )
            .order_by(ProjectChatMessage.turn_index.desc())
            .limit(limit)
            .all()
        )
        return list(reversed(rows))

    def delete_all_for_project(self, project_id: int, user_id: int) -> int:
        """Limpia historial. Requiere ownership; retorna 0 si no es dueño."""
        if not self.verify_owned(project_id, user_id):
            return 0
        n = (
            self._db.query(ProjectChatMessage)
            .filter(ProjectChatMessage.project_id == project_id)
            .delete()
        )
        self._db.commit()
        return n
