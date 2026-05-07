from __future__ import annotations
import logging
from typing import Optional

from ..config import settings
from ..interfaces.ai_provider import ITestCaseGenerator, ITestCaseBatchGenerator
from ..models import User, UserStory, TestCase
from ..repositories.story_repository import StoryRepository
from ..repositories.test_case_repository import TestCaseRepository
from .usage_service import UsageService

logger = logging.getLogger(__name__)


class TestCaseService:
    def __init__(
        self,
        story_repo: StoryRepository,
        tc_repo: TestCaseRepository,
        generator: ITestCaseGenerator,
        batch_generator: ITestCaseBatchGenerator,
        usage_service: UsageService,
    ) -> None:
        self._story_repo = story_repo
        self._tc_repo = tc_repo
        self._generator = generator
        self._batch_generator = batch_generator
        self._usage = usage_service

    async def generate_for_story(
        self, story: UserStory, user: User, max_cases: Optional[int] = None,
    ) -> UserStory:
        self._usage.ensure_within_budget(user)
        logger.info(
            "Generando casos para historia id=%s user_id=%s max_cases=%s",
            story.id, user.id, max_cases,
        )
        cases, usage = await self._generator.generate(
            story.title,
            story.description or "",
            story.acceptance_criteria or "",
            max_cases=max_cases,
        )
        self._usage.record(user.id, usage)
        valid_cases = [tc for tc in cases if tc.get("title") and tc.get("title") != "Error"]
        if not valid_cases:
            raise ValueError("La IA no generó casos de prueba válidos")
        existing = self._tc_repo.count_by_story(story.id)
        test_cases = [
            TestCase(
                story_id=story.id,
                case_id=f"TC-{story.id:03d}-{i:02d}",
                title=tc.get("title", ""),
                test_type=tc.get("test_type", "functional"),
                priority=tc.get("priority", "medium"),
                precondition=tc.get("precondition", ""),
                steps=tc.get("steps", []),
                expected_result=tc.get("expected_result", ""),
                status="pending",
            )
            for i, tc in enumerate(valid_cases, existing + 1)
        ]
        self._tc_repo.create_many(test_cases)
        logger.info(
            "Creados %d casos para historia id=%s cost=$%.6f",
            len(test_cases), story.id, usage.cost_usd,
        )
        return story

    async def generate_for_story_with_context(
        self,
        story: UserStory,
        user: User,
        *,
        archetypes: Optional[list[str]] = None,
        edge_cases_baseline: Optional[list[dict]] = None,
        invest_summary: Optional[str] = None,
        max_cases: Optional[int] = None,
    ) -> tuple[UserStory, list[TestCase]]:
        """
        Variante de generate_for_story usada por StoryReviewService.

        Diferencias con generate_for_story:
        - Acepta contexto enriquecido (archetypes, baseline, invest_summary).
        - Si el generator inyectado NO implementa generate_with_context,
          cae automáticamente al generate() clásico (degradación elegante).
        - Devuelve tupla (story, list[TestCase]) para que el agente pueda
          armar un response con el detalle de los casos creados.

        Mantiene IGUAL al método clásico:
        - ensure_within_budget(user) ANTES de la llamada al LLM.
        - record(user.id, usage) DESPUÉS para tracking de costo.
        - Offset de case_id: existing + 1, para no duplicar IDs si la HU ya
          tenía casos previos.
        - .get(key, default) para tolerancia ante respuestas LLM con campos
          faltantes (mismo defensive coding).
        - Ownership: NO se valida acá (responsabilidad de la route con
          _require_project + StoryRepository.get_by_id(project_id)).
        """
        self._usage.ensure_within_budget(user)
        logger.info(
            "Generando casos CON CONTEXTO para historia id=%s user_id=%s "
            "archetypes=%d baseline=%d invest=%s max_cases=%s",
            story.id, user.id,
            len(archetypes or []), len(edge_cases_baseline or []),
            bool(invest_summary), max_cases,
        )

        # Degradación elegante: si el provider no implementa generate_with_context
        # (ej. provider mock futuro), caemos al generate clásico sin contexto.
        # No-op silencioso pero loggeado: el QA no nota la degradación.
        if hasattr(self._generator, "generate_with_context"):
            cases, usage = await self._generator.generate_with_context(  # type: ignore[union-attr]
                story.title,
                story.description or "",
                story.acceptance_criteria or "",
                archetypes=archetypes,
                edge_cases_baseline=edge_cases_baseline,
                invest_summary=invest_summary,
                max_cases=max_cases,
            )
        else:
            logger.warning(
                "Provider %s no implementa generate_with_context; cayendo a "
                "generate() clásico sin contexto enriquecido.",
                type(self._generator).__name__,
            )
            cases, usage = await self._generator.generate(
                story.title,
                story.description or "",
                story.acceptance_criteria or "",
                max_cases=max_cases,
            )

        self._usage.record(user.id, usage)
        valid_cases = [tc for tc in cases if tc.get("title") and tc.get("title") != "Error"]
        if not valid_cases:
            raise ValueError("La IA no generó casos de prueba válidos")

        existing = self._tc_repo.count_by_story(story.id)
        test_cases = [
            TestCase(
                story_id=story.id,
                case_id=f"TC-{story.id:03d}-{i:02d}",
                title=tc.get("title", ""),
                test_type=tc.get("test_type", "functional"),
                priority=tc.get("priority", "medium"),
                precondition=tc.get("precondition", ""),
                steps=tc.get("steps", []),
                expected_result=tc.get("expected_result", ""),
                status="pending",
            )
            for i, tc in enumerate(valid_cases, existing + 1)
        ]
        self._tc_repo.create_many(test_cases)
        logger.info(
            "Creados %d casos (con contexto) para historia id=%s cost=$%.6f",
            len(test_cases), story.id, usage.cost_usd,
        )
        return story, test_cases

    async def generate_batch(
        self, stories: list[UserStory], user: User, max_cases: Optional[int] = None,
    ) -> dict:
        self._usage.ensure_within_budget(user)
        logger.info(
            "Batch %d historias user_id=%s max_cases=%s",
            len(stories), user.id, max_cases,
        )
        if len(stories) > settings.max_batch_size:
            raise ValueError(
                f"Máximo {settings.max_batch_size} historias por lote (límite del prompt). "
                f"Divide en lotes más pequeños — no hay cuota total."
            )

        collection = [
            {"id": s.id, "title": s.title,
             "description": s.description or "",
             "acceptance_criteria": s.acceptance_criteria or ""}
            for s in stories
        ]

        results_by_id, usage = await self._batch_generator.generate_batch(
            collection, max_cases=max_cases,
        )
        self._usage.record(user.id, usage)

        created_counts: dict[int, int] = {}
        all_test_cases: list[TestCase] = []

        for story in stories:
            raw_cases = results_by_id.get(story.id, [])
            valid_cases = [tc for tc in raw_cases if tc.get("title") and tc.get("title") != "Error"]
            existing = self._tc_repo.count_by_story(story.id)
            for i, tc in enumerate(valid_cases, existing + 1):
                all_test_cases.append(TestCase(
                    story_id=story.id,
                    case_id=f"TC-{story.id:03d}-{i:02d}",
                    title=tc.get("title", ""),
                    test_type=tc.get("test_type", "functional"),
                    priority=tc.get("priority", "medium"),
                    precondition=tc.get("precondition", ""),
                    steps=tc.get("steps", []),
                    expected_result=tc.get("expected_result", ""),
                    status="pending",
                ))
            created_counts[story.id] = len(valid_cases)

        self._tc_repo.create_many(all_test_cases)
        total = sum(created_counts.values())
        logger.info(
            "Batch ok: %d historias, %d casos cost=$%.6f",
            len(stories), total, usage.cost_usd,
        )
        return {
            "processed": len(stories),
            "total_cases_created": total,
            "detail": [{"story_id": sid, "cases_created": n} for sid, n in created_counts.items()],
        }
