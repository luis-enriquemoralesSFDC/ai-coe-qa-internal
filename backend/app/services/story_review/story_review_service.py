from __future__ import annotations
"""
StoryReviewService — orquestador del "Story Review Agent".

NO es un agente LLM clásico (no hay loop ReAct ni tool selection autónoma):
es un pipeline determinístico de 3 pasos sobre los servicios existentes,
exponiendo una experiencia "tipo agente" al QA (con timeline visual de los
pasos y trazabilidad de cada uno).

Flujo (3 steps):
  1. INVEST — Si la HU no tiene análisis previo, lo ejecuta y persiste.
              Idempotente: skip silencioso si invest_analysis ya existe.
  2. Archetypes + Baseline — Detecta archetypes con regex (ArchetypeDetector)
              y arma el baseline de escenarios obligatorios (EdgeCaseCatalog).
              Persiste ambos en columnas nuevas de UserStory.
  3. Generate — Llama TestCaseService.generate_for_story_with_context con el
              contexto enriquecido (archetypes + baseline + invest_summary).

Por qué este diseño y no un BaseAgent con LLM tool-selection:
- Cero recursividad → cero risk de cost amplification.
- Cuotas y ownership existentes funcionan tal cual (cada service interno ya
  llama ensure_within_budget; la route hace _require_project).
- Trazable: cada step devuelve metadata estructurada (status, latency, cost,
  output sin PII) que el frontend renderiza como timeline.
- Idempotente en los pasos costosos (INVEST se reusa si existe).

Seguridad:
- El service NO recibe input crudo del QA: recibe `story` (ya validada por
  ownership en la route) y `user` (ya autenticado).
- NO loggea PII: solo IDs, conteos, scores y latencias. Nunca title,
  description ni acceptance_criteria.
- Defensa anti-injection: el contenido de archetypes y edge_cases_baseline
  va a través de _context_tc_user_prompt → sanitize_user_text antes de tocar
  el LLM (defensa en profundidad, aunque el catálogo es nuestro).

Errores: si un step falla, el service:
- Marca ese step con status="error" y mensaje genérico (sin trace al frontend).
- Sigue al siguiente step si es seguro (ej: si INVEST falla, generate puede
  seguir sin invest_summary). Si el step crítico (generate) falla, propaga
  para que la route mapee a 500/429 según corresponda.
"""
import logging
import time
from datetime import datetime, timezone
from typing import Literal, Optional

from sqlalchemy.exc import SQLAlchemyError

from ...models import User, UserStory
from ...repositories.story_repository import StoryRepository
from ...repositories.test_case_repository import TestCaseRepository
from ..invest_service import InvestService
from ..testcase_service import TestCaseService
from ..usage_service import QuotaExceeded
from .archetype_detector import ArchetypeDetector
from .edge_case_catalog import EdgeCaseCatalog

logger = logging.getLogger(__name__)


# Cap defensivo: cuántos casos máximos puede pedir el agente al LLM cuando
# max_cases viene None. Pasa al branch del prompt que dice "EXACTAMENTE N casos"
# en vez del branch "típica 6-15" (que en HUs largas explota a 30+ casos).
# El QA puede subirlo enviando max_cases explícito (1-30) en el request.
_DEFAULT_MAX_CASES_AGENT: int = 10

# Tipo de política cuando la HU YA tiene casos previos. Espejo del Literal en
# schemas.py:StoryReviewMode (mantener sincronizado).
ReviewMode = Literal["skip", "append", "replace"]


