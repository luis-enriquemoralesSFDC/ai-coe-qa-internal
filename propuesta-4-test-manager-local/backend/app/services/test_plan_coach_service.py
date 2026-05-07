from __future__ import annotations
"""
SRP — orquesta los turnos del Coach conversacional para Test Plans.

Responsabilidades:
1. Construir el contexto del turno (wizard_data, violaciones, historial).
2. Llamar al LLM (`ITestPlanCoach`) y persistir mensajes.
3. Aplicar acciones SEGURAS al wizard_data (set_field con guard de identitarios).
4. Convertir `Violation`s del policy engine a `CoachAction`s para que el
   frontend las renderice como banner persistente.

Lo que NO hace:
- NO genera el .md final (eso lo hace TestPlanService.generate, que se sigue
  llamando aparte cuando el user le da al CTA "Generar plan").
- NO inventa reglas de cumplimiento (eso lo hace test_plan_policies.py, código
  determinístico).
"""
import logging
from typing import Optional

from ..interfaces.ai_provider import ITestPlanCoach
from ..models import Project, TestPlan, TestPlanCoachMessage, User
from ..repositories.test_plan_coach_repository import TestPlanCoachMessageRepository
from ..repositories.test_plan_repository import TestPlanRepository
from ..schemas import (
    CoachAction,
    CoachPicklistField,
    CoachPicklistOption,
    CoachTurnRequest,
    TestPlanWizardData,
)
from . import test_plan_policies
from .usage_service import UsageService

logger = logging.getLogger(__name__)


# Campos identitarios que el LLM NO puede patchear directo (set_field).
# Si el LLM los emite como set_field, los convertimos a confirm_value (le pide
# confirmación al QA antes de tocarlos). Defensa contra hallucination.
_IDENTITY_FIELDS = {"client_name", "sow_id", "doc_version", "confidentiality_year"}

# Campos prosa: el coach NO debe pedirlos como ask_text en chat (son largos);
# si los menciona, idealmente sugiere abrir el wizard o usar AI assist.
_PROSE_FIELDS = {"business_goal", "user_story_lifecycle", "salesforce_capacity", "scope_out"}

# Campos string del wizard. Cuando el QA responde por texto libre a un ask_text
# de uno de estos, lo auto-persistimos al wizard (Fix coach: antes el texto
# nunca llegaba al wizard, solo al historial; ver `_maybe_auto_apply_text`).
# Identitarios incluidos: responder al ask_text por client_name vale como
# confirmación implícita del valor.
_STRING_WIZARD_FIELDS = {
    "client_name", "sow_id", "doc_version", "confidentiality_year",
    "test_management_tool", "defect_management_tool", "browsers",
    "business_goal", "scope_out",
    "sprint_weeks", "project_roadmap",
    "env_dev_name", "env_qa_name", "env_sit_name", "env_uat_name",
    "user_story_lifecycle", "salesforce_capacity",
}

# Campos lista (rows estructurados): NO se auto-persisten desde texto libre
# porque requieren shape JSON (RiskRow, ApprovalRow, etc.). El Coach debería
# redirigir al wizard formulario para estos.
_LIST_WIZARD_FIELDS = {
    "version_history", "deployment_frequency",
    "extra_assumptions", "extra_risks", "extra_dependencies",
    "approvals",
}

# Kinds que el LLM puede emitir. Cualquier otra cosa se descarta a "none".
_VALID_LLM_KINDS = {
    "ask_text",
    "ask_picklist",
    "confirm_value",
    "suggest_replace",
    "set_field",
    "follow_up",
    "summary",
    "none",
}

# Kinds que abren un slot de respuesta libre del QA. Cuando el QA responde con
# `text` y el último mensaje del assistant tenía una action de uno de estos
# kinds con `field` específico, el texto se auto-persiste a ese field.
_TEXT_REPLY_OPENERS = {"ask_text", "follow_up"}

# Cuántos mensajes pasados llevamos al prompt del LLM (token budget control).
_HISTORY_WINDOW = 10


