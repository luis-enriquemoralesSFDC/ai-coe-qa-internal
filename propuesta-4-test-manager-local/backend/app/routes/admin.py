from __future__ import annotations
"""
Endpoints solo accesibles para users con is_admin=True.
- Lista todos los users + su gasto del mes en curso.
- Promueve / demote admins.
- Borra usuarios (cascade — proyectos, historias, casos, ai_usage, bug_reports).
- Lista llamadas recientes a la IA con detalle por usuario.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List

from ..auth.utils import require_admin
from ..database import get_db
from ..dependencies import get_usage_repo
from ..models import BugReport, Project, User
from ..repositories.usage_repository import UsageRepository
from ..schemas import AdminUserUpdate, AiUsageRowOut, UserAdminOut

router = APIRouter(prefix="/admin", tags=["admin"])


def _to_admin_dict(user: User, projects_count: int, cost: float, calls: int) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "is_admin": user.is_admin,
        "created_at": user.created_at,
        "projects_count": projects_count,
        "cost_usd_this_month": round(cost, 6),
        "calls_this_month": calls,
    }


def _project_counts(db: Session) -> dict[int, int]:
    rows = (
        db.query(Project.user_id, func.count(Project.id))
        .group_by(Project.user_id)
        .all()
    )
    return {uid: int(n) for uid, n in rows}


@router.get("/users", response_model=List[UserAdminOut])
def list_users(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    usage_repo: UsageRepository = Depends(get_usage_repo),
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    usage_map = usage_repo.usage_by_user_current_month()
    project_counts = _project_counts(db)
    return [
        _to_admin_dict(
            u,
            projects_count=project_counts.get(u.id, 0),
            cost=usage_map.get(u.id, (0.0, 0))[0],
            calls=usage_map.get(u.id, (0.0, 0))[1],
        )
        for u in users
    ]


@router.patch("/users/{user_id}", response_model=UserAdminOut)
def update_user(
    user_id: int,
    data: AdminUserUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    usage_repo: UsageRepository = Depends(get_usage_repo),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if data.is_admin is False and user.id == admin.id:
        raise HTTPException(
            status_code=400,
            detail="No podés quitarte tu propio rol de admin (pedile a otro admin).",
        )
    if data.is_admin is not None:
        user.is_admin = data.is_admin
    db.commit()
    db.refresh(user)
    cost, calls = usage_repo.usage_by_user_current_month().get(user.id, (0.0, 0))
    projects_count = db.query(Project).filter(Project.user_id == user.id).count()
    return _to_admin_dict(user, projects_count, cost, calls)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Borra un user. Cascadea: proyectos, historias, casos, ai_usage y bug_reports."""
    if user_id == admin.id:
        raise HTTPException(
            status_code=400,
            detail="No podés borrarte a vos mismo desde admin.",
        )
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    # bug_reports.uploaded_by es FK sin cascade — los borramos a mano
    # para evitar IntegrityError.
    reports = db.query(BugReport).filter(BugReport.uploaded_by == user_id).all()
    for r in reports:
        db.delete(r)
    db.delete(user)
    db.commit()


@router.get("/usage/recent", response_model=List[AiUsageRowOut])
def list_recent_usage(
    limit: int = 100,
    user_id: int | None = None,
    _admin: User = Depends(require_admin),
    usage_repo: UsageRepository = Depends(get_usage_repo),
):
    """
    Lista las últimas N calls a la IA con detalle (modelo, tokens, costo, latencia).
    Filtros: ?user_id=X (solo ese user), ?limit=N (1-500).
    """
    limit = max(1, min(limit, 500))
    if user_id is not None:
        rows = usage_repo.list_recent(limit=limit, user_id=user_id)
        return [
            {
                "id": r.id, "user_id": r.user_id, "user_email": None,
                "operation": r.operation, "model": r.model,
                "tokens_in": r.tokens_in, "tokens_out": r.tokens_out,
                "cost_usd": r.cost_usd, "latency_ms": r.latency_ms,
                "created_at": r.created_at,
            }
            for r in rows
        ]
    rows = usage_repo.list_recent_with_email(limit=limit)
    return [
        {
            "id": r.id, "user_id": r.user_id, "user_email": email,
            "operation": r.operation, "model": r.model,
            "tokens_in": r.tokens_in, "tokens_out": r.tokens_out,
            "cost_usd": r.cost_usd, "latency_ms": r.latency_ms,
            "created_at": r.created_at,
        }
        for r, email in rows
    ]
