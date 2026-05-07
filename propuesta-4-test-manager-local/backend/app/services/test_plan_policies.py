from __future__ import annotations
"""
Policy engine determinístico para Test Plans.

Reglas estrictas que el QA NO puede negociar con el Coach. El motor evalúa
todas las políticas sobre `TestPlanWizardData` y devuelve `Violation`s; el
service las convierte en `CoachAction` (kind="block" o "warn") que el frontend
muestra como banner persistente.

Cada `Policy` es una clase con `rule_id`, `severity`, `blocks_generation` y un
método `evaluate(w) -> Optional[Violation]`. Para agregar una nueva regla:
1. Define la clase con esos 4 atributos.
2. Agrégala al `POLICIES` registry al final del archivo.

NO se llama al LLM acá: estas son reglas de código duras. Esto evita que el
Coach "aluciné" reglas de cumplimiento (ej. inventar que SOW debe empezar con
"SF-" cuando no es cierto).
"""
import logging
import re
from dataclasses import dataclass
from typing import Optional, Protocol

from ..schemas import TestPlanWizardData

logger = logging.getLogger(__name__)


@dataclass
class Violation:
    """Resultado de una política violada."""
    rule_id: str
    severity: str           # "error" | "warn" | "info"
    field: Optional[str]    # nombre del campo en TestPlanWizardData (o None si es global)
    message: str            # texto que ve el QA
    blocks_generation: bool
    fix_suggestion: Optional[str] = None


class Policy(Protocol):
    rule_id: str
    severity: str
    blocks_generation: bool

    def evaluate(self, w: TestPlanWizardData) -> Optional[Violation]:
        ...


# ── Policies concretas ───────────────────────────────────────────────────────

class _RequiredClientName:
    rule_id = "required_client_name"
    severity = "error"
    blocks_generation = True

    def evaluate(self, w: TestPlanWizardData) -> Optional[Violation]:
        if not w.client_name or not w.client_name.strip():
            return Violation(
                rule_id=self.rule_id, severity=self.severity, field="client_name",
                message="Falta el nombre del cliente. Es obligatorio para portada y confidencialidad.",
                blocks_generation=True,
                fix_suggestion="Dime el nombre exacto del cliente (como debe aparecer en portada).",
            )
        return None


class _RequiredSowId:
    rule_id = "required_sow_id"
    severity = "error"
    blocks_generation = True

    def evaluate(self, w: TestPlanWizardData) -> Optional[Violation]:
        if not w.sow_id or not w.sow_id.strip():
            return Violation(
                rule_id=self.rule_id, severity=self.severity, field="sow_id",
                message="Falta el SOW ID. El plan no puede generarse sin referencia al contrato.",
                blocks_generation=True,
                fix_suggestion="Pega el ID del SOW tal como lo tienes en el documento de origen.",
            )
        return None


class _SowIdFormat:
    """Hint blando — no bloquea, solo sugiere normalizar formato común."""
    rule_id = "sow_id_format"
    severity = "warn"
    blocks_generation = False
    _pattern = re.compile(r"^[A-Z0-9][A-Z0-9\-_/]{2,}$")

    def evaluate(self, w: TestPlanWizardData) -> Optional[Violation]:
        sow = (w.sow_id or "").strip()
        if not sow:
            return None  # ya cubierto por _RequiredSowId
        if not self._pattern.match(sow.upper()):
            return Violation(
                rule_id=self.rule_id, severity=self.severity, field="sow_id",
                message=f"El SOW ID '{sow}' tiene un formato inusual (esperado: alfanumérico con guiones).",
                blocks_generation=False,
                fix_suggestion="Verifica si está bien copiado.",
            )
        return None


class _SprintWeeksInRange:
    rule_id = "sprint_weeks_in_range"
    severity = "error"
    blocks_generation = True

    def evaluate(self, w: TestPlanWizardData) -> Optional[Violation]:
        try:
            wk = int(str(w.sprint_weeks).strip())
        except (ValueError, AttributeError):
            return Violation(
                rule_id=self.rule_id, severity=self.severity, field="sprint_weeks",
                message=f"sprint_weeks ('{w.sprint_weeks}') debe ser un entero entre 1 y 4.",
                blocks_generation=True,
                fix_suggestion="Usa 2 si no estás seguro (lo más común en Salesforce CoE).",
            )
        if wk < 1 or wk > 4:
            return Violation(
                rule_id=self.rule_id, severity=self.severity, field="sprint_weeks",
                message=f"sprint_weeks={wk} fuera de rango. Debe ser 1-4 semanas.",
                blocks_generation=True,
                fix_suggestion="Usa 2 si no estás seguro.",
            )
        return None