class TestPlanCoachService:
    def __init__(
        self,
        plan_repo: TestPlanRepository,
        message_repo: TestPlanCoachMessageRepository,
        coach: ITestPlanCoach,
        usage_service: UsageService,
    ) -> None:
        self._plans = plan_repo
        self._messages = message_repo
        self._coach = coach
        self._usage = usage_service

    # ── Lectura ────────────────────────────────────────────────────────────

    def list_messages(self, plan: TestPlan, user: User) -> list[TestPlanCoachMessage]:
        """Lista mensajes filtrados por ownership del plan (defensa en profundidad)."""
        return self._messages.list_by_plan(plan.id, user.id)

    def reset_messages(self, plan: TestPlan, user: User) -> int:
        """Borra historial conversacional. Idempotente; requiere ownership del plan."""
        return self._messages.delete_all_for_plan(plan.id, user.id)

    def validate(self, plan: TestPlan) -> tuple[list[CoachAction], bool]:
        """
        Re-evalúa todas las políticas sobre el wizard_data actual.
        Devuelve `(actions, can_generate)` donde actions son CoachAction de
        kind="block" o "warn", y can_generate=True si no hay bloqueos.
        """
        wizard = TestPlanWizardData(**plan.wizard_data)
        violations = test_plan_policies.evaluate_all(wizard)
        actions = [self._violation_to_action(v) for v in violations]
        can_generate = not test_plan_policies.has_blocking(violations)
        return actions, can_generate

    # ── Turn principal ─────────────────────────────────────────────────────

    async def start(
        self, plan: TestPlan, user: User, project_context: Optional[str] = None,
    ) -> TestPlanCoachMessage:
        """
        Inicia (o reinicia) la conversación. Si ya hay mensajes, agrega un nuevo
        turno introductorio basado en el estado actual; no borra historial.
        Devuelve el mensaje del assistant recién creado.
        """
        return await self._run_turn(
            plan=plan,
            user=user,
            user_input="",
            project_context=project_context,
            persist_user_message=False,  # turno inicial, no hay user input
        )

    async def turn(
        self,
        plan: TestPlan,
        user: User,
        req: CoachTurnRequest,
        project_context: Optional[str] = None,
    ) -> TestPlanCoachMessage:
        """
        Procesa una respuesta del QA y devuelve el siguiente mensaje del assistant.

        Orden de operaciones:
        1. Aplica los patches del user al wizard_data (picklist_answers,
           accept_suggestion_for) ANTES de hablar con el LLM, para que el LLM
           vea el estado nuevo.
        2. Persiste el mensaje del user (resumido).
        3. Llama al coach LLM con el wizard ya actualizado.
        4. Filtra/sanitiza la action emitida (guard de identitarios, kinds inválidos).
        5. Persiste el mensaje del assistant con su action.
        """
        user_input = self._apply_user_response_to_wizard(plan, user, req)
        return await self._run_turn(
            plan=plan,
            user=user,
            user_input=user_input,
            project_context=project_context,
            persist_user_message=True,
        )

    # ── Apply action manual ────────────────────────────────────────────────

    def apply_set_field(
        self, plan: TestPlan, field: str, value, *, force: bool = False,
    ) -> TestPlan:
        """
        Aplica un patch al wizard_data desde una action `set_field`. Llamado
        desde POST /coach/apply-action cuando el frontend acepta una sugerencia
        explícitamente.

        Bloquea silenciosamente patches a campos identitarios a menos que
        `force=True` (cuando viene de un confirm_value que el QA ya aprobó).
        """
        if field in _IDENTITY_FIELDS and not force:
            raise ValueError(
                f"Campo identitario '{field}' requiere confirmación explícita del QA."
            )
        wizard = TestPlanWizardData(**plan.wizard_data)
        if not hasattr(wizard, field):
            raise ValueError(f"Campo '{field}' no existe en TestPlanWizardData.")
        # Asignar y revalidar el wizard entero (Pydantic valida tipos/required)
        try:
            data = wizard.model_dump()
            data[field] = value
            new_wizard = TestPlanWizardData(**data)
        except Exception as e:
            raise ValueError(f"Valor inválido para '{field}': {e}") from e
        return self._plans.update_wizard_data(plan, new_wizard.model_dump())

    # ── Internals ──────────────────────────────────────────────────────────

    async def _run_turn(
        self,
        *,
        plan: TestPlan,
        user: User,
        user_input: str,
        project_context: Optional[str],
        persist_user_message: bool,
    ) -> TestPlanCoachMessage:
        # Persistir el user message ANTES de la call al LLM (para audit).
        # `append` valida ownership internamente — si plan no es del user,
        # lanza PermissionError y aborta el turno entero.
        if persist_user_message and user_input:
            self._messages.append(
                plan_id=plan.id,
                user_id=user.id,
                role="user",
                content=user_input[:2000],  # cap defensivo
                actions=[],
            )

        # Recargar plan para tener wizard_data actualizado tras posibles patches.
        self._plans._db.refresh(plan)
        wizard_dict = plan.wizard_data or {}

        # Evaluar policies (input para el LLM y para la respuesta final).
        try:
            wizard = TestPlanWizardData(**wizard_dict)
            violations = test_plan_policies.evaluate_all(wizard)
        except Exception as e:
            # Wizard data corrupto — sigue, el LLM puede ayudar a saneárlo.
            # NO loggear el wizard ni el contenido del error: pueden incluir
            # PII del cliente. Solo plan_id + tipo de excepción.
            logger.warning(
                "Wizard data inválido en plan %s: %s", plan.id, type(e).__name__,
            )
            violations = []
        violations_dicts = [
            {
                "rule_id": v.rule_id,
                "severity": v.severity,
                "field": v.field,
                "message": v.message,
                "blocks_generation": v.blocks_generation,
            }
            for v in violations
        ]

        # Historial reciente (cronológico, ya viene en orden, filtrado por owner).
        recent = self._messages.recent(plan.id, user.id, limit=_HISTORY_WINDOW)
        history_dicts = [
            {"role": m.role, "content": m.content} for m in recent
        ]

        # Cuota mensual.
        self._usage.ensure_within_budget(user)

        # Llamar al LLM.
        try:
            assistant_text, llm_action_dict, usage_info = await self._coach.turn(
                wizard_data=wizard_dict,
                violations=violations_dicts,
                history=history_dicts,
                user_input=user_input,
                project_context=project_context,
            )
            self._usage.record(user.id, usage_info)
        except Exception as e:
            # Fallback: persistir mensaje sintético para que el frontend no se cuelgue.
            # No loggear el contenido del wizard ni del prompt: pueden tener PII.
            logger.error(
                "Coach LLM falló en plan %s: %s",
                plan.id, type(e).__name__, exc_info=False,
            )
            return self._messages.append(
                plan_id=plan.id,
                user_id=user.id,
                role="assistant",
                content=(
                    "Tuve un problema técnico llamando al coach. "
                    "Puedes seguir editando el wizard manualmente y reintentar más tarde."
                ),
                actions=[],
            )

        # Sanitizar action del LLM (guard de identitarios + kind válido).
        actions_payload = self._sanitize_llm_action(llm_action_dict, plan)

        return self._messages.append(
            plan_id=plan.id,
            user_id=user.id,
            role="assistant",
            content=assistant_text,
            actions=actions_payload,
        )

    def _apply_user_response_to_wizard(
        self, plan: TestPlan, user: User, req: CoachTurnRequest,
    ) -> str:
        """
        Aplica los patches que el user mandó (picklist_answers, accept_suggestion_for)
        y devuelve un string que describe la respuesta del user para enviarlo al
        prompt del LLM como user_input.

        Texto libre con last action ask_text/follow_up: auto-persiste al field
        correspondiente (si es string field). Listas no se tocan.
        `user` se necesita para consultar el historial respetando ownership.
        """
        # Caso 1: respuesta texto libre.
        # Side effect: si el último ask_text tenía field, persistir al wizard.
        # El texto que devolvemos sigue siendo el original del QA para que se
        # vea natural en el historial y el LLM tenga el dato crudo.
        if req.text and not (req.picklist_answers or req.accept_suggestion_for or req.reject_suggestion_for):
            text = req.text.strip()
            self._maybe_auto_apply_text_to_last_field(plan, user, text)
            return text

        chunks: list[str] = []
        wizard_dict = dict(plan.wizard_data or {})
        wizard_dirty = False

        # Caso 2: picklist answers. Aplicar al wizard, registrar para el LLM.
        if req.picklist_answers:
            applied: list[str] = []
            rejected: list[str] = []
            for field, value in req.picklist_answers.items():
                if field in _IDENTITY_FIELDS:
                    rejected.append(f"{field} (identitario, requiere confirmación)")
                    continue
                if field not in wizard_dict and not _has_field(field):
                    rejected.append(f"{field} (no existe en wizard)")
                    continue
                wizard_dict[field] = value
                applied.append(f"{field}={value}")
                wizard_dirty = True
            if applied:
                chunks.append("Respuestas a picklist aplicadas: " + ", ".join(applied))
            if rejected:
                chunks.append("Picklists no aplicadas (requieren otro flujo): " + ", ".join(rejected))

        # Caso 3: accept_suggestion_for — buscar el último suggest_replace para ese field.
        if req.accept_suggestion_for:
            field = req.accept_suggestion_for
            sugg = self._find_last_suggestion(plan, user, field)
            if sugg is None:
                chunks.append(f"El QA aceptó sugerencia para '{field}' pero ya no estaba activa.")
            elif field in _IDENTITY_FIELDS:
                # Identitario: aceptar es OK (el LLM ya pidió confirmación), aplicar.
                wizard_dict[field] = sugg.get("proposed_value")
                wizard_dirty = True
                chunks.append(f"Confirmado: {field} = {sugg.get('proposed_value')}")
            else:
                wizard_dict[field] = sugg.get("proposed_value")
                wizard_dirty = True
                chunks.append(f"Sugerencia aceptada: {field} = {sugg.get('proposed_value')}")

        if req.reject_suggestion_for:
            chunks.append(f"El QA rechazó la sugerencia para '{req.reject_suggestion_for}'.")

        if req.bulk_confirm is not None:
            chunks.append(
                "El QA confirmó los valores extraídos en bloque." if req.bulk_confirm
                else "El QA rechazó los valores extraídos."
            )

        if req.text:
            chunks.append(f"Comentario adicional: {req.text.strip()}")

        # Persistir wizard si hubo cambios.
        if wizard_dirty:
            try:
                # Validar antes de persistir (no romper el plan).
                TestPlanWizardData(**wizard_dict)
                self._plans.update_wizard_data(plan, wizard_dict)
            except Exception as e:
                # NO loggear el wizard ni el contenido del error: pueden tener PII.
                logger.warning(
                    "No pude persistir wizard del plan %s tras user response: %s",
                    plan.id, type(e).__name__,
                )
                chunks.append("(advertencia: cambios no persistidos por validación)")

        return " | ".join(chunks) if chunks else ""

    def _find_last_suggestion(
        self, plan: TestPlan, user: User, field: str,
    ) -> Optional[dict]:
        """Busca el último mensaje assistant con una action suggest_replace o confirm_value para `field`."""
        recent = self._messages.recent(plan.id, user.id, limit=_HISTORY_WINDOW * 2)
        for m in reversed(recent):
            if m.role != "assistant":
                continue
            for a in (m.actions or []):
                if a.get("field") != field:
                    continue
                if a.get("kind") in ("suggest_replace", "confirm_value", "set_field"):
                    return a
        return None

    def _find_last_assistant_action_with_field(
        self, plan: TestPlan, user: User,
    ) -> Optional[dict]:
        """
        Devuelve la primera action con `field` del ÚLTIMO mensaje assistant.
        Si el último assistant no tenía actions con `field`, devuelve None
        (no escaneamos hacia atrás: el QA respondió al último turno, no a
        uno anterior).
        """
        recent = self._messages.recent(plan.id, user.id, limit=_HISTORY_WINDOW * 2)
        for m in reversed(recent):
            if m.role != "assistant":
                continue
            for a in (m.actions or []):
                if a.get("field"):
                    return a
            return None
        return None

    def _maybe_auto_apply_text_to_last_field(
        self, plan: TestPlan, user: User, text: str,
    ) -> None:
        """
        Side effect: cuando el QA responde por texto libre a un `ask_text` /
        `follow_up` que apuntaba a un field string del wizard, persiste
        `wizard_data[field] = text`.

        Reglas:
        - Solo aplica si la última action del assistant fue ask_text/follow_up
          con field set (TEXT_REPLY_OPENERS).
        - Solo persiste a campos string (`_STRING_WIZARD_FIELDS`).
        - Listas (`_LIST_WIZARD_FIELDS`) NO se tocan: requieren estructura.
        - Si Pydantic rechaza el wizard tras la asignación, hace silent fail
          con warning (no rompe el flujo del Coach).

        No retorna nada — el efecto observable es que `plan.wizard_data` queda
        actualizado en BD y el siguiente turn del LLM lo verá.
        """
        if not text:
            return
        last = self._find_last_assistant_action_with_field(plan, user)
        if not last:
            return
        if last.get("kind") not in _TEXT_REPLY_OPENERS:
            return
        field = (last.get("field") or "").strip()
        if not field:
            return
        if field in _LIST_WIZARD_FIELDS:
            # Texto libre no se puede mappear a RiskRow/ApprovalRow sin parser.
            # El LLM debería redirigir al wizard formulario en su próximo turno.
            logger.info(
                "[coach] auto-apply skipped (list field) field=%s plan=%s",
                field, plan.id,
            )
            return
        if field not in _STRING_WIZARD_FIELDS:
            # Field desconocido: no tocar, dejar que el LLM lo procese.
            return

        wizard_dict = dict(plan.wizard_data or {})
        wizard_dict[field] = text
        try:
            TestPlanWizardData(**wizard_dict)
            self._plans.update_wizard_data(plan, wizard_dict)
            logger.info(
                "[coach] auto-applied field=%s len=%d plan=%s",
                field, len(text), plan.id,
            )
        except Exception as e:
            # NO loggear el contenido del wizard ni del error: PII potencial.
            logger.warning(
                "[coach] auto-apply validation failed field=%s plan=%s: %s",
                field, plan.id, type(e).__name__,
            )

    def _sanitize_llm_action(self, llm_action: dict, plan: TestPlan) -> list[dict]:
        """
        Convierte la `next_action` cruda del LLM a una lista de CoachAction
        listas para persistir/serializar:
        1. Si kind es inválido → ignora la action.
        2. Si kind=set_field para un identitario → convierte a confirm_value.
        3. Si kind=ask_text para un campo de prosa → cambia hint sugiriendo wizard.
        4. Convierte picklist_fields del LLM al schema CoachPicklistField.

        El service NO inyecta blocks acá: los blocks se devuelven aparte vía
        `validate()` y el frontend los muestra en banner persistente.
        """
        if not llm_action:
            return []

        kind = (llm_action.get("kind") or "none").strip().lower()
        if kind not in _VALID_LLM_KINDS:
            logger.warning("LLM emitió kind inválido: %s — ignorando", kind)
            return []
        if kind == "none":
            return []

        field = (llm_action.get("field") or "").strip() or None
        rationale = (llm_action.get("rationale") or "").strip()

        # Guard #1: set_field a identitario → confirm_value.
        if kind == "set_field" and field in _IDENTITY_FIELDS:
            kind = "confirm_value"
            rationale = (rationale + " (convertido de set_field a confirm_value por ser identitario)").strip()

        # Guard #2: ask_text para campo de prosa → sugiere wizard en hint.
        hint = (llm_action.get("hint") or "").strip() or None
        if kind == "ask_text" and field in _PROSE_FIELDS:
            extra = "Si prefieres, abre el wizard y usa el botón ✨ AI para generar este texto."
            hint = (hint + " · " if hint else "") + extra

        action = CoachAction(
            kind=kind,
            rationale=rationale,
            severity="info",
            field=field,
            label=(llm_action.get("label") or "").strip() or None,
            hint=hint,
            current_value=_unstring(llm_action.get("current_value")),
            proposed_value=_unstring(llm_action.get("proposed_value")),
            picklist_fields=_parse_picklist_fields(llm_action.get("picklist_fields")),
            quick_options=_nonempty_list(llm_action.get("quick_options")),
            filled_fields=_nonempty_list(llm_action.get("summary_filled")),
            pending_fields=_nonempty_list(llm_action.get("summary_pending")),
        )
        return [action.model_dump()]

    def _violation_to_action(self, v) -> CoachAction:
        """Mapea Violation → CoachAction (kind=block si bloqueante, else warn)."""
        return CoachAction(
            kind="block" if v.blocks_generation else "warn",
            rationale=v.message,
            severity=v.severity,
            field=v.field,
            label=v.message,
            hint=v.fix_suggestion,
            rule_id=v.rule_id,
            blocks_generation=v.blocks_generation,
        )


