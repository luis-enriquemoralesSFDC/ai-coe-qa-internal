from __future__ import annotations
import logging
from ..interfaces.ai_provider import IInvestAnalyzer
from ..models import User, UserStory
from ..repositories.story_repository import StoryRepository
from .usage_service import UsageService

logger = logging.getLogger(__name__)


class InvestService:
    def __init__(
        self,
        story_repo: StoryRepository,
        analyzer: IInvestAnalyzer,
        usage_service: UsageService,
    ) -> None:
        self._repo = story_repo
        self._analyzer = analyzer
        self._usage = usage_service

    async def analyze_and_save(self, story: UserStory, user: User) -> UserStory:
        self._usage.ensure_within_budget(user)
        logger.info("Analizando INVEST historia id=%s user_id=%s", story.id, user.id)
        analysis, usage = await self._analyzer.analyze(
            story.title,
            story.description or "",
            story.acceptance_criteria or "",
        )
        self._usage.record(user.id, usage)
        score = analysis.get("overall_score", 0)
        logger.info("INVEST completado id=%s score=%s cost=$%.6f", story.id, score, usage.cost_usd)
        return self._repo.update(story, {
            "invest_analysis": analysis,
            "invest_score": score,
        })