class _RiskHighHighNeedsMitigation:
    rule_id = "risk_high_high_needs_mitigation"
    severity = "error"
    blocks_generation = True

    def evaluate(self, w: TestPlanWizardData) -> Optional[Violation]:
        bad = []
        for r in (w.extra_risks or []):
            prob = (r.probability or "").strip().lower()
            imp = (r.impact or "").strip().lower()
            if prob == "alto" and imp == "alto" and not (r.mitigation or "").strip():
                bad.append(r.code or "?")
        if bad:
            return Violation(
                rule_id=self.rule_id, severity=self.severity, field="extra_risks",
                message=f"Riesgos {', '.join(bad)} con probabilidad/impacto Alto/Alto sin mitigación. Política CoE: requiere plan de mitigación explícito.",
                blocks_generation=True,
                fix_suggestion="Agrega una mitigación concreta (qué se hará si ocurre) o baja la severidad si ya no aplica.",
            )
        return None


class _UniqueAssumptionCodes:
    rule_id = "unique_assumption_codes"
    severity = "error"
    blocks_generation = True

    def evaluate(self, w: TestPlanWizardData) -> Optional[Violation]:
        codes = [(a.code or "").strip().upper() for a in (w.extra_assumptions or [])]
        codes = [c for c in codes if c]
        seen = set()
        dup = set()
        for c in codes:
            if c in seen:
                dup.add(c)
            seen.add(c)
        if dup:
            return Violation(
                rule_id=self.rule_id, severity=self.severity, field="extra_assumptions",
                message=f"Códigos de suposición duplicados: {', '.join(sorted(dup))}.",
                blocks_generation=True,
                fix_suggestion="Renumera (A6, A7, A8...) o elimina la duplicada.",
            )
        return None


class _UniqueRiskCodes:
    rule_id = "unique_risk_codes"
    severity = "error"
    blocks_generation = True

    def evaluate(self, w: TestPlanWizardData) -> Optional[Violation]:
        codes = [(r.code or "").strip() for r in (w.extra_risks or [])]
        codes = [c for c in codes if c]
        seen = set()
        dup = set()
        for c in codes:
            if c in seen:
                dup.add(c)
            seen.add(c)
        if dup:
            return Violation(
                rule_id=self.rule_id, severity=self.severity, field="extra_risks",
                message=f"Códigos de riesgo duplicados: {', '.join(sorted(dup))}.",
                blocks_generation=True,
                fix_suggestion="Renumera (6, 7, 8...) o elimina el duplicado.",
            )
        return None


class _UniqueApproverNames:
    rule_id = "unique_approver_names"
    severity = "error"
    blocks_generation = True

    def evaluate(self, w: TestPlanWizardData) -> Optional[Violation]:
        names = [(a.name or "").strip().lower() for a in (w.approvals or [])]
        names = [n for n in names if n]
        seen = set()
        dup = set()
        for n in names:
            if n in seen:
                dup.add(n)
            seen.add(n)
        if dup:
            return Violation(
                rule_id=self.rule_id, severity=self.severity, field="approvals",
                message=f"Aprobadores duplicados: {', '.join(sorted(dup))}.",
                blocks_generation=True,
                fix_suggestion="Cada persona aprueba en UN solo rol. Si una persona tiene 2 roles, elige el principal.",
            )
        return None


class _ApprovalsAtLeastOne:
    rule_id = "approvals_at_least_one"
    severity = "warn"  # warn, no bloquea (puede generarse con [[PENDIENTE]])
    blocks_generation = False

    def evaluate(self, w: TestPlanWizardData) -> Optional[Violation]:
        if not w.approvals:
            return Violation(
                rule_id=self.rule_id, severity=self.severity, field="approvals",
                message="No has agregado aprobadores. El plan se generará con [[PENDIENTE: APPROVALS]].",
                blocks_generation=False,
                fix_suggestion="Agrega al menos 1 (típicamente PM, Product Owner y QA Lead).",
            )
        return None


class _VersionHistoryPresent:
    rule_id = "version_history_present"
    severity = "warn"
    blocks_generation = False

    def evaluate(self, w: TestPlanWizardData) -> Optional[Violation]:
        if not w.version_history:
            return Violation(
                rule_id=self.rule_id, severity=self.severity, field="version_history",
                message="No hay historial de versiones. Suele incluirse al menos la v1.0 inicial.",
                blocks_generation=False,
                fix_suggestion=f"Agrega la v{w.doc_version} con la fecha de hoy y tu nombre como autor.",
            )
        return None