# ── Helpers privados al módulo ───────────────────────────────────────────────

def _has_field(name: str) -> bool:
    """Helper barato: ¿el wizard schema tiene este field?"""
    return name in TestPlanWizardData.model_fields


def _unstring(v):
    """LLM serializa valores complejos como string vacío. Convierte "" → None."""
    if v is None or v == "":
        return None
    return v


def _nonempty_list(v):
    """LLM puede devolver [] cuando no aplica. Convierte a None para no serializar listas vacías."""
    if v is None:
        return None
    if isinstance(v, list) and len(v) == 0:
        return None
    return v


def _parse_picklist_fields(raw) -> Optional[list[CoachPicklistField]]:
    """Convierte el array de _LLMPicklistField a CoachPicklistField. None si vacío."""
    if not raw:
        return None
    out: list[CoachPicklistField] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        opts_raw = item.get("options") or []
        opts = [
            CoachPicklistOption(
                value=str(o.get("value", "")), label=o.get("label") or None,
            )
            for o in opts_raw
            if isinstance(o, dict) and o.get("value")
        ]
        if not opts:
            continue
        field = (item.get("field") or "").strip()
        if not field:
            continue
        out.append(
            CoachPicklistField(
                field=field,
                label=(item.get("label") or field).strip(),
                hint=(item.get("hint") or "").strip() or None,
                options=opts,
                current_value=(item.get("current_value") or "").strip() or None,
            )
        )
    return out or None