class StoryReviewService:
    def __init__(
        self,
        story_repo: StoryRepository,
        tc_repo: TestCaseRepository,
        invest_service: InvestService,
        testcase_service: TestCaseService,
        archetype_detector: ArchetypeDetector,
        edge_case_catalog: EdgeCaseCatalog,
    ) -> None:
        self._story_repo = story_repo
        self._tc_repo = tc_repo
        self._invest_service = invest_service
        self._testcase_service = testcase_service
        self._detector = archetype_detector
        self._catalog = edge_case_catalog

    async def review(
        self,
        story: UserStory,
        user: User,
        *,
        max_cases: Optional[int] = None,
        force_invest: bool = False,
        mode: ReviewMode = "skip",
        language: str = 'es',
    ) -> dict:
        """
        Ejecuta el flujo completo y devuelve un dict con:
        - story_id, project_id (no PII)
        - steps: list[dict] con cada paso (kind, status, started_at, latency_ms,
                 outcome resumido sin PII).
        - test_cases_created: int (cuántos casos nuevos se crearon).
        - last_review_at: ISO timestamp del run.

        El frontend usa `steps` para renderizar la timeline tipo agente.

        Parámetros:
        - max_cases: 1-30 si viene; si None, usa _DEFAULT_MAX_CASES_AGENT (10)
                     para evitar runs runaway. El QA puede pedir más explícitamente.
        - force_invest: si True, re-ejecuta INVEST aunque ya exista. Default
                        False (idempotencia: si la HU no cambió, reusa el análisis).
        - mode: política cuando la HU ya tiene casos:
                * "skip" (default): NO genera. Marca step como skipped y devuelve
                  contador de casos existentes. Protección anti-acumulación que
                  preserva ediciones manuales del QA.
                * "append": genera y SUMA encima (comportamiento legacy).
                * "replace": borra los previos en una transacción atómica y
                  genera nuevos. PIERDE ediciones manuales — el frontend debe
                  pedir confirmación explícita antes de mandar este valor.

        Cuota: cada step llama ensure_within_budget en su respectivo service.
        Si excede, propaga QuotaExceeded → la route lo mapea a 429.
        """
        review_started = datetime.now(timezone.utc)
        steps: list[dict] = []

        # ── Step 1: INVEST ────────────────────────────────────────────────
        invest_summary = await self._step_invest(story, user, force_invest, steps, language)

        # ── Step 2: Archetypes + Baseline (sin LLM, sin cuota) ────────────
        archetypes, baseline = self._step_archetypes_and_baseline(story, steps)

        # ── Step 3: Generate test cases con contexto ──────────────────────
        cases_created = await self._step_generate(
            story, user, archetypes, baseline, invest_summary, max_cases, mode, steps,
            language,
        )

        # Persistir last_review_at y los archetypes/baseline calculados
        # (defensive: lo intentamos pero si falla solo loggeamos, ya el step
        # crítico de generate fue exitoso).
        try:
            self._story_repo.update(story, {
                "archetypes": archetypes,
                "edge_cases_baseline": baseline,
                "last_review_at": review_started,
            })
        except SQLAlchemyError as exc:
            logger.warning(
                "No pude persistir review metadata para story_id=%s: %s",
                story.id, type(exc).__name__,
            )

        return {
            "story_id": story.id,
            "project_id": story.project_id,
            "last_review_at": review_started.isoformat(),
            "steps": steps,
            "test_cases_created": cases_created,
        }

    # ── Steps internos ────────────────────────────────────────────────────

    async def _step_invest(
        self, story: UserStory, user: User, force: bool, steps: list[dict],
        language: str = 'es',
    ) -> Optional[str]:
        """
        Ejecuta análisis INVEST si no existe (o si force=True).

        Devuelve el `overall_feedback` del análisis (string corto) para
        inyectar al prompt enriquecido del step 3. None si falla o si no
        había análisis previo y force=False... espera, en ese caso SÍ
        ejecuta. El None es solo cuando el step falla (degradación elegante).
        """
        start = time.monotonic()

        # Idempotencia: si la HU ya tiene análisis y no se fuerza, reusamos.
        if not force and story.invest_analysis:
            steps.append({
                "kind": "invest_analysis",
                "status": "skipped",
                "reason": "already_analyzed",
                "score": story.invest_score,
                "latency_ms": int((time.monotonic() - start) * 1000),
            })
            summary = self._extract_invest_summary(story.invest_analysis)
            return summary

        try:
            updated = await self._invest_service.analyze_and_save(story, user, language=language)
            steps.append({
                "kind": "invest_analysis",
                "status": "ok",
                "score": updated.invest_score,
                "latency_ms": int((time.monotonic() - start) * 1000),
            })
            return self._extract_invest_summary(updated.invest_analysis)
        except QuotaExceeded:
            # No swallowamos: cuota es señal crítica al QA.
            raise
        except Exception as exc:
            # INVEST no es crítico para generar casos; degradamos elegante.
            logger.warning(
                "Step INVEST falló para story_id=%s: %s — continuando sin INVEST",
                story.id, type(exc).__name__,
            )
            steps.append({
                "kind": "invest_analysis",
                "status": "error",
                "error_class": type(exc).__name__,
                "latency_ms": int((time.monotonic() - start) * 1000),
            })
            return None

    def _step_archetypes_and_baseline(
        self, story: UserStory, steps: list[dict],
    ) -> tuple[list[str], list[dict]]:
        """
        Detecta archetypes (regex) y arma baseline (catálogo). Sin LLM,
        sin cuota, sin riesgo. Si la HU no tiene texto, devuelve listas vacías.
        """
        start = time.monotonic()
        try:
            archetypes = self._detector.detect(story)
            baseline = self._catalog.lookup(archetypes)
            steps.append({
                "kind": "context_detection",
                "status": "ok",
                "archetypes": archetypes,
                "baseline_count": len(baseline),
                "latency_ms": int((time.monotonic() - start) * 1000),
            })
            return archetypes, baseline
        except Exception as exc:
            # Detector/catálogo son código nuestro: si falla es bug interno,
            # lo registramos y seguimos sin contexto enriquecido.
            logger.exception(
                "Detector/catalog falló para story_id=%s: %s",
                story.id, type(exc).__name__,
            )
            steps.append({
                "kind": "context_detection",
                "status": "error",
                "error_class": type(exc).__name__,
                "latency_ms": int((time.monotonic() - start) * 1000),
            })
            return [], []

    async def _step_generate(
        self,
        story: UserStory,
        user: User,
        archetypes: list[str],
        baseline: list[dict],
        invest_summary: Optional[str],
        max_cases: Optional[int],
        mode: ReviewMode,
        steps: list[dict],
        language: str = 'es',
    ) -> int:
        """
        Step crítico: si falla, el agente reporta error y propaga al endpoint.
        No se hace silent fail acá porque el QA espera ver casos creados.

        Comportamiento por `mode`:
        - "skip" (default seguro):
            Si la HU YA tiene casos, NO genera y NO toca BD. Marca el step como
            skipped con `existing_cases_count`. Esto evita la acumulación silenciosa
            que causaba 10 → 41 casos en re-runs y preserva ediciones manuales.
        - "append":
            Genera y suma encima (comportamiento legacy preservado para compat).
            El QA tiene que pedirlo explícitamente; nunca es default.
        - "replace":
            Pre-borra los casos previos en una transacción atómica y luego
            genera nuevos. Acción destructiva — el frontend confirma antes de
            mandarlo. Si la generación falla DESPUÉS del borrado, el QA pierde
            todo (riesgo aceptado: el QA pidió "reemplazar" explícitamente y
            el response del error le indica que vuelva a intentar).

        Defensa: el `mode` ya viene validado por Pydantic Literal en la route,
        pero acá tenemos un fallback defensivo a "skip" si llegara un valor raro
        por bug interno futuro (no debería pasar — Pydantic rechaza con 422).

        Cap defensivo: si max_cases es None usa _DEFAULT_MAX_CASES_AGENT (10)
        para forzar al provider al branch "EXACTAMENTE N casos" del prompt.
        """
        start = time.monotonic()

        existing_count = self._tc_repo.count_by_story(story.id)

        # Modo "skip": la HU ya tiene casos → no hacemos nada, no consumimos cuota.
        if mode == "skip" and existing_count > 0:
            logger.info(
                "Skip generate (mode=skip, existing=%d) story_id=%s",
                existing_count, story.id,
            )
            steps.append({
                "kind": "generate_test_cases",
                "status": "skipped",
                "reason": "already_has_cases",
                "existing_cases_count": existing_count,
                "mode": mode,
                "test_cases_created": 0,
                "latency_ms": int((time.monotonic() - start) * 1000),
            })
            return 0

        # Modo "replace": pre-borramos los casos previos (atomic) ANTES de gastar
        # cuota en el LLM. Si el LLM falla después, el QA pierde los casos pero
        # él pidió "reemplazar" explícitamente y la UI le pidió confirmación.
        deleted_count = 0
        if mode == "replace" and existing_count > 0:
            try:
                deleted_count = self._tc_repo.delete_by_story(story.id)
                logger.info(
                    "Replace mode: borrados %d casos previos story_id=%s user_id=%s",
                    deleted_count, story.id, user.id,
                )
            except SQLAlchemyError as exc:
                logger.exception(
                    "Replace mode: fallo borrando casos previos story_id=%s: %s",
                    story.id, type(exc).__name__,
                )
                steps.append({
                    "kind": "generate_test_cases",
                    "status": "error",
                    "error_class": type(exc).__name__,
                    "reason": "delete_previous_failed",
                    "mode": mode,
                    "latency_ms": int((time.monotonic() - start) * 1000),
                })
                raise

        # Defensa: si llega un mode no esperado (no debería; Pydantic ya validó),
        # comportamiento conservador = skip silencioso. Loggeamos para detectarlo.
        if mode not in ("skip", "append", "replace"):
            logger.warning(
                "mode desconocido '%s' para story_id=%s, fallback a skip",
                mode, story.id,
            )
            steps.append({
                "kind": "generate_test_cases",
                "status": "skipped",
                "reason": "invalid_mode_fallback",
                "existing_cases_count": existing_count,
                "mode": "skip",
                "test_cases_created": 0,
                "latency_ms": int((time.monotonic() - start) * 1000),
            })
            return 0

        # Cap defensivo: forzar el branch "EXACTAMENTE N" del prompt.
        effective_max = max_cases if max_cases is not None else _DEFAULT_MAX_CASES_AGENT

        try:
            _, cases = await self._testcase_service.generate_for_story_with_context(
                story,
                user,
                archetypes=archetypes,
                edge_cases_baseline=baseline,
                invest_summary=invest_summary,
                max_cases=effective_max,
                language=language,
            )
            step_payload = {
                "kind": "generate_test_cases",
                "status": "ok",
                "test_cases_created": len(cases),
                "with_context": True,
                "archetypes_used": len(archetypes),
                "baseline_used": len(baseline),
                "invest_used": bool(invest_summary),
                "existing_cases_count": existing_count,
                "mode": mode,
                "latency_ms": int((time.monotonic() - start) * 1000),
            }
            if deleted_count > 0:
                step_payload["deleted_count"] = deleted_count
            steps.append(step_payload)
            return len(cases)
        except QuotaExceeded:
            steps.append({
                "kind": "generate_test_cases",
                "status": "quota_exceeded",
                "existing_cases_count": existing_count,
                "mode": mode,
                "latency_ms": int((time.monotonic() - start) * 1000),
            })
            raise
        except Exception as exc:
            steps.append({
                "kind": "generate_test_cases",
                "status": "error",
                "error_class": type(exc).__name__,
                "existing_cases_count": existing_count,
                "mode": mode,
                "latency_ms": int((time.monotonic() - start) * 1000),
            })
            raise

    @staticmethod
    def _extract_invest_summary(analysis: Optional[dict]) -> Optional[str]:
        """
        Extrae el `overall_feedback` del análisis INVEST si existe.
        Ese texto es lo que vamos a inyectar al prompt del step 3 como
        invest_summary (sanitizado en el provider).

        Si el análisis tiene shape inesperada (ej: vino con otra estructura),
        devuelve None silenciosamente — el agente sigue sin INVEST summary.
        """
        if not isinstance(analysis, dict):
            return None
        feedback = analysis.get("overall_feedback")
        if not isinstance(feedback, str) or not feedback.strip():
            return None
        return feedback.strip()
