from __future__ import annotations
"""
SRP — orquesta la generación del QA Plan de Pruebas a partir del wizard del QA
y la plantilla canónica `app/templates/test_plan/qa_plan_master.md`.

Reglas de la propuesta-1 que portamos:
- No reordenar ni tocar texto fuera de los placeholders `{{...}}`.
- Los marcadores `[[PORTADA_*]]` quedan LITERALES en el .md final.
- Si un placeholder simple queda sin valor → `[[PENDIENTE: <NOMBRE>]]`.
- Tablas obligatorias vacías → una fila con `[[PENDIENTE: <NOMBRE>]]` para no
  romper el layout Markdown.
- Tablas opcionales (`EXTRA_*`) vacías → se quedan vacías.
"""
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from ..interfaces.ai_provider import ITestPlanProseAssistant
from ..models import Project, TestPlan, User
from ..repositories.test_plan_repository import TestPlanRepository
from ..schemas import (
    ApprovalRow,
    AssumptionRow,
    DependencyRow,
    DeploymentFrequencyRow,
    RiskRow,
    TestPlanWizardData,
    VersionHistoryRow,
)
from .test_plan_policies import (
    PolicyViolationsBlock,
    evaluate_all as evaluate_policies,
    has_blocking,
)
from .usage_service import UsageService

logger = logging.getLogger(__name__)


# ── Localización de la plantilla ──────────────────────────────────────────────
_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "test_plan"
_TEMPLATE_FILE = _TEMPLATE_DIR / "qa_plan_master.md"


# ── Mapping campo wizard → nombre del placeholder en la plantilla ─────────────
# Cualquier desincronización entre este dict y los placeholders reales de la
# plantilla hace que `validate_template_schema_sync()` lance RuntimeError al
# arrancar la app. Esto previene drift silencioso.

WIZARD_TO_PLACEHOLDER: dict[str, str] = {
    "client_name": "CLIENT_NAME",
    "sow_id": "SOW_ID",
    "doc_version": "DOC_VERSION",
    "confidentiality_year": "CONFIDENTIALITY_YEAR",
    "test_management_tool": "TEST_MANAGEMENT_TOOL",
    "defect_management_tool": "DEFECT_MANAGEMENT_TOOL",
    "browsers": "BROWSERS",
    "version_history": "VERSION_HISTORY_ROWS",
    "business_goal": "BUSINESS_GOAL",
    "scope_out": "SCOPE_OUT",
    "sprint_weeks": "SPRINT_WEEKS",
    "project_roadmap": "PROJECT_ROADMAP",
    "env_dev_name": "ENV_DEV_NAME",
    "env_qa_name": "ENV_QA_NAME",
    "env_sit_name": "ENV_SIT_NAME",
    "env_uat_name": "ENV_UAT_NAME",
    "deployment_frequency": "DEPLOYMENT_FREQUENCY_ROWS",
    "user_story_lifecycle": "USER_STORY_LIFECYCLE",
    "salesforce_capacity": "SALESFORCE_CAPACITY",
    "extra_assumptions": "EXTRA_ASSUMPTIONS_ROWS",
    "extra_risks": "EXTRA_RISKS_ROWS",
    "extra_dependencies": "EXTRA_DEPENDENCIES_ROWS",
    "approvals": "APPROVALS_ROWS",
}

_PROSE_FIELDS = {"business_goal", "user_story_lifecycle", "salesforce_capacity", "scope_out"}

# Tablas con número de columnas — para generar fila pendiente bien formateada.
_REQUIRED_TABLE_COLUMNS = {
    "version_history": 4,         # | Version | Fecha | Descripción | Autor |
    "approvals": 4,               # | Nombre | Compañía | Rol | Fecha |
}
# deployment_frequency tiene defaults siempre, no necesita pendiente.

_PLACEHOLDER_RE = re.compile(r"\{\{([A-Z_]+)\}\}")


# ── Validación de drift entre plantilla y schema (corre al startup) ───────────

def _extract_template_placeholders() -> set[str]:
    if not _TEMPLATE_FILE.exists():
        raise RuntimeError(f"No se encontró la plantilla en {_TEMPLATE_FILE}")
    text = _TEMPLATE_FILE.read_text(encoding="utf-8")
    return set(_PLACEHOLDER_RE.findall(text))


def validate_template_schema_sync() -> None:
    """Llamar al startup. Si algo está desincronizado, lanza RuntimeError."""
    template_phs = _extract_template_placeholders()
    schema_phs = set(WIZARD_TO_PLACEHOLDER.values())
    missing_in_schema = template_phs - schema_phs
    extra_in_schema = schema_phs - template_phs
    if missing_in_schema:
        raise RuntimeError(
            f"Plantilla del Test Plan tiene placeholders sin mapping en TestPlanWizardData: "
            f"{sorted(missing_in_schema)}. Edita app/services/test_plan_service.py "
            f"WIZARD_TO_PLACEHOLDER y app/schemas.py TestPlanWizardData."
        )
    if extra_in_schema:
        raise RuntimeError(
            f"Schema TestPlanWizardData mapea placeholders que NO existen en la plantilla: "
            f"{sorted(extra_in_schema)}. Plantilla en {_TEMPLATE_FILE}."
        )
    logger.info(
        "[test_plan] sync OK: %d placeholders mapeados",
        len(WIZARD_TO_PLACEHOLDER),
    )


