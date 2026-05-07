from __future__ import annotations
"""
Contenedor de dependencias — ensambla interfaces con implementaciones concretas.
DIP: las rutas nunca importan OpenAI directamente.

A 2026-04 el único provider soportado es OpenAI (los $2000 de presupuesto del COE están
asignados a OpenAI). Si en el futuro se aprueban otros providers (Claude, Cursor CLI),
se agrega una nueva clase que implemente los protocols de app/interfaces/ai_provider.py.
"""
from fastapi import Depends
from sqlalchemy.orm import Session

from .database import get_db
from .readers import default_registry
from .repositories.project_repository import ProjectRepository
from .repositories.story_repository import StoryRepository
from .repositories.test_case_repository import TestCaseRepository
from .repositories.bug_repository import BugRepository
from .repositories.usage_repository import UsageRepository
from .repositories.test_plan_repository import TestPlanRepository
from .repositories.test_plan_coach_repository import TestPlanCoachMessageRepository
from .repositories.project_chat_repository import ProjectChatMessageRepository
from .services.invest_service import InvestService
from .services.testcase_service import TestCaseService
from .services.document_service import DocumentService
from .services.usage_service import UsageService
from .services.test_plan_service import TestPlanService
from .services.test_plan_coach_service import TestPlanCoachService
from .services.project_chat_service import ProjectChatService
from .services.kpis.kpi_service import KpiService
from .services.story_review.archetype_detector import ArchetypeDetector
from .services.story_review.edge_case_catalog import EdgeCaseCatalog
from .services.story_review.story_review_service import StoryReviewService
from .providers.openai_provider import (
    OpenAIInvestAnalyzer,
    OpenAITestCaseGenerator,
    OpenAIDocumentExtractor,
    OpenAITestPlanProseAssistant,
    OpenAITestPlanCoach,
    OpenAIProjectChatAssistant,
)


# ── AI Providers (singletons — se reusan entre requests) ─────────────────────

_invest_analyzer = OpenAIInvestAnalyzer()
_tc_generator = OpenAITestCaseGenerator()
_doc_extractor = OpenAIDocumentExtractor()
_test_plan_prose = OpenAITestPlanProseAssistant()
_test_plan_coach = OpenAITestPlanCoach()
_project_chat_assistant = OpenAIProjectChatAssistant()

# Story Review Agent: detector regex y catálogo curado son stateless e idempotentes,
# se pueden compartir entre requests sin riesgo (no tocan BD, no tienen IO).
_archetype_detector = ArchetypeDetector()
_edge_case_catalog = EdgeCaseCatalog()


# ── Repositories ──────────────────────────────────────────────────────────────

def get_project_repo(db: Session = Depends(get_db)) -> ProjectRepository:
    return ProjectRepository(db)


def get_story_repo(db: Session = Depends(get_db)) -> StoryRepository:
    return StoryRepository(db)


def get_tc_repo(db: Session = Depends(get_db)) -> TestCaseRepository:
    return TestCaseRepository(db)


def get_bug_repo(db: Session = Depends(get_db)) -> BugRepository:
    return BugRepository(db)


def get_usage_repo(db: Session = Depends(get_db)) -> UsageRepository:
    return UsageRepository(db)


def get_test_plan_repo(db: Session = Depends(get_db)) -> TestPlanRepository:
    return TestPlanRepository(db)


def get_test_plan_coach_message_repo(
    db: Session = Depends(get_db),
) -> TestPlanCoachMessageRepository:
    return TestPlanCoachMessageRepository(db)


def get_project_chat_repo(
    db: Session = Depends(get_db),
) -> ProjectChatMessageRepository:
    return ProjectChatMessageRepository(db)


# ── Services ──────────────────────────────────────────────────────────────────

def get_usage_service(
    repo: UsageRepository = Depends(get_usage_repo),
) -> UsageService:
    return UsageService(repo)


def get_invest_service(
    story_repo: StoryRepository = Depends(get_story_repo),
    usage_service: UsageService = Depends(get_usage_service),
) -> InvestService:
    return InvestService(story_repo, _invest_analyzer, usage_service)


def get_testcase_service(
    story_repo: StoryRepository = Depends(get_story_repo),
    tc_repo: TestCaseRepository = Depends(get_tc_repo),
    usage_service: UsageService = Depends(get_usage_service),
) -> TestCaseService:
    return TestCaseService(story_repo, tc_repo, _tc_generator, _tc_generator, usage_service)


def get_document_service(
    story_repo: StoryRepository = Depends(get_story_repo),
    usage_service: UsageService = Depends(get_usage_service),
) -> DocumentService:
    return DocumentService(story_repo, default_registry, _doc_extractor, usage_service)


def get_kpi_service(
    db: Session = Depends(get_db),
    bug_repo: BugRepository = Depends(get_bug_repo),
) -> KpiService:
    return KpiService(db, bug_repo)


def get_test_plan_service(
    repo: TestPlanRepository = Depends(get_test_plan_repo),
    usage_service: UsageService = Depends(get_usage_service),
) -> TestPlanService:
    return TestPlanService(repo, _test_plan_prose, usage_service)


def get_test_plan_coach_service(
    plan_repo: TestPlanRepository = Depends(get_test_plan_repo),
    msg_repo: TestPlanCoachMessageRepository = Depends(get_test_plan_coach_message_repo),
    usage_service: UsageService = Depends(get_usage_service),
) -> TestPlanCoachService:
    return TestPlanCoachService(plan_repo, msg_repo, _test_plan_coach, usage_service)


def get_project_chat_service(
    chat_repo: ProjectChatMessageRepository = Depends(get_project_chat_repo),
    story_repo: StoryRepository = Depends(get_story_repo),
    tc_repo: TestCaseRepository = Depends(get_tc_repo),
    usage_service: UsageService = Depends(get_usage_service),
) -> ProjectChatService:
    """
    Asistente conversacional contextualizado por proyecto.

    Se reusa el mismo provider singleton (_project_chat_assistant) entre requests
    porque es stateless. Las dependencias por-request son las que tocan BD.
    """
    return ProjectChatService(
        chat_repo, story_repo, tc_repo, _project_chat_assistant, usage_service,
    )


# ── Story Review Agent ───────────────────────────────────────────────────────

def get_archetype_detector() -> ArchetypeDetector:
    """Singleton stateless: detector de archetypes basado en regex."""
    return _archetype_detector


def get_edge_case_catalog() -> EdgeCaseCatalog:
    """Singleton stateless: catálogo curado de escenarios baseline por archetype."""
    return _edge_case_catalog


def get_story_review_service(
    story_repo: StoryRepository = Depends(get_story_repo),
    tc_repo: TestCaseRepository = Depends(get_tc_repo),
    invest_service: InvestService = Depends(get_invest_service),
    testcase_service: TestCaseService = Depends(get_testcase_service),
    detector: ArchetypeDetector = Depends(get_archetype_detector),
    catalog: EdgeCaseCatalog = Depends(get_edge_case_catalog),
) -> StoryReviewService:
    """Orquesta los 3 steps del agente: INVEST + detección + generate con contexto.

    El tc_repo se inyecta para que el service pueda consultar count_by_story y
    delete_by_story directamente (necesario para los modos skip/replace).
    """
    return StoryReviewService(
        story_repo, tc_repo, invest_service, testcase_service, detector, catalog,
    )
