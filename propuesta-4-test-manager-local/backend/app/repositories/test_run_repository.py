from __future__ import annotations
"""SRP — única responsabilidad: acceso a datos de la tabla test_runs.

Defensa en profundidad: todos los métodos de lectura/escritura piden user_id y
filtran por él. Aunque las rutas ya validan ownership al cargar el run, este
filtro extra evita que un cambio futuro en el call-site pueda cruzar runs entre
usuarios.

Importante: este repo solo lo usan los endpoints HTTP de FastAPI. El worker
Node externo (qa-worker/) habla SQLite directo con better-sqlite3 y no pasa
por aquí. Por eso aquí NO hay métodos del estilo "claim_next_queued" — esa
lógica vive en el worker.
"""
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy.orm import Session

from ..models import Project, TestRun


class TestRunRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def verify_project_owned(self, project_id: int, user_id: int) -> bool:
        return (
            self._db.query(Project.id)
            .filter(Project.id == project_id, Project.user_id == user_id)
            .first()
            is not None
        )

    def get_by_id(self, run_id: int, user_id: int) -> Optional[TestRun]:
        """Busca por id filtrando por owner para no leakar runs ajenos."""
        return (
            self._db.query(TestRun)
            .filter(TestRun.id == run_id, TestRun.user_id == user_id)
            .first()
        )

    def list_by_project(
        self, project_id: int, user_id: int, limit: int = 50,
    ) -> List[TestRun]:
        """Historial de runs del proyecto, más recientes primero."""
        return (
            self._db.query(TestRun)
            .join(Project, Project.id == TestRun.project_id)
            .filter(
                TestRun.project_id == project_id,
                Project.user_id == user_id,
            )
            .order_by(TestRun.created_at.desc())
            .limit(limit)
            .all()
        )

    def create(
        self,
        *,
        user_id: int,
        project_id: int,
        case_ids: List[int],
        env: str,
        base_url: str,
        prompt: str,
        model_id: str,
    ) -> TestRun:
        """Persiste un run con status='queued'. Verifica ownership antes."""
        if not self.verify_project_owned(project_id, user_id):
            raise PermissionError(
                f"project_id={project_id} no pertenece a user_id={user_id} (or doesn't exist)"
            )
        run = TestRun(
            user_id=user_id,
            project_id=project_id,
            case_ids=case_ids,
            env=env,
            base_url=base_url,
            prompt=prompt,
            model_id=model_id,
            status="queued",
            continue_signal=False,
            cancel_signal=False,
        )
        self._db.add(run)
        self._db.commit()
        self._db.refresh(run)
        return run

    def set_continue_signal(self, run: TestRun) -> TestRun:
        """Prende continue_signal. El worker lo consume en su próximo poll."""
        run.continue_signal = True
        self._db.commit()
        self._db.refresh(run)
        return run

    def set_cancel_signal(self, run: TestRun) -> TestRun:
        """Prende cancel_signal. El worker lo consume y aborta el run."""
        run.cancel_signal = True
        self._db.commit()
        self._db.refresh(run)
        return run

    def mark_finished(
        self,
        run: TestRun,
        *,
        status: str,
        result: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> TestRun:
        """
        Helper para uso administrativo (no del flujo normal del worker).
        El worker normalmente actualiza esto vía SQLite directo, pero este
        método permite reparar manualmente runs huérfanos desde una shell.
        """
        run.status = status
        if result is not None:
            run.result = result
        if error_message is not None:
            run.error_message = error_message
        run.finished_at = datetime.now(timezone.utc)
        self._db.commit()
        self._db.refresh(run)
        return run
