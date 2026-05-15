from __future__ import annotations
"""
Project Chat Service — orquestador del Asistente conversacional de proyecto.

Responsabilidades:
1. Construir el contexto del proyecto (metadata + detalle de HU activa).
2. Sanitizar TODO antes de inyectarlo al LLM (defensa anti prompt injection).
3. Truncar el historial reciente a N mensajes (anti token bloat).
4. Enforce cuota mensual por user (UsageService.ensure_within_budget).
5. Persistir user + assistant messages en una transacción atómica.
6. NO loggear PII (solo IDs, conteos, latencias).

Lo que NO hace:
- NO ejecuta acciones en el sistema (no genera casos, no edita HUs).
  El chat es Q&A puro. Si el QA pide acción, el LLM lo redirige al botón apropiado.
- NO valida ownership del proyecto: eso lo hace la route con _require_project.
  Pero SÍ valida ownership del story_id contra el project_id (si viene), porque
  ese dato sí viaja desde el client y no se puede confiar.
- NO inventa datos del proyecto: solo extrae lo que está en BD.

Patrón inspirado en TestPlanCoachService pero más simple (sin actions, sin
policy engine, sin set_field).
"""
import logging
from typing import Optional

from ..interfaces.ai_provider import IProjectChatAssistant
from ..models import Project, ProjectChatMessage, User, UserStory
from ..providers._sanitize import sanitize_and_wrap, sanitize_user_text
from ..repositories.project_chat_repository import ProjectChatMessageRepository
from ..repositories.story_repository import StoryRepository
from ..repositories.test_case_repository import TestCaseRepository
from .usage_service import UsageService

logger = logging.getLogger(__name__)


# Caps de defensa (defense in depth):
# - HISTORY: cuántos turnos previos mandar al LLM. Más historia = más
#   coherencia pero también más tokens. 10 turnos = ~5 pares user/assistant.
_HISTORY_LIMIT = 10
# - HU activa: cuánto detalle inyectar (title + desc + AC). Caps individuales
#   para que un AC enorme no domine el contexto.
_HU_TITLE_CAP = 300
_HU_DESC_CAP = 1500
_HU_AC_CAP = 1500
# - Lista de HUs del proyecto: top N para mostrar metadata sin token bloat.
_STORIES_METADATA_LIMIT = 30
# - Cap de title de HU en metadata listada.
_STORY_TITLE_META_CAP = 120
# - Cap del bloque entero de contexto del proyecto. Si excede, truncamos.
_PROJECT_CONTEXT_TOTAL_CAP = 12_000


