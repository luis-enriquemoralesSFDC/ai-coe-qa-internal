from __future__ import annotations
"""
Importa bugs desde CSV (Jira, Azure DevOps, o formato genérico).
Intenta cruzar automáticamente cada bug con una UserStory del proyecto
mediante external_id, case_id o similitud de título.
"""
import csv
import io
import logging
import difflib
from datetime import date
from ...models import Bug, BugReport, UserStory

logger = logging.getLogger(__name__)

# ── Mapeo flexible de columnas ────────────────────────────────────────────────
# Cada clave interna → lista de posibles nombres de columna en el CSV
_COL_MAP: dict[str, list[str]] = {
    "bug_id":            ["Issue key", "ID", "Bug ID", "Defect ID", "Key", "Issue Key"],
    "title":             ["Summary", "Title", "Work Item Title", "Título", "Description"],
    "severity":          ["Priority", "Severity", "Prioridad", "Severidad"],
    "status":            ["Status", "State", "Estado"],
    "environment":       ["Environment", "Environments", "Ambiente", "Entorno", "Area Path"],
    "sprint_name":       ["Sprint", "Sprint Name", "Iteration Path", "Sprint/Iteration"],
    "external_story_id": ["Epic Link", "Story Link", "Parent", "Linked Issues", "Epic/Story Link", "HU", "User Story"],
    "reporter":          ["Reporter", "Created By", "Reportado por"],
    "assignee":          ["Assignee", "Assigned To", "Asignado a"],
    "found_date":        ["Created", "Created Date", "Fecha creación", "Found Date"],
    "resolved_date":     ["Resolved", "Resolved Date", "Fecha resolución", "Closed Date"],
    "linked_case_id":    ["Test Case", "Test Case ID", "TC Link", "Caso de Prueba"],
}

# Palabras clave que indican estado "rechazado"
_REJECTED_STATUSES = {"rejected", "won't fix", "wont fix", "invalid", "duplicate",
                      "rechazado", "no aplica", "no reproducible", "cerrado sin acción"}

# Mapeo de prioridades/severidades a valores internos
_SEVERITY_MAP = {
    "blocker": "critical", "critical": "critical", "crítico": "critical", "critico": "critical", "p1": "critical",
    "major": "high",    "high": "high",      "alto": "high",    "alta": "high",    "p2": "high",
    "minor": "medium",  "medium": "medium",  "medio": "medium", "media": "medium", "p3": "medium", "normal": "medium",
    "trivial": "low",   "low": "low",        "bajo": "low",     "baja": "low",     "p4": "low",
}

_ENV_MAP = {
    "qa": "qa", "testing": "qa", "test": "qa", "pruebas": "qa",
    "uat": "uat", "user acceptance": "uat", "aceptación": "uat", "aceptacion": "uat",
    "sit": "sit", "integration": "sit", "integración": "sit",
    "prod": "prod", "production": "prod", "producción": "prod", "produccion": "prod", "live": "prod",
}


def _pick(row: dict, key: str, default: str = "") -> str:
    """Busca el valor de un campo usando los alias definidos en _COL_MAP."""
    for alias in _COL_MAP.get(key, []):
        if alias in row and row[alias].strip():
            return row[alias].strip()
    return default


def _parse_date(raw: str) -> date | None:
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S", "%d-%m-%Y"):
        try:
            from datetime import datetime
            return datetime.strptime(raw[:10], fmt[:10]).date()
        except ValueError:
            continue
    return None


def _normalize_severity(raw: str) -> str:
    return _SEVERITY_MAP.get(raw.lower().strip(), "medium")


def _normalize_status(raw: str) -> str:
    low = raw.lower().strip()
    if low in _REJECTED_STATUSES:
        return "rejected"
    if low in {"resolved", "done", "closed", "fixed", "resuelto", "cerrado", "completado"}:
        return "resolved"
    if low in {"in progress", "en progreso", "in development", "in review"}:
        return "in_progress"
    return "open"


def _normalize_environment(raw: str) -> str:
    parts = raw.lower().replace("\\", "/").split("/")
    for part in reversed(parts):
        part = part.strip()
        for key, val in _ENV_MAP.items():
            if key in part:
                return val
    return "qa"


def _auto_link_story(
    external_story_id: str,
    stories: list[UserStory],
    story_by_external: dict[str, UserStory],
    title_for_fuzzy: str,
) -> int | None:
    """
    Intenta vincular un bug a una UserStory del proyecto.
    Orden de prioridad:
    1. external_id exacto
    2. external_id contenido en el campo
    3. Fuzzy match por título (≥ 80%)
    """
    if external_story_id:
        # Exacto
        if external_story_id in story_by_external:
            return story_by_external[external_story_id].id
        # Parcial: el external_story_id puede ser "PROJ-12 - Título"
        for eid, story in story_by_external.items():
            if eid and eid in external_story_id:
                return story.id

    # Fuzzy match por título
    if title_for_fuzzy and stories:
        story_titles = [s.title for s in stories]
        matches = difflib.get_close_matches(title_for_fuzzy, story_titles, n=1, cutoff=0.80)
        if matches:
            for s in stories:
                if s.title == matches[0]:
                    return s.id

    return None


def parse_csv_bugs(
    content: bytes,
    report: BugReport,
    stories: list[UserStory],
) -> list[Bug]:
    """
    Parsea el contenido CSV y retorna una lista de Bug (sin guardar en BD).
    Intenta cruzar automáticamente cada bug con una historia del proyecto.
    """
    story_by_external: dict[str, UserStory] = {
        s.external_id: s for s in stories if s.external_id
    }

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1", errors="replace")

    reader = csv.DictReader(io.StringIO(text))
    bugs: list[Bug] = []
    skipped = 0

    for i, row in enumerate(reader):
        title = _pick(row, "title")
        if not title:
            skipped += 1
            continue

        external_story_id = _pick(row, "external_story_id")
        story_id = _auto_link_story(external_story_id, stories, story_by_external, title)

        raw_env = _pick(row, "environment") or report.sprint_name or "qa"
        # Azure: "Area Path" puede ser "Project\QA\UAT" — tomar último segmento
        env = _normalize_environment(raw_env)

        sprint = _pick(row, "sprint_name") or report.sprint_name

        bugs.append(Bug(
            report_id=report.id,
            bug_id=_pick(row, "bug_id") or f"BUG-{i+1}",
            title=title[:500],
            severity=_normalize_severity(_pick(row, "severity")),
            status=_normalize_status(_pick(row, "status")),
            environment=env,
            sprint_name=sprint,
            story_id=story_id,
            linked_case_id=_pick(row, "linked_case_id") or None,
            reporter=_pick(row, "reporter") or None,
            assignee=_pick(row, "assignee") or None,
            found_date=_parse_date(_pick(row, "found_date")),
            resolved_date=_parse_date(_pick(row, "resolved_date")),
        ))

    logger.info("CSV parseado: %d bugs importados, %d filas saltadas", len(bugs), skipped)
    return bugs
