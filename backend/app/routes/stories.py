from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from typing import List, Optional
from slowapi import Limiter
from ..config import settings
from ..models import User
from ..schemas import (
    UserStoryCreate, UserStoryUpdate, UserStoryOut, BulkImportRequest,
    BatchGenerateRequest, GenerateTestCasesRequest,
    StoryReviewRequest, StoryReviewResponse,
)
from ..auth.utils import get_current_user, user_or_ip_key
from ..repositories.project_repository import ProjectRepository
from ..repositories.story_repository import StoryRepository
from ..services.invest_service import InvestService
from ..services.testcase_service import TestCaseService
from ..services.document_service import DocumentService
from ..services.story_review.story_review_service import StoryReviewService
from ..services.usage_service import QuotaExceeded
from ..dependencies import (
    get_project_repo, get_story_repo,
    get_invest_service, get_testcase_service, get_document_service,
    get_story_review_service,
)


_ALLOWED_LOCALES = {"es", "en", "pt"}


def _quota_to_http(e: QuotaExceeded) -> HTTPException:
    return HTTPException(
        status_code=429,
        detail={
            "message": "Cuota mensual de IA excedida",
            "spent_usd": round(e.spent_usd, 4),
            "budget_usd": round(e.budget_usd, 2),
            "hint": "Pedí a un admin que aumente tu cuota o esperá al siguiente mes.",
        },
    )


def _get_locale(request: Request) -> str:
    """Extrae el idioma del header Accept-Language. Fallback a 'es'."""
    raw = request.headers.get("Accept-Language", "es")
    lang = raw.split(",")[0].split(";")[0].strip().split("-")[0].lower()
    return lang if lang in _ALLOWED_LOCALES else "es"

# Rate limiter por USUARIO (token JWT) — fallback a IP si no hay token.
# Garantiza que cada QA tenga su propia cuota, incluso compartiendo red local.
_limiter = Limiter(key_func=user_or_ip_key)
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

router = APIRouter(prefix="/projects/{project_id}/stories", tags=["stories"])


def _require_project(project_id: int, user: User, repo: ProjectRepository):
    project = repo.get_by_id(project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return project


def _enrich(story, story_repo: StoryRepository) -> dict:
    return {**story.__dict__, "test_cases_count": story_repo.count_test_cases(story.id)}


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[UserStoryOut])
def list_stories(
    project_id: int,
    project_repo: ProjectRepository = Depends(get_project_repo),
    story_repo: StoryRepository = Depends(get_story_repo),
    current_user: User = Depends(get_current_user),
):
    _require_project(project_id, current_user, project_repo)
    stories = story_repo.list_by_project(project_id)
    return [_enrich(s, story_repo) for s in stories]


@router.post("/", response_model=UserStoryOut, status_code=201)
def create_story(
    project_id: int,
    data: UserStoryCreate,
    project_repo: ProjectRepository = Depends(get_project_repo),
    story_repo: StoryRepository = Depends(get_story_repo),
    current_user: User = Depends(get_current_user),
):
    _require_project(project_id, current_user, project_repo)
    story = story_repo.create(project_id=project_id, source=data.source or "manual", **data.model_dump(exclude={"source"}))
    return _enrich(story, story_repo)


@router.post("/bulk-import", response_model=List[UserStoryOut], status_code=201)
def bulk_import(
    project_id: int,
    data: BulkImportRequest,
    project_repo: ProjectRepository = Depends(get_project_repo),
    story_repo: StoryRepository = Depends(get_story_repo),
    current_user: User = Depends(get_current_user),
):
    _require_project(project_id, current_user, project_repo)
    stories = story_repo.create_many(project_id, data.source, [i.model_dump() for i in data.stories])
    return [_enrich(s, story_repo) for s in stories]


@router.get("/{story_id}", response_model=UserStoryOut)
def get_story(
    project_id: int,
    story_id: int,
    project_repo: ProjectRepository = Depends(get_project_repo),
    story_repo: StoryRepository = Depends(get_story_repo),
    current_user: User = Depends(get_current_user),
):
    _require_project(project_id, current_user, project_repo)
    story = story_repo.get_by_id(story_id, project_id)
    if not story:
        raise HTTPException(status_code=404, detail="Historia no encontrada")
    return _enrich(story, story_repo)


@router.put("/{story_id}", response_model=UserStoryOut)
def update_story(
    project_id: int,
    story_id: int,
    data: UserStoryUpdate,
    project_repo: ProjectRepository = Depends(get_project_repo),
    story_repo: StoryRepository = Depends(get_story_repo),
    current_user: User = Depends(get_current_user),
):
    _require_project(project_id, current_user, project_repo)
    story = story_repo.get_by_id(story_id, project_id)
    if not story:
        raise HTTPException(status_code=404, detail="Historia no encontrada")
    story = story_repo.update(story, data.model_dump(exclude_unset=True))
    return _enrich(story, story_repo)


@router.delete("/{story_id}", status_code=204)
def delete_story(
    project_id: int,
    story_id: int,
    project_repo: ProjectRepository = Depends(get_project_repo),
    story_repo: StoryRepository = Depends(get_story_repo),
    current_user: User = Depends(get_current_user),
):
    _require_project(project_id, current_user, project_repo)
    story = story_repo.get_by_id(story_id, project_id)
    if not story:
        raise HTTPException(status_code=404, detail="Historia no encontrada")
    story_repo.delete(story)


# ── AI endpoints ──────────────────────────────────────────────────────────────

