from __future__ import annotations
"""SRP — solo acceso a datos de ai_usage."""
from datetime import datetime, timezone
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..interfaces.ai_provider import UsageInfo
from ..models import AiUsage, User


def _start_of_month_utc(now: datetime | None = None) -> datetime:
    n = now or datetime.now(timezone.utc)
    return n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


class UsageRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def record(self, user_id: int, info: UsageInfo) -> AiUsage:
        row = AiUsage(
            user_id=user_id,
            operation=info.operation,
            model=info.model,
            tokens_in=info.tokens_in,
            tokens_out=info.tokens_out,
            cost_usd=info.cost_usd,
            latency_ms=info.latency_ms,
        )
        self._db.add(row)
        self._db.commit()
        self._db.refresh(row)
        return row

    def sum_for_user_in_current_month(self, user_id: int) -> tuple[float, int, int, int]:
        """Devuelve (cost_usd, tokens_in, tokens_out, calls) del mes en curso."""
        start = _start_of_month_utc()
        q = (
            self._db.query(
                func.coalesce(func.sum(AiUsage.cost_usd), 0.0),
                func.coalesce(func.sum(AiUsage.tokens_in), 0),
                func.coalesce(func.sum(AiUsage.tokens_out), 0),
                func.count(AiUsage.id),
            )
            .filter(AiUsage.user_id == user_id)
            .filter(AiUsage.created_at >= start)
        )
        cost, t_in, t_out, calls = q.one()
        return float(cost), int(t_in), int(t_out), int(calls)

    def usage_by_user_current_month(self) -> dict[int, tuple[float, int]]:
        """Retorna {user_id: (cost_usd, calls)} del mes en curso. Para vista admin."""
        start = _start_of_month_utc()
        q = (
            self._db.query(
                AiUsage.user_id,
                func.coalesce(func.sum(AiUsage.cost_usd), 0.0),
                func.count(AiUsage.id),
            )
            .filter(AiUsage.created_at >= start)
            .group_by(AiUsage.user_id)
            .all()
        )
        return {uid: (float(c), int(n)) for uid, c, n in q}

    def list_recent(self, limit: int = 100, user_id: int | None = None) -> list[AiUsage]:
        q = self._db.query(AiUsage)
        if user_id is not None:
            q = q.filter(AiUsage.user_id == user_id)
        return q.order_by(AiUsage.created_at.desc()).limit(limit).all()

    def list_recent_with_email(self, limit: int = 100) -> list[tuple[AiUsage, str]]:
        """Para admin: incluye email del user para cada fila."""
        q = (
            self._db.query(AiUsage, User.email)
            .join(User, AiUsage.user_id == User.id)
            .order_by(AiUsage.created_at.desc())
            .limit(limit)
            .all()
        )
        return [(usage, email) for usage, email in q]


def current_period_label(now: datetime | None = None) -> str:
    n = now or datetime.now(timezone.utc)
    return n.strftime("%Y-%m")