class ProjectChatService:
    def __init__(
        self,
        chat_repo: ProjectChatMessageRepository,
        story_repo: StoryRepository,
        tc_repo: TestCaseRepository,
        chat_assistant: IProjectChatAssistant,
        usage_service: UsageService,
    ) -> None:
        self._chat_repo = chat_repo
        self._story_repo = story_repo
        self._tc_repo = tc_repo
        self._assistant = chat_assistant
        self._usage = usage_service

    async def send_message(
        self,
        project: Project,
        user: User,
        message: str,
        story_id: Optional[int] = None,
        language: str = 'es',
    ) -> tuple[ProjectChatMessage, ProjectChatMessage]:
        """
        Procesa un turno: usuario manda mensaje → LLM responde → ambos persisten.

        Devuelve (user_msg_db, assistant_msg_db) ya con id/created_at.

        Validaciones de seguridad antes de gastar cuota:
        - story_id (si viene) DEBE pertenecer al mismo project (no se confía
          en el client). Si no pertenece, IGNORAMOS el story_id silenciosamente
          (el chat sigue funcionando como si no hubiera HU activa).
        - cuota: ensure_within_budget ANTES de la call al LLM (consistente con
          el resto de operaciones AI).

        Anti prompt injection (defense in depth):
        - El user_message se sanitiza con sanitize_user_text (cap 2000 ya
          validado por Pydantic; aquí limpiamos delimiters/control chars).
        - El project_context se construye desde BD (data nuestra, no input del
          QA) pero TODO el contenido pasa por sanitize_user_text antes y se
          envuelve con sanitize_and_wrap (label PROJECT_CONTEXT) — defense
          contra HUs/AC que vinieron de PDFs con prompt injection.
        - El history que mandamos al LLM viene de BD (mensajes pasados ya
          validados/sanitizados al guardar), pero sanitizamos otra vez
          defensively por si una versión vieja escribió algo raro.
        """
        self._usage.ensure_within_budget(user)

        active_story = self._resolve_active_story(project.id, story_id)
        sanitized_message = sanitize_user_text(message, max_chars=2000)
        if not sanitized_message.strip():
            raise ValueError("El mensaje quedó vacío tras la sanitización.")

        project_context = self._build_project_context(project, active_story)
        history = self._build_history_for_llm(project.id, user.id)

        logger.info(
            "Project chat turn project_id=%s user_id=%s story_id=%s "
            "msg_len=%d ctx_len=%d history_len=%d",
            project.id, user.id, active_story.id if active_story else None,
            len(sanitized_message), len(project_context), len(history),
        )

        try:
            assistant_text, usage = await self._assistant.respond(
                project_context=project_context,
                history=history,
                user_message=sanitized_message,
                language=language,
            )
        except Exception as exc:
            # NO persistimos el mensaje del user si la respuesta falla.
            # Razonamiento: si el QA reintenta, no queremos un mensaje user
            # huérfano sin assistant. Mejor empezar limpio.
            logger.exception(
                "Falló respuesta del LLM en project chat project_id=%s user_id=%s: %s",
                project.id, user.id, type(exc).__name__,
            )
            raise

        self._usage.record(user.id, usage)

        user_msg, assistant_msg = self._chat_repo.append_pair(
            project_id=project.id,
            user_id=user.id,
            user_content=sanitized_message,
            assistant_content=assistant_text,
            story_id=active_story.id if active_story else None,
        )

        logger.info(
            "Project chat OK project_id=%s user_id=%s assistant_len=%d cost=$%.6f",
            project.id, user.id, len(assistant_text), usage.cost_usd,
        )

        return user_msg, assistant_msg

    def list_messages(self, project_id: int, user_id: int) -> list[ProjectChatMessage]:
        """Lista todo el historial del chat del proyecto. Filtrado por ownership en el repo."""
        return self._chat_repo.list_by_project(project_id, user_id)

    def clear(self, project_id: int, user_id: int) -> int:
        """Borra todo el historial del chat. Devuelve cuántos mensajes borró."""
        n = self._chat_repo.delete_all_for_project(project_id, user_id)
        logger.info(
            "Project chat clear project_id=%s user_id=%s deleted=%d",
            project_id, user_id, n,
        )
        return n

    # ── Helpers internos ────────────────────────────────────────────────────

    def _resolve_active_story(
        self, project_id: int, story_id: Optional[int],
    ) -> Optional[UserStory]:
        """
        Si viene story_id, valida que pertenezca AL MISMO project. Si no
        pertenece (cross-project IDOR attempt) o no existe, devuelve None
        silenciosamente — el chat sigue funcionando sin contexto de HU.

        Por qué silencioso y no 404: el chat sigue siendo útil sin la HU,
        no queremos romper el flujo. Loggeamos el intento por si es ataque.
        """
        if story_id is None:
            return None
        story = self._story_repo.get_by_id(story_id, project_id)
        if story is None:
            logger.warning(
                "story_id=%s no pertenece a project_id=%s (ignorado en chat)",
                story_id, project_id,
            )
            return None
        return story

    def _build_project_context(
        self, project: Project, active_story: Optional[UserStory],
    ) -> str:
        """
        Construye el bloque de contexto del proyecto, sanitizado y wrapped.

        Contenido (opción D del análisis previo):
        - Metadata del proyecto (nombre, descripción, conteos).
        - Lista resumida de HUs (top N): id externo, título, INVEST score, # casos.
        - Si hay HU activa: detalle completo (title, desc, AC).

        TODO sanitizado pieza por pieza. El bloque final también va por
        sanitize_and_wrap con label PROJECT_CONTEXT (defense en profundidad).
        """
        stories = self._story_repo.list_by_project(project.id)
        total_stories = len(stories)
        total_cases = sum(self._tc_repo.count_by_story(s.id) for s in stories)
        analyzed = sum(1 for s in stories if s.invest_score is not None)

        # Bloque 1: metadata del proyecto
        proj_name = sanitize_user_text(project.name or "(sin nombre)", max_chars=200)
        proj_desc = sanitize_user_text(project.description or "(sin descripción)", max_chars=600)

        meta_block = (
            f"PROYECTO: {proj_name}\n"
            f"DESCRIPCIÓN: {proj_desc}\n"
            f"ESTADO: {total_stories} historias de usuario, {analyzed} con INVEST analizado, "
            f"{total_cases} casos de prueba en total."
        )

        # Bloque 2: lista de HUs (top N por created_at desc)
        if stories:
            # `list_by_project` ya devuelve por created_at desc; tomamos los top N.
            # Defensive: si created_at es None en alguna fila, igual queda al final.
            sorted_stories = stories[:_STORIES_METADATA_LIMIT]
            lines = []
            for s in sorted_stories:
                title = sanitize_user_text(s.title or "", max_chars=_STORY_TITLE_META_CAP)
                external = sanitize_user_text(s.external_id or "", max_chars=80)
                invest = f"INVEST={s.invest_score:.1f}" if s.invest_score is not None else "INVEST=—"
                cases = self._tc_repo.count_by_story(s.id)
                ext_part = f" ({external})" if external else ""
                lines.append(
                    f"- HU#{s.id}{ext_part}: {title} | {invest} | {cases} casos"
                )
            stories_block = "HISTORIAS DEL PROYECTO (top {}):\n{}".format(
                len(sorted_stories), "\n".join(lines),
            )
            if total_stories > _STORIES_METADATA_LIMIT:
                stories_block += (
                    f"\n(…y {total_stories - _STORIES_METADATA_LIMIT} HUs más no listadas "
                    f"para no saturar el contexto.)"
                )
        else:
            stories_block = "HISTORIAS DEL PROYECTO: (este proyecto aún no tiene HUs)."

        # Bloque 3: detalle de la HU activa (opcional, solo si la hay)
        active_block = ""
        if active_story is not None:
            t = sanitize_user_text(active_story.title or "", max_chars=_HU_TITLE_CAP)
            d = sanitize_user_text(active_story.description or "", max_chars=_HU_DESC_CAP)
            ac = sanitize_user_text(active_story.acceptance_criteria or "", max_chars=_HU_AC_CAP)
            invest_part = (
                f"INVEST={active_story.invest_score:.1f}/10"
                if active_story.invest_score is not None
                else "INVEST=no analizado"
            )
            cases_n = self._tc_repo.count_by_story(active_story.id)
            active_block = (
                f"\n\nHU ACTIVA (el QA está viendo esta HU ahora mismo):\n"
                f"- HU#{active_story.id} | {invest_part} | {cases_n} casos\n"
                f"- Título: {t}\n"
                f"- Descripción: {d}\n"
                f"- Criterios de aceptación: {ac}"
            )

        full_block = f"{meta_block}\n\n{stories_block}{active_block}"
        return sanitize_and_wrap(
            full_block, label="PROJECT_CONTEXT", max_chars=_PROJECT_CONTEXT_TOTAL_CAP,
        )

    def _build_history_for_llm(self, project_id: int, user_id: int) -> list[dict]:
        """
        Devuelve los últimos N mensajes en formato dict {role, content} en
        orden cronológico para alimentar al LLM.

        Sanitiza defensively cada content (cap por mensaje 2000 chars). Es
        defensa en profundidad: ya se sanitizó al guardar, pero versiones
        viejas o cualquier corruption en BD no debe romper el LLM.
        """
        recent = self._chat_repo.recent(project_id, user_id, limit=_HISTORY_LIMIT)
        return [
            {
                "role": m.role,
                "content": sanitize_user_text(m.content or "", max_chars=2000),
            }
            for m in recent
            if m.role in ("user", "assistant")  # safety: ignora roles raros
        ]
