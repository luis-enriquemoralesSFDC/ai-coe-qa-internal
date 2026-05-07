from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List, Any, Dict, Literal
from datetime import datetime


# Solo se permiten cuentas con este dominio EXACTO para registrarse.
# El check es case-insensitive y no acepta subdominios ni variantes
# (ej: salesforce.org, salesforce.com.evil.com → rechazados).
_ALLOWED_EMAIL_DOMAIN = "salesforce.com"


# ── Auth ────────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def email_must_be_salesforce(cls, v: str) -> str:
        domain = v.rsplit("@", 1)[-1].lower()
        if domain != _ALLOWED_EMAIL_DOMAIN:
            raise ValueError(
                f"Solo se permiten correos @{_ALLOWED_EMAIL_DOMAIN} para registrarse."
            )
        return v.lower()


class UserLogin(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.lower()


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    is_admin: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut


# ── Usage / Quota / Admin ────────────────────────────────────────────────────
class UsageSummary(BaseModel):
    """Resumen del usuario para mostrar en su dashboard."""
    user_id: int
    period: str  # "2026-04"
    cost_usd: float
    tokens_in: int
    tokens_out: int
    calls: int
    budget_usd: float
    remaining_usd: float
    bypass: bool  # True si el user es admin (sin límite)


class UserAdminOut(BaseModel):
    """Vista admin de un usuario, con su uso del mes actual."""
    id: int
    name: str
    email: str
    is_admin: bool
    created_at: datetime
    projects_count: int
    cost_usd_this_month: float
    calls_this_month: int

    class Config:
        from_attributes = True


class AdminUserUpdate(BaseModel):
    is_admin: Optional[bool] = None


class AiUsageRowOut(BaseModel):
    id: int
    user_id: int
    user_email: Optional[str] = None
    operation: str
    model: str
    tokens_in: int
    tokens_out: int
    cost_usd: float
    latency_ms: int
    created_at: datetime

    class Config:
        from_attributes = True


# ── Generación de test cases (con max_cases configurable por HU) ─────────────
class GenerateTestCasesRequest(BaseModel):
    """Body opcional para POST .../generate-test-cases.

    Si max_cases es None → la IA decide (3-5 típicos).
    Si es un número → la IA genera EXACTAMENTE esa cantidad (mínimo 1, máximo 30).
    """
    max_cases: Optional[int] = None

    @field_validator("max_cases")
    @classmethod
    def validate_range(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return None
        if v < 1 or v > 30:
            raise ValueError("max_cases debe estar entre 1 y 30")
        return v


# ── Story Review Agent (orquestador de 3 steps sobre una HU) ──────────────────
# Tipo de modo de generación cuando la HU ya tiene casos previos:
#  - "skip"    → no genera (default seguro: protege ediciones manuales del QA).
#  - "append"  → genera y suma encima (comportamiento legacy, preservado por compat).
#  - "replace" → borra los previos y genera nuevos (refresh limpio; PIERDE edits).
StoryReviewMode = Literal["skip", "append", "replace"]


class StoryReviewRequest(BaseModel):
    """Body opcional para POST .../agent/review.

    - max_cases: mismo rango que generate-test-cases (1-30 o None).
                 Si None, el agente aplica un cap default razonable (10) para
                 evitar que el LLM genere 30+ casos en un solo run.
    - force_invest: si True, re-corre INVEST aunque ya exista. Default False
                   (idempotente: reusa el análisis previo).
    - mode: política cuando la HU YA tiene casos. Default "skip" para evitar
            acumulación silenciosa y proteger ediciones manuales. Solo "replace"
            es destructivo (borra previos antes de generar). Validado por Literal:
            cualquier otro valor → 422.
    """
    max_cases: Optional[int] = None
    force_invest: bool = False
    mode: StoryReviewMode = "skip"

    @field_validator("max_cases")
    @classmethod
    def validate_range(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return None
        if v < 1 or v > 30:
            raise ValueError("max_cases debe estar entre 1 y 30")
        return v


class StoryReviewStep(BaseModel):
    """Un paso del flujo del agente. El frontend lo renderiza como item de timeline.

    Shape laxa (varios campos opcionales) porque cada `kind` produce metadata
    distinta. Esto es por diseño — alternativas como tagged unions explotaban
    la API surface sin valor real para el primer cut.
    """
    kind: str                        # invest_analysis | context_detection | generate_test_cases
    status: str                      # ok | skipped | error | quota_exceeded
    latency_ms: int

    # Campos opcionales por step (solo se llena el que aplica al kind)
    score: Optional[float] = None             # invest_analysis
    reason: Optional[str] = None              # invest_analysis (si skipped) | generate_test_cases (si skipped)
    archetypes: Optional[List[str]] = None    # context_detection
    baseline_count: Optional[int] = None      # context_detection
    test_cases_created: Optional[int] = None  # generate_test_cases
    with_context: Optional[bool] = None       # generate_test_cases
    archetypes_used: Optional[int] = None     # generate_test_cases
    baseline_used: Optional[int] = None       # generate_test_cases
    invest_used: Optional[bool] = None        # generate_test_cases
    existing_cases_count: Optional[int] = None  # generate_test_cases (cuántos había antes; útil para mostrar al QA)
    deleted_count: Optional[int] = None       # generate_test_cases (si mode=replace)
    mode: Optional[str] = None                # generate_test_cases (skip|append|replace)
    error_class: Optional[str] = None         # cualquier kind con status=error


class StoryReviewResponse(BaseModel):
    """Respuesta de POST .../agent/review.

    NO incluye PII (title, description, AC). El frontend re-fetch la HU si
    necesita esos campos. Esto reduce blast radius en logs/middlewares.
    """
    story_id: int
    project_id: int
    last_review_at: str              # ISO timestamp UTC
    steps: List[StoryReviewStep]
    test_cases_created: int


# ── Project Chat Assistant (Q&A contextualizado) ─────────────────────────────
# Cap del contenido del mensaje: 2000 chars es generoso para una pregunta de
# QA pero protege contra payloads enormes (cost amplification + prompt bloat).
_MAX_CHAT_MESSAGE_CHARS = 2000


class ProjectChatMessageOut(BaseModel):
    """Un mensaje del chat tal como lo devuelve el backend al frontend."""
    id: int
    project_id: int
    turn_index: int
    role: str            # "user" | "assistant"
    content: str
    story_id: Optional[int] = None  # si el mensaje fue dentro de una HU específica
    created_at: str

    class Config:
        from_attributes = True


class ProjectChatSendRequest(BaseModel):
    """Body de POST /projects/{pid}/chat/messages.

    - message: texto del QA. Cap 2000 chars (validado).
    - story_id: opcional, si el QA está dentro de una HU específica
                (StoryPage). Permite enriquecer el contexto del LLM con el
                detalle de esa HU. Validamos en el service que la HU pertenezca
                al proyecto (no se confía en el client).
    """
    message: str
    story_id: Optional[int] = None

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("El mensaje no puede estar vacío")
        if len(v) > _MAX_CHAT_MESSAGE_CHARS:
            raise ValueError(
                f"El mensaje supera el límite de {_MAX_CHAT_MESSAGE_CHARS} caracteres"
            )
        return v

    @field_validator("story_id")
    @classmethod
    def validate_story_id(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return None
        if v < 1:
            raise ValueError("story_id debe ser un entero positivo")
        return v


class ProjectChatSendResponse(BaseModel):
    """Respuesta sincronica: ambos mensajes (user + assistant) en un solo call.

    Esto simplifica al frontend: hace una sola request y obtiene ambos para
    pintar la conversación sin necesitar otra GET inmediata.
    """
    user_message: ProjectChatMessageOut
    assistant_message: ProjectChatMessageOut


# ── Projects ─────────────────────────────────────────────────────────────────
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: datetime
    stories_count: Optional[int] = 0
    test_cases_count: Optional[int] = 0

    class Config:
        from_attributes = True


# ── User Stories ──────────────────────────────────────────────────────────────
class InvestCriterion(BaseModel):
    score: float
    feedback: str
    suggestions: List[str] = []


class InvestAnalysis(BaseModel):
    independent: InvestCriterion
    negotiable: InvestCriterion
    valuable: InvestCriterion
    estimable: InvestCriterion
    small: InvestCriterion
    testable: InvestCriterion
    overall_score: float
    overall_feedback: str


class UserStoryCreate(BaseModel):
    title: str
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    external_id: Optional[str] = None
    source: Optional[str] = "manual"


class UserStoryUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None


class UserStoryOut(BaseModel):
    id: int
    project_id: int
    external_id: Optional[str]
    title: str
    description: Optional[str]
    acceptance_criteria: Optional[str]
    source: str
    invest_score: Optional[float]
    invest_analysis: Optional[Any]
    # Story Review Agent (opcionales — null hasta que se ejecute el agente)
    archetypes: Optional[List[str]] = None
    edge_cases_baseline: Optional[List[Any]] = None
    last_review_at: Optional[datetime] = None
    created_at: datetime
    test_cases_count: Optional[int] = 0

    class Config:
        from_attributes = True


# ── Test Cases ────────────────────────────────────────────────────────────────
class TestStep(BaseModel):
    order: int
    action: str
    expected: Optional[str] = None


class TestCaseCreate(BaseModel):
    title: str
    precondition: Optional[str] = None
    steps: Optional[List[TestStep]] = []
    expected_result: Optional[str] = None
    actual_result: Optional[str] = None
    status: Optional[str] = "pending"
    priority: Optional[str] = "medium"
    test_type: Optional[str] = "functional"
    notes: Optional[str] = None


class TestCaseUpdate(BaseModel):
    title: Optional[str] = None
    precondition: Optional[str] = None
    steps: Optional[List[Any]] = None
    expected_result: Optional[str] = None
    actual_result: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    test_type: Optional[str] = None
    notes: Optional[str] = None


class TestCaseOut(BaseModel):
    id: int
    story_id: int
    case_id: Optional[str]
    title: str
    precondition: Optional[str]
    steps: Optional[Any]
    expected_result: Optional[str]
    actual_result: Optional[str]
    status: str
    priority: str
    test_type: Optional[str]
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Import ────────────────────────────────────────────────────────────────────
class ImportCSVStory(BaseModel):
    title: str
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    external_id: Optional[str] = None


class BulkImportRequest(BaseModel):
    stories: List[ImportCSVStory]
    source: str = "csv"


class BatchGenerateRequest(BaseModel):
    """Body para POST /projects/{id}/stories/generate-batch.

    Validaciones declarativas (devuelven 422 antes de tocar el handler):
    - story_ids no puede estar vacío.
    - len(story_ids) no puede superar settings.max_batch_size (configurable),
      protegiendo el max_tokens del modelo.
    - max_cases, si viene, debe estar entre 1 y 30 (mismo rango que el single).
    """
    story_ids: List[int]
    max_cases: Optional[int] = None

    @field_validator("story_ids")
    @classmethod
    def validate_batch_size(cls, v: List[int]) -> List[int]:
        if not v:
            raise ValueError("Debes enviar al menos una historia")
        # Lazy import: evita circular (schemas <-> config en arranque).
        from .config import settings
        if len(v) > settings.max_batch_size:
            raise ValueError(
                f"Maximo {settings.max_batch_size} historias por lote "
                f"(recibidas {len(v)}). Divide el lote en partes."
            )
        return v

    @field_validator("max_cases")
    @classmethod
    def validate_max_cases(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return None
        if v < 1 or v > 30:
            raise ValueError("max_cases debe estar entre 1 y 30")
        return v


# ── KPIs / Bugs ───────────────────────────────────────────────────────────────

class BugCreate(BaseModel):
    bug_id: Optional[str] = None
    title: str
    severity: Optional[str] = "medium"
    status: Optional[str] = "open"
    environment: Optional[str] = "qa"
    sprint_name: Optional[str] = None
    story_id: Optional[int] = None
    linked_case_id: Optional[str] = None
    reporter: Optional[str] = None
    assignee: Optional[str] = None
    found_date: Optional[str] = None
    resolved_date: Optional[str] = None


class BugOut(BaseModel):
    id: int
    report_id: int
    bug_id: Optional[str]
    title: str
    severity: str
    status: str
    environment: str
    sprint_name: Optional[str]
    story_id: Optional[int]
    linked_case_id: Optional[str]
    reporter: Optional[str]
    assignee: Optional[str]
    found_date: Optional[Any]
    resolved_date: Optional[Any]
    created_at: datetime

    class Config:
        from_attributes = True


class BugReportOut(BaseModel):
    id: int
    project_id: int
    sprint_name: Optional[str]
    source: str
    filename: Optional[str]
    created_at: datetime
    bugs_count: Optional[int] = 0

    class Config:
        from_attributes = True


class BugLinkUpdate(BaseModel):
    story_id: Optional[int] = None
    linked_case_id: Optional[str] = None


class KpiSummaryOut(BaseModel):
    total_bugs: int
    open_bugs: int
    resolved_bugs: int
    rejected_bugs: int
    bugs_qa: int
    bugs_uat: int
    bugs_sit: int
    bugs_prod: int
    total_stories: int
    total_test_cases: int
    pass_test_cases: int
    fail_test_cases: int
    fpy_percent: float
    tc_effectiveness: float
    critical_bugs: int
    high_bugs: int
    medium_bugs: int
    low_bugs: int


class SeveritySprintRow(BaseModel):
    sprint: str
    severity: str
    count: int


class FpySprintRow(BaseModel):
    sprint: str
    total: int
    passed: int
    fpy_percent: float


# ── Test Plan Generator (Propuesta 1 portada a QA Hub) ─────────────────────────
# Los schemas de abajo cubren los 23 placeholders de
# `app/templates/test_plan/qa_plan_master.md`. Cualquier cambio en la plantilla
# debe reflejarse en TestPlanWizardData o el service lanza RuntimeError al
# arrancar. Ver `app/templates/test_plan/README.md`.

class VersionHistoryRow(BaseModel):
    version: str               # ej "1.0"
    date: str                  # DD/MM/YYYY
    description: str
    author: str


class DeploymentFrequencyRow(BaseModel):
    """Una fila de la tabla de frecuencia de despliegues."""
    responsible: str           # ej "Salesforce DEV"
    from_env: str              # ej "DEV01"
    to_env: str                # ej "QA"
    frequency: str             # ej "Cada desarrollo"


class AssumptionRow(BaseModel):
    """Suposición A6, A7, ... (extra al baseline A1-A5 que ya tiene la plantilla)."""
    code: str                  # "A6", "A7", ...
    description: str


class RiskRow(BaseModel):
    """Riesgo extra (numerado desde 6, ya que la plantilla trae 1-5 baseline)."""
    code: str                  # "6", "7", ...
    description: str
    probability: str           # Alto | Medio | Bajo
    impact: str                # Alto | Medio | Bajo
    mitigation: str


class DependencyRow(BaseModel):
    """Dependencia extra (la plantilla ya trae 3 baseline)."""
    description: str
    impact: str
    responsible: str


class ApprovalRow(BaseModel):
    name: str                  # nombre del aprobador
    company: str
    role: str                  # Project Manager | Product Owner | QA Lead | Business Sponsor | Otro
    date: Optional[str] = None  # DD/MM/YYYY o None (queda como [[PENDIENTE: Fecha de aprobación]])


class TestPlanWizardData(BaseModel):
    """
    Estructura completa que el wizard recolecta. Cada atributo mapea 1:1 a un
    placeholder `{{...}}` de la plantilla canónica.

    Cualquier campo no especificado por el QA queda como string vacío y el
    service lo convierte en `[[PENDIENTE: <NOMBRE>]]` al renderizar el .md.
    """

    # Bloque 0 - Identificación
    client_name: str                       # → {{CLIENT_NAME}}
    sow_id: str                            # → {{SOW_ID}}
    doc_version: str = "1.0"               # → {{DOC_VERSION}}
    confidentiality_year: str              # → {{CONFIDENTIALITY_YEAR}}
    test_management_tool: str = "JIRA"     # → {{TEST_MANAGEMENT_TOOL}}
    defect_management_tool: str = "Complemento de JIRA (Zephyr, Xray, etc.)"  # → {{DEFECT_MANAGEMENT_TOOL}}
    browsers: str = "Google Chrome"        # → {{BROWSERS}}

    # Bloque 1 - Historial de versiones
    version_history: List[VersionHistoryRow] = []   # → {{VERSION_HISTORY_ROWS}}

    # Bloque 2 - Objetivo de negocio
    business_goal: str = ""                # → {{BUSINESS_GOAL}}

    # Bloque 3 - Alcance
    scope_out: str = ""                    # → {{SCOPE_OUT}} (texto libre o bullets ya formateados)

    # Bloque 4 - Cronograma
    sprint_weeks: str = "2"                # → {{SPRINT_WEEKS}}
    project_roadmap: str = ""              # → {{PROJECT_ROADMAP}} (texto o vacío→pendiente)

    # Bloque 5 - Ambientes
    env_dev_name: str = "DEV"              # → {{ENV_DEV_NAME}}
    env_qa_name: str = "QA"                # → {{ENV_QA_NAME}}
    env_sit_name: str = "SIT"              # → {{ENV_SIT_NAME}}
    env_uat_name: str = "UAT"              # → {{ENV_UAT_NAME}}
    deployment_frequency: List[DeploymentFrequencyRow] = []  # → {{DEPLOYMENT_FREQUENCY_ROWS}}

    # Bloque 6 - Flujo de Historia de Usuario
    user_story_lifecycle: str = ""         # → {{USER_STORY_LIFECYCLE}}
    salesforce_capacity: str = ""          # → {{SALESFORCE_CAPACITY}}

    # Bloque 7 - Suposiciones extra
    extra_assumptions: List[AssumptionRow] = []  # → {{EXTRA_ASSUMPTIONS_ROWS}}

    # Bloque 8 - Riesgos y dependencias extra
    extra_risks: List[RiskRow] = []        # → {{EXTRA_RISKS_ROWS}}
    extra_dependencies: List[DependencyRow] = []  # → {{EXTRA_DEPENDENCIES_ROWS}}

    # Bloque 9 - Aprobación
    approvals: List[ApprovalRow] = []      # → {{APPROVALS_ROWS}}

    # Nota: client_name y sow_id NO se validan aquí intencionalmente.
    # La regla "obligatorio" vive en `services/test_plan_policies.py`
    # (_RequiredClientName, _RequiredSowId) y se evalúa al GENERAR el .md.
    # Esto permite drafts incompletos en el flujo conversacional del Coach
    # y respeta la docstring de esta clase: vacío → [[PENDIENTE: <NOMBRE>]].


class TestPlanCreate(BaseModel):
    """Crea un test plan en estado draft. El project_id viene del path."""
    wizard_data: TestPlanWizardData


class TestPlanUpdate(BaseModel):
    """Actualiza el wizard_data sin generar el .md."""
    wizard_data: TestPlanWizardData


class TestPlanGenerateRequest(BaseModel):
    """
    Genera (o regenera) el markdown_content a partir del wizard_data actual.

    `use_ai_for_prose=True` hace que OpenAI refine los campos de prosa narrativa
    (BUSINESS_GOAL, USER_STORY_LIFECYCLE, SALESFORCE_CAPACITY) y normalice
    SCOPE_OUT a bullets bien formateados. `False` es 100% determinista.
    """
    use_ai_for_prose: bool = True


class TestPlanListItem(BaseModel):
    """Versión light para el listing de test plans del proyecto."""
    id: int
    project_id: int
    client_name: str
    doc_version: str
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    generated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TestPlanOut(BaseModel):
    """Detalle completo de un test plan."""
    id: int
    project_id: int
    user_id: int
    client_name: str
    doc_version: str
    status: str
    wizard_data: TestPlanWizardData
    markdown_content: Optional[str] = None
    pending_fields: List[str] = []
    created_at: datetime
    updated_at: Optional[datetime] = None
    generated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AiAssistRequest(BaseModel):
    """
    Pide a OpenAI que genere/refine el contenido de UN solo placeholder de prosa.
    Útil para botones "✨ Generar con AI" en el wizard cuando el QA tiene poco
    contexto y quiere ayuda con la redacción.
    """
    field: str                             # business_goal | user_story_lifecycle | salesforce_capacity | scope_out
    user_input: str = ""                   # contexto/draft del QA
    project_context: Optional[str] = None  # opcional: descripción del proyecto

    @field_validator("field")
    @classmethod
    def valid_field(cls, v: str) -> str:
        allowed = {"business_goal", "user_story_lifecycle", "salesforce_capacity", "scope_out"}
        if v not in allowed:
            raise ValueError(f"field debe ser uno de {sorted(allowed)}")
        return v


class AiAssistResponse(BaseModel):
    field: str
    content: str


# ── Test Plan Coach (chat conversacional, sabor "como Cursor") ────────────────
# El Coach orquesta una entrevista guiada al QA usando el interview_guide del
# CoE. Cada turno del assistant emite texto + una lista de "acciones" tipadas
# que el frontend renderiza como widgets nativos (picklist, diff, block banner,
# etc.). Las imposiciones estrictas (kind="block") NO las decide el LLM: vienen
# del policy engine determinístico (`services/test_plan_policies.py`).

class CoachPicklistOption(BaseModel):
    value: str
    label: Optional[str] = None


class CoachPicklistField(BaseModel):
    """Una sola pregunta picklist dentro de un grupo (hasta 4 por turno)."""
    field: str                                   # nombre del wizard field destino
    label: str                                   # texto para el QA
    hint: Optional[str] = None
    options: List[CoachPicklistOption]
    current_value: Optional[str] = None


class CoachAction(BaseModel):
    """
    Action que el frontend renderiza como widget. Discriminada por `kind`.

    Para evitar definir 11 schemas distintos (uno por kind) y que el LLM tenga
    que elegir entre ellos, usamos un schema unión: solo los campos relevantes
    del kind correspondiente se llenan, el resto queda None. El frontend hace
    el switch.
    """
    kind: str                                    # ask_text|ask_picklist|confirm_value|confirm_bulk|suggest_replace|set_field|block|warn|summary|ready_to_generate|follow_up
    rationale: str = ""                          # por qué el coach hace esto
    severity: str = "info"                       # info|warn|error

    # Identificación del campo (cuando aplica)
    field: Optional[str] = None
    label: Optional[str] = None
    hint: Optional[str] = None

    # Valores (suggest_replace, set_field, confirm_value)
    current_value: Optional[Any] = None
    proposed_value: Optional[Any] = None

    # Picklists agrupadas (ask_picklist)
    picklist_fields: Optional[List[CoachPicklistField]] = None

    # Bulk confirm (confirm_bulk) — items extraidos de raw-data
    bulk_items: Optional[List[Dict[str, Any]]] = None

    # Resumen (summary)
    filled_fields: Optional[List[str]] = None
    pending_fields: Optional[List[str]] = None
    blocked_count: Optional[int] = None

    # Follow-up (pregunta dinámica con opciones rápidas)
    quick_options: Optional[List[str]] = None

    # Block (imposición estricta)
    rule_id: Optional[str] = None
    blocks_generation: bool = False
    fix_options: Optional[List[Dict[str, str]]] = None

    # Ready to generate
    use_ai_for_prose: Optional[bool] = None


class CoachStartRequest(BaseModel):
    """Body para POST /coach/start. project_context opcional para mejor prompt."""
    project_context: Optional[str] = None


class CoachTurnRequest(BaseModel):
    """
    Body para POST /coach/turn. El user puede mandar:
    - `text`: respuesta libre (a un ask_text o un follow_up sin opciones).
    - `picklist_answers`: respuestas a un ask_picklist (dict field→value).
    - `bulk_confirm`: True (acepta todos), False (rechaza), None (no aplica).
    - `accept_suggestion_for`: field cuyo suggest_replace se acepta.
    - `apply_action_index`: índice de la action a aplicar (alternativa).
    """
    text: Optional[str] = None
    picklist_answers: Optional[Dict[str, str]] = None
    bulk_confirm: Optional[bool] = None
    accept_suggestion_for: Optional[str] = None
    reject_suggestion_for: Optional[str] = None


class CoachMessageOut(BaseModel):
    """Mensaje persistido (un turno). El historial es lista de estos."""
    id: int
    plan_id: int
    turn_index: int
    role: str                                    # user | assistant | system
    content: str
    actions: List[CoachAction] = []
    created_at: datetime

    class Config:
        from_attributes = True


class CoachTurnResponse(BaseModel):
    """
    Respuesta de POST /coach/turn. Incluye:
    - El mensaje del assistant recién emitido (con sus actions).
    - El wizard_data actual (puede haber cambiado por set_field).
    - Las violaciones activas del policy engine (para que el frontend
      muestre el banner de bloqueos sin esperar otro round-trip).
    - `can_generate`: shortcut booleano que respeta los bloqueos.
    """
    message: CoachMessageOut
    wizard_data: TestPlanWizardData
    violations: List[CoachAction] = []
    can_generate: bool = False


class CoachValidateResponse(BaseModel):
    """Respuesta de POST /coach/validate (re-evalúa policies sin LLM)."""
    violations: List[CoachAction] = []
    can_generate: bool = False
    blocking_count: int = 0
    warning_count: int = 0