# ── Renderers de filas Markdown para tablas repetibles ────────────────────────

def _render_version_history_rows(rows: list[VersionHistoryRow]) -> str:
    return "\n".join(
        f"| {r.version} | {r.date} | {r.description} | {r.author} |" for r in rows
    )


def _render_deployment_frequency_rows(rows: list[DeploymentFrequencyRow]) -> str:
    """Si vacío → defaults documentados (ver interview_guide.md, Bloque 5)."""
    if not rows:
        return (
            "| Salesforce DEV | DEV01 | QA | Cada desarrollo |\n"
            "| Cliente | QA01 | SIT01 | Cada Sprint |\n"
            "| Cliente | UAT01 | PROD01 | Cuando es necesario |"
        )
    return "\n".join(
        f"| {r.responsible} | {r.from_env} | {r.to_env} | {r.frequency} |" for r in rows
    )


def _render_assumption_rows(rows: list[AssumptionRow]) -> str:
    return "\n".join(f"| {r.code} | {r.description} |" for r in rows)


def _render_risk_rows(rows: list[RiskRow]) -> str:
    return "\n".join(
        f"| {r.code} | {r.description} | {r.probability} | {r.impact} | {r.mitigation} |"
        for r in rows
    )


def _render_dependency_rows(rows: list[DependencyRow]) -> str:
    return "\n".join(
        f"| {r.description} | {r.impact} | {r.responsible} |" for r in rows
    )


def _render_approval_rows(rows: list[ApprovalRow]) -> str:
    return "\n".join(
        f"| {r.name} | {r.company} | {r.role} | {r.date or '[[PENDIENTE: Fecha de aprobación]]'} |"
        for r in rows
    )


_TABLE_RENDERERS = {
    "version_history": _render_version_history_rows,
    "deployment_frequency": _render_deployment_frequency_rows,
    "extra_assumptions": _render_assumption_rows,
    "extra_risks": _render_risk_rows,
    "extra_dependencies": _render_dependency_rows,
    "approvals": _render_approval_rows,
}


def _empty_required_table_row(field: str) -> str:
    """Genera una fila Markdown vacía con [[PENDIENTE]] en la primera celda."""
    cols = _REQUIRED_TABLE_COLUMNS[field]
    placeholder_name = WIZARD_TO_PLACEHOLDER[field]
    cells = [f"[[PENDIENTE: {placeholder_name}]]"] + [""] * (cols - 1)
    return "| " + " | ".join(cells) + " |"


def _resolve_value(field: str, value, pending_acc: list[str]) -> str:
    """
    Convierte el valor del wizard al string que reemplaza el {{PLACEHOLDER}}.
    Si queda sin contenido y es obligatorio, agrega a `pending_acc`.
    """
    placeholder_name = WIZARD_TO_PLACEHOLDER[field]

    # Tablas (campos lista).
    if field in _TABLE_RENDERERS:
        rendered = _TABLE_RENDERERS[field](value or [])
        if rendered:
            return rendered
        # Vacía: ¿es obligatoria?
        if field in _REQUIRED_TABLE_COLUMNS:
            pending_acc.append(placeholder_name)
            return _empty_required_table_row(field)
        # Tabla opcional vacía → string vacío (la tabla queda solo con baseline).
        return ""

    # Campos string.
    text = (str(value) if value is not None else "").strip()
    if text:
        return text
    pending_acc.append(placeholder_name)
    return f"[[PENDIENTE: {placeholder_name}]]"


# ── Service principal ─────────────────────────────────────────────────────────