class _PlaceholderInRealField:
    """
    Detecta valores placeholder ("pendiente", "tbd", "n/a", "por definir", etc.)
    en campos string que deberían tener contenido real.

    Por qué importa: el renderer convierte string vacío → `[[PENDIENTE: <NOMBRE>]]`
    en el .md final (formato canónico para llenar después en Google Docs). Si el
    QA escribe la palabra "pendiente" literal, el .md saldrá con la palabra cruda
    en vez del marcador esperado, lo que ensucia el documento entregable.

    Comportamiento: WARN (no bloquea). El QA puede confirmar que es genuinamente
    desconocido (y entonces conviene vaciar el campo para que aparezca el marker)
    o reemplazar por el valor real.
    """
    rule_id = "placeholder_in_real_field"
    severity = "warn"
    blocks_generation = False
    # Lista en lower-case; el match es case-insensitive y trim. Strings cortas
    # comunes que el QA escribe cuando no sabe pero no quiere dejar vacío.
    _placeholders = {
        "pendiente", "pendientes", "tbd", "to be defined", "to do", "todo",
        "n/a", "na", "no aplica",
        "por definir", "x definir", "a definir",
        "?", "??", "???", "x", "xx", "xxx",
        "no se", "no sé", "no se sabe", "no aplica aún", "no aplica aun",
        "ninguno", "ninguna", "nada",
    }
    # Campos string donde un placeholder es señal de que el QA quiso saltearse.
    # Excluimos los que tienen default oficial (test_management_tool=JIRA, etc.)
    # porque ahí el placeholder no aparece naturalmente. También excluimos
    # confidentiality_year, doc_version (numéricos/cortos por naturaleza).
    _checked_fields = (
        "client_name",
        "sow_id",
        "business_goal",
        "scope_out",
        "project_roadmap",
        "user_story_lifecycle",
        "salesforce_capacity",
        "env_dev_name",
        "env_qa_name",
        "env_sit_name",
        "env_uat_name",
    )

    def evaluate(self, w: TestPlanWizardData) -> Optional[Violation]:
        hits: list[str] = []
        for f in self._checked_fields:
            raw = getattr(w, f, "") or ""
            v = raw.strip().lower()
            if v and v in self._placeholders:
                hits.append(f)
        if not hits:
            return None
        return Violation(
            rule_id=self.rule_id,
            severity=self.severity,
            field=hits[0],
            message=(
                f"Valores placeholder en {len(hits)} campo(s): {', '.join(hits)}. "
                f"En el .md final aparecerá la palabra literal en vez del marcador "
                f"`[[PENDIENTE: <NOMBRE>]]` que se llena después en Google Docs."
            ),
            blocks_generation=False,
            fix_suggestion=(
                "Reemplazá por el valor real, o vacía el campo desde el wizard "
                "formulario para que se renderice como [[PENDIENTE: ...]] (el QA "
                "luego lo completa en Google Docs)."
            ),
        )


# ── Registry ─────────────────────────────────────────────────────────────────
# El orden importa solo para presentación (los warns van al final, errors arriba).

POLICIES: list[Policy] = [
    _RequiredClientName(),
    _RequiredSowId(),
    _SprintWeeksInRange(),
    _RiskHighHighNeedsMitigation(),
    _UniqueAssumptionCodes(),
    _UniqueRiskCodes(),
    _UniqueApproverNames(),
    _SowIdFormat(),
    _ApprovalsAtLeastOne(),
    _VersionHistoryPresent(),
    _PlaceholderInRealField(),
]


def evaluate_all(w: TestPlanWizardData) -> list[Violation]:
    """
    Corre todas las políticas y devuelve la lista de violaciones.
    Si una policy lanza excepción, la salta y loggea (resiliencia: nunca tirar
    el coach abajo por una regla mala).
    """
    out: list[Violation] = []
    for p in POLICIES:
        try:
            v = p.evaluate(w)
            if v is not None:
                out.append(v)
        except Exception as e:
            logger.warning(
                "policy %s falló al evaluar: %s", getattr(p, "rule_id", "?"), e,
            )
    # Sort: errors-blocking primero, errors no-blocking, warns, infos
    sev_order = {"error": 0, "warn": 1, "info": 2}
    out.sort(key=lambda v: (sev_order.get(v.severity, 9), 0 if v.blocks_generation else 1))
    return out


def has_blocking(violations: list[Violation]) -> bool:
    return any(v.blocks_generation for v in violations)


class PolicyViolationsBlock(Exception):
    """
    Excepción de dominio: el plan tiene violaciones que bloquean la generación.

    Se lanza desde `TestPlanService.generate` cuando `has_blocking(...)` es True.
    La route HTTP la captura y la traduce a HTTP 422 con el detalle estructurado
    de las violaciones, manteniendo la separación de capas (el service no sabe
    de HTTP).
    """

    def __init__(self, violations: list[Violation]):
        self.violations = violations
        blocking = [v for v in violations if v.blocks_generation]
        super().__init__(
            f"{len(blocking)} blocking policy violations: "
            f"{', '.join(v.rule_id for v in blocking)}"
        )