@router.post("/import-file", response_model=UserStoryOut, status_code=201)
@_limiter.limit(settings.ai_rate_limit)
async def import_story_from_file(
    request: Request,
    project_id: int,
    file: UploadFile = File(...),
    project_repo: ProjectRepository = Depends(get_project_repo),
    doc_service: DocumentService = Depends(get_document_service),
    current_user: User = Depends(get_current_user),
    story_repo: StoryRepository = Depends(get_story_repo),
):
    _require_project(project_id, current_user, project_repo)
    filename = file.filename or "documento"
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""

    if ext not in doc_service.supported_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Formato no soportado. Usa: {', '.join(sorted(doc_service.supported_extensions))}",
        )
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 10 MB")
    try:
        story = await doc_service.import_from_file(project_id, filename, content, current_user)
    except QuotaExceeded as e:
        raise _quota_to_http(e)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _enrich(story, story_repo)


@router.post("/{story_id}/analyze-invest", response_model=UserStoryOut)
@_limiter.limit(settings.ai_rate_limit)
async def analyze_invest(
    request: Request,
    project_id: int,
    story_id: int,
    project_repo: ProjectRepository = Depends(get_project_repo),
    story_repo: StoryRepository = Depends(get_story_repo),
    invest_svc: InvestService = Depends(get_invest_service),
    current_user: User = Depends(get_current_user),
):
    _require_project(project_id, current_user, project_repo)
    story = story_repo.get_by_id(story_id, project_id)
    if not story:
        raise HTTPException(status_code=404, detail="Historia no encontrada")
    try:
        story = await invest_svc.analyze_and_save(story, current_user, language=_get_locale(request))
    except QuotaExceeded as e:
        raise _quota_to_http(e)
    return _enrich(story, story_repo)


@router.post("/generate-batch")
@_limiter.limit(settings.ai_rate_limit)
async def generate_batch(
    request: Request,
    project_id: int,
    data: BatchGenerateRequest,
    project_repo: ProjectRepository = Depends(get_project_repo),
    story_repo: StoryRepository = Depends(get_story_repo),
    tc_svc: TestCaseService = Depends(get_testcase_service),
    current_user: User = Depends(get_current_user),
):
    _require_project(project_id, current_user, project_repo)
    stories = story_repo.get_many_by_ids(data.story_ids, project_id)
    if not stories:
        raise HTTPException(status_code=404, detail="No se encontraron historias")

    try:
        return await tc_svc.generate_batch(
            stories, current_user, max_cases=data.max_cases, language=_get_locale(request),
        )
    except QuotaExceeded as e:
        raise _quota_to_http(e)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{story_id}/generate-test-cases", response_model=UserStoryOut)
@_limiter.limit(settings.ai_rate_limit)
async def generate_test_cases(
    request: Request,
    project_id: int,
    story_id: int,
    data: Optional[GenerateTestCasesRequest] = None,
    project_repo: ProjectRepository = Depends(get_project_repo),
    story_repo: StoryRepository = Depends(get_story_repo),
    tc_svc: TestCaseService = Depends(get_testcase_service),
    current_user: User = Depends(get_current_user),
):
    _require_project(project_id, current_user, project_repo)
    story = story_repo.get_by_id(story_id, project_id)
    if not story:
        raise HTTPException(status_code=404, detail="Historia no encontrada")
    max_cases = data.max_cases if data else None
    try:
        story = await tc_svc.generate_for_story(
            story, current_user, max_cases=max_cases, language=_get_locale(request),
        )
    except QuotaExceeded as e:
        raise _quota_to_http(e)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _enrich(story, story_repo)


@router.post("/{story_id}/agent/review", response_model=StoryReviewResponse)
@_limiter.limit(settings.ai_rate_limit)
async def agent_review_story(
    request: Request,
    project_id: int,
    story_id: int,
    data: Optional[StoryReviewRequest] = None,
    project_repo: ProjectRepository = Depends(get_project_repo),
    story_repo: StoryRepository = Depends(get_story_repo),
    review_svc: StoryReviewService = Depends(get_story_review_service),
    current_user: User = Depends(get_current_user),
):
    """
    Story Review Agent — orquestador de 3 steps sobre la HU.

    Flujo:
      1. INVEST (idempotente: skip si ya existe y force_invest=False).
      2. Detección de archetypes (regex) + lookup de baseline (catálogo).
      3. Generate test cases con contexto enriquecido.

    Seguridad y robustez:
    - Auth: get_current_user (JWT) + _require_project (ownership a nivel proyecto).
      Imposible IDOR a HUs de otro user/proyecto.
    - Rate limit: settings.ai_rate_limit (mismo cap que generate-test-cases).
    - Cuota: cada step interno llama ensure_within_budget; si excede → 429.
    - Logs sin PII: solo IDs, conteos, scores.

    Devuelve StoryReviewResponse (steps tipados + count de cases creados).
    El frontend re-fetch la HU para ver test_cases_count actualizado y los
    casos en sí.
    """
    _require_project(project_id, current_user, project_repo)
    story = story_repo.get_by_id(story_id, project_id)
    if not story:
        raise HTTPException(status_code=404, detail="Historia no encontrada")
    max_cases = data.max_cases if data else None
    force_invest = data.force_invest if data else False
    # mode: validado por Pydantic Literal en StoryReviewRequest (skip|append|replace).
    # Si data es None (request sin body), default seguro = "skip" (anti-acumulación).
    mode = data.mode if data else "skip"
    try:
        result = await review_svc.review(
            story,
            current_user,
            max_cases=max_cases,
            force_invest=force_invest,
            mode=mode,
            language=_get_locale(request),
        )
    except QuotaExceeded as e:
        raise _quota_to_http(e)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result
