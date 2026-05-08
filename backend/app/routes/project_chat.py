"""SRP — solo HTTP del Asistente conversacional de proyecto.

Endpoints:
- POST   /projects/{pid}/chat/messages  → manda un mensaje, devuelve user+assistant.
- GET    /projects/{pid}/chat/messages  → lista historial completo.
- DELETE /projects/{pid}/chat/messages  → borra historial completo.

Defensa:
- TODAS las rutas pasan por get_current_user (auth) + _require_project (ownership).
- El handler del POST aplica rate limit (ai_rate_limit, mismo cap que las
  demás operaciones AI: previene flood / cost amplification).
- No-store/no-cache headers en TODAS las respuestas: el chat puede contener
  PII del proyecto y NO debe cachearse en proxies/CDN/browser.
- 404 (no 403) cuando el proyecto no es del user — no leakar existencia.
- Cuota: ProjectChatService llama ensure_within_budget; QuotaExceeded → 429.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from slowapi import Limiter

from ..auth.utils import get_current_user, user_or_ip_key
from ..config import settings
from ..dependencies import get_project_chat_service, get_project_repo
from ..models import Project, User
from ..repositories.project_repository import ProjectRepository
from ..schemas import (
    ProjectChatMessageOut,
    ProjectChatSendRequest,
    ProjectChatSendResponse,
)
from ..services.project_chat_service import ProjectChatService
from ..services.usage_service import QuotaExceeded


_limiter = Limiter(key_func=user_or_ip_key)
_ALLOWED_LOCALES = {"es", "en", "pt"}

router = APIRouter(prefix="/projects/{project_id}/chat", tags=["project-chat"])


def _get_locale(request: Request) -> str:
    raw = request.headers.get("Accept-Language", "es")
    lang = raw.split(",")[0].split(";")[0].strip().split("-")[0].lower()
    return lang if lang in _ALLOWED_LOCALES else "es"


_NO_STORE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Pragma": "no-cache",
}


def _apply_privacy_headers(response: Response) -> None:
    for k, v in _NO_STORE_HEADERS.items():
        response.headers[k] = v


def _require_project(project_id: int, user: User, repo: ProjectRepository) -> Project:
    """
    Carga el proyecto verificando ownership. 404 (no 403) si no existe o no
    pertenece al user, para no leakar existencia.
    """
    project = repo.get_by_id(project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return project


def _to_out(msg) -> ProjectChatMessageOut:
    """Convierte un ProjectChatMessage ORM a su schema, formateando created_at."""
    return ProjectChatMessageOut(
        id=msg.id,
        project_id=msg.project_id,
        turn_index=msg.turn_index,
        role=msg.role,
        content=msg.content,
        story_id=msg.story_id,
        created_at=msg.created_at.isoformat() if msg.created_at else "",
    )


@router.post("/messages", response_model=ProjectChatSendResponse)
@_limiter.limit(settings.ai_rate_limit)
async def send_message(
    request: Request,
    project_id: int,
    body: ProjectChatSendRequest,
    response: Response,
    project_repo: ProjectRepository = Depends(get_project_repo),
    chat_svc: ProjectChatService = Depends(get_project_chat_service),
    current_user: User = Depends(get_current_user),
):
    """
    Manda un mensaje al asistente del proyecto y devuelve la respuesta.

    Sincronico: el frontend espera la respuesta en el mismo POST. v0.1 sin
    streaming/SSE. Si en el futuro queremos streaming, este endpoint puede
    coexistir con uno nuevo /messages/stream.

    Si la cuota se excede → 429 (no se persiste el mensaje del user).
    Si el LLM falla → 500 (no se persiste). Mejor empezar limpio el reintento.
    """
    _apply_privacy_headers(response)
    project = _require_project(project_id, current_user, project_repo)

    try:
        user_msg, assistant_msg = await chat_svc.send_message(
            project=project,
            user=current_user,
            message=body.message,
            story_id=body.story_id,
            language=_get_locale(request),
        )
    except QuotaExceeded as e:
        raise HTTPException(status_code=429, detail=str(e))
    except ValueError as e:
        # Mensaje vacío tras sanitización u otro error de validación interno.
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        # Wrap del provider (LLM error). 502 para indicar dependencia externa.
        raise HTTPException(
            status_code=502,
            detail="El asistente no pudo responder. Intenta de nuevo en unos segundos.",
        )

    return ProjectChatSendResponse(
        user_message=_to_out(user_msg),
        assistant_message=_to_out(assistant_msg),
    )


@router.get("/messages", response_model=List[ProjectChatMessageOut])
def list_messages(
    project_id: int,
    response: Response,
    project_repo: ProjectRepository = Depends(get_project_repo),
    chat_svc: ProjectChatService = Depends(get_project_chat_service),
    current_user: User = Depends(get_current_user),
):
    """Historial completo del chat para este proyecto, en orden cronológico."""
    _apply_privacy_headers(response)
    _require_project(project_id, current_user, project_repo)
    msgs = chat_svc.list_messages(project_id, current_user.id)
    return [_to_out(m) for m in msgs]


@router.delete("/messages", status_code=204)
def clear_messages(
    project_id: int,
    response: Response,
    project_repo: ProjectRepository = Depends(get_project_repo),
    chat_svc: ProjectChatService = Depends(get_project_chat_service),
    current_user: User = Depends(get_current_user),
):
    """Borra TODO el historial del chat de este proyecto. Acción del QA, irreversible."""
    _apply_privacy_headers(response)
    _require_project(project_id, current_user, project_repo)
    chat_svc.clear(project_id, current_user.id)
    return Response(status_code=204, headers=_NO_STORE_HEADERS)
