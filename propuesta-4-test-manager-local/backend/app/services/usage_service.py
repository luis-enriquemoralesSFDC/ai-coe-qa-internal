from __future__ import annotations
"""
SRP — orquesta cuotas mensuales de IA por usuario.

- Antes de cada call: ensure_within_budget() lanza QuotaExceeded si user pasó el cap.
- Después de cada call exitosa: record() inserta una fila en ai_usage.
- Admins (User.is_admin=True) BYPASSAN el check (siempre dentro del cap).
- Si monthly_budget_usd <= 0, NO se aplica cap (modo dev).
"""
import logging

from ..config import settings
from ..interfaces.ai_provider import UsageInfo
from ..models import User
from ..repositories.usage_repository import UsageRepository, current_period_label

logger = logging.getLogger(__name__)


class QuotaExceeded(Exception):
    """Levantada cuando el usuario superó su presupuesto mensual."""

    def __init__(self, user_id: int, spent_usd: float, budget_usd: float) -> None:
        self.user_id = user_id
        self.spent_usd = spent_usd
        self.budget_usd = budget_usd
        super().__init__(
            f"Cuota mensual excedida: gastaste ${spent_usd:.4f} de ${budget_usd:.2f} este mes."
        )


class UsageService:
    def __init__(self, repo: UsageRepository) -> None:
        self._repo = repo

    @property
    def budget_usd(self) -> float:
        return settings.monthly_budget_usd

    @property
    def quota_disabled(self) -> bool:
        return self.budget_usd <= 0

    def ensure_within_budget(self, user: User) -> None:
        """Lanza QuotaExceeded si el user ya gastó más que su cap mensual."""
        if user.is_admin or self.quota_disabled:
            return
        spent, *_ = self._repo.sum_for_user_in_current_month(user.id)
        if spent >= self.budget_usd:
            logger.warning(
                "Quota exceeded user_id=%s spent=$%.4f budget=$%.2f",
                user.id, spent, self.budget_usd,
            )
            raise QuotaExceeded(user.id, spent, self.budget_usd)

    def record(self, user_id: int, info: UsageInfo) -> None:
        try:
            self._repo.record(user_id, info)
        except Exception as e:
            logger.error("Falló registrar usage user_id=%s op=%s: %s", user_id, info.operation, e)

    def get_summary(self, user: User) -> dict:
        cost, tokens_in, tokens_out, calls = self._repo.sum_for_user_in_current_month(user.id)
        budget = self.budget_usd
        bypass = user.is_admin or self.quota_disabled
        remaining = float("inf") if bypass else max(0.0, budget - cost)
        return {
            "user_id": user.id,
            "period": current_period_label(),
            "cost_usd": round(cost, 6),
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "calls": calls,
            "budget_usd": budget,
            "remaining_usd": remaining if remaining != float("inf") else 999_999.0,
            "bypass": bypass,
        }