class TestPlanService:
    def __init__(
        self,
        repo: TestPlanRepository,
        prose_assistant: ITestPlanProseAssistant,
        usage_service: UsageService,
    ) -> None:
        self._repo = repo
        self._prose = prose_assistant
        self._usage = usage_service

    # ── CRUD básico ────────────────────────────────────────────────────────

    def create_draft(
        self, project: Project, user: User, wizard_data: TestPlanWizardData,
    ) -> TestPlan:
        return self._repo.create(
            project_id=project.id,
            user_id=user.id,
            client_name=wizard_data.client_name,
            doc_version=wizard_data.doc_version,
            wizard_data=wizard_data.model_dump(),
        )

    def update_draft(
        self, plan: TestPlan, wizard_data: TestPlanWizardData,
    ) -> TestPlan:
        return self._repo.update_wizard_data(plan, wizard_data.model_dump())

    def delete(self, plan: TestPlan) -> None:
        self._repo.delete(plan)

    # ── Generación del Markdown final ──────────────────────────────────────

    async def generate(
        self, plan: TestPlan, user: User, *, use_ai_for_prose: bool,
    ) -> TestPlan:
        """
        Renderiza la plantilla canónica con los datos del wizard.

        Flujo en 4 pasos:
        0. Verificar policies del CoE: si hay alguna violación que bloquea
           la generación (ej. client_name o sow_id vacíos), abortar antes de
           gastar tokens de AI. Esta es la fuente única de verdad para reglas
           duras (ver `test_plan_policies.py`).
        1. Si `use_ai_for_prose=True`, generar prosa con OpenAI para los campos
           narrativos VACÍOS. Cada llamada cuenta contra la cuota mensual.
        2. Sustituir todos los placeholders `{{...}}` por su valor (del wizard
           o del paso 1, lo que aplique). Acumular pending para los vacíos.
        3. Persistir.
        """
        wizard = TestPlanWizardData(**plan.wizard_data)

        # Paso 0: gate determinístico de policies.
        violations = evaluate_policies(wizard)
        if has_blocking(violations):
            blocking_ids = [v.rule_id for v in violations if v.blocks_generation]
            logger.info(
                "[test_plan] generate bloqueado por policies plan_id=%s rules=%s",
                plan.id, blocking_ids,
            )
            raise PolicyViolationsBlock(violations)

        rendered = _TEMPLATE_FILE.read_text(encoding="utf-8")
        ai_prose: dict[str, str] = {}

        # Paso 1: AI para campos narrativos vacíos.
        if use_ai_for_prose:
            project_context = (
                plan.project.description
                if plan.project and plan.project.description
                else None
            )
            for field in _PROSE_FIELDS:
                if getattr(wizard, field):
                    continue  # el QA ya escribió algo; respetar
                try:
                    self._usage.ensure_within_budget(user)
                    prose, usage = await self._prose.generate_prose(
                        field, user_input="", project_context=project_context,
                    )
                    self._usage.record(user.id, usage)
                    ai_prose[field] = prose
                    logger.info(
                        "[test_plan] AI prose plan_id=%s field=%s tokens=%d cost=$%.6f",
                        plan.id, field, usage.tokens_in + usage.tokens_out, usage.cost_usd,
                    )
                except Exception as e:
                    # No tirar la generación entera; el campo queda como [[PENDIENTE]].
                    logger.warning(
                        "[test_plan] AI prose falló plan_id=%s field=%s: %s — quedo pendiente",
                        plan.id, field, e,
                    )

        # Paso 2: reemplazar todos los placeholders.
        pending_fields: list[str] = []
        for field, ph_name in WIZARD_TO_PLACEHOLDER.items():
            value = ai_prose.get(field) or getattr(wizard, field)
            replacement = _resolve_value(field, value, pending_fields)
            rendered = rendered.replace("{{" + ph_name + "}}", replacement)

        # Salvaguarda: cualquier placeholder no mapeado se convierte en pendiente.
        # (Nunca debería entrar acá si validate_template_schema_sync pasó.)
        def _to_pending(match: re.Match) -> str:
            ph = match.group(1)
            pending_fields.append(ph)
            return f"[[PENDIENTE: {ph}]]"

        rendered = _PLACEHOLDER_RE.sub(_to_pending, rendered)

        # Paso 3: persistir.
        unique_pending = sorted(set(pending_fields))
        return self._repo.mark_generated(plan, rendered, unique_pending)

    # ── Asistente puntual (botón "✨ Generar con AI" en el wizard) ─────────

    async def assist_field(
        self,
        user: User,
        field: str,
        user_input: str,
        project_context: Optional[str] = None,
        language: str = 'es',
    ) -> str:
        """Devuelve texto generado por OpenAI sin tocar BD del test plan."""
        if field not in _PROSE_FIELDS:
            raise ValueError(f"field debe ser uno de {sorted(_PROSE_FIELDS)}")
        self._usage.ensure_within_budget(user)
        text, usage = await self._prose.generate_prose(field, user_input, project_context, language=language)
        self._usage.record(user.id, usage)
        logger.info(
            "[test_plan] assist_field user_id=%s field=%s tokens=%d cost=$%.6f",
            user.id, field, usage.tokens_in + usage.tokens_out, usage.cost_usd,
        )
        return text


# ── Helpers de descarga ───────────────────────────────────────────────────────

def filename_for_plan(plan: TestPlan) -> str:
    """Convención: <slug-cliente>-<YYYY-MM-DD>.md (ver propuesta-1 output-naming.mdc)."""
    slug = re.sub(r"[^a-z0-9]+", "-", plan.client_name.lower()).strip("-") or "cliente"
    date_src = plan.generated_at or plan.created_at or datetime.utcnow()
    return f"{slug}-{date_src.strftime('%Y-%m-%d')}.md"
