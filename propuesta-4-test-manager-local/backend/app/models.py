from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Date, ForeignKey, JSON, Enum, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from .database import Base


class TestStatus(str, enum.Enum):
    pending = "pending"
    pass_ = "pass"
    fail = "fail"
    blocked = "blocked"
    na = "na"


class Priority(str, enum.Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    password_hash = Column(String(200), nullable=False)
    is_admin = Column(Boolean, nullable=False, server_default="0", default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")
    ai_usage = relationship("AiUsage", back_populates="user", cascade="all, delete-orphan")


class AiUsage(Base):
    """
    Una fila por cada llamada exitosa a OpenAI.
    Permite calcular gasto del mes por usuario, agregados por operación, etc.
    """
    __tablename__ = "ai_usage"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    operation = Column(String(50), nullable=False, index=True)  # invest_analyze | tc_generate_single | tc_generate_batch | doc_extract
    model = Column(String(100), nullable=False)
    tokens_in = Column(Integer, nullable=False, default=0)
    tokens_out = Column(Integer, nullable=False, default=0)
    cost_usd = Column(Float, nullable=False, default=0.0)
    latency_ms = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user = relationship("User", back_populates="ai_usage")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner = relationship("User", back_populates="projects")
    stories = relationship("UserStory", back_populates="project", cascade="all, delete-orphan")
    test_plans = relationship("TestPlan", back_populates="project", cascade="all, delete-orphan")
    chat_messages = relationship(
        "ProjectChatMessage",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ProjectChatMessage.turn_index",
    )


class UserStory(Base):
    __tablename__ = "user_stories"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    external_id = Column(String(100))
    title = Column(String(500), nullable=False)
    description = Column(Text)
    acceptance_criteria = Column(Text)
    source = Column(String(50), default="manual")  # jira, azure, manual, csv
    sprint = Column(String(100))

    # INVEST analysis
    invest_score = Column(Float, default=0.0)
    invest_analysis = Column(JSON)

    # Story Review Agent (workspace light: contexto persistente por HU)
    # archetypes: list[str] de archetypes detectados por ArchetypeDetector (regex).
    # edge_cases_baseline: list[dict] de escenarios obligatorios del catálogo
    #   determinístico (curado por QA seniors), inyectados al prompt al generar.
    # last_review_at: timestamp del último run del agente sobre esta HU; sirve
    #   para idempotencia (skip INVEST si ya existe + es reciente) y auditoría.
    archetypes = Column(JSON, nullable=True)
    edge_cases_baseline = Column(JSON, nullable=True)
    last_review_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    project = relationship("Project", back_populates="stories")
    test_cases = relationship("TestCase", back_populates="story", cascade="all, delete-orphan")
    bugs = relationship("Bug", back_populates="story")


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(Integer, primary_key=True, index=True)
    story_id = Column(Integer, ForeignKey("user_stories.id"), nullable=False)
    case_id = Column(String(50))
    title = Column(String(500), nullable=False)
    precondition = Column(Text)
    steps = Column(JSON)
    expected_result = Column(Text)
    actual_result = Column(Text)
    status = Column(String(20), default="pending")
    priority = Column(String(20), default="medium")
    test_type = Column(String(50), default="functional")
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    story = relationship("UserStory", back_populates="test_cases")


class BugReport(Base):
    __tablename__ = "bug_reports"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    sprint_name = Column(String(100))
    source = Column(String(50), default="csv")  # jira, azure, csv
    filename = Column(String(200))
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project")
    uploader = relationship("User")
    bugs = relationship("Bug", back_populates="report", cascade="all, delete-orphan")


class Bug(Base):
    __tablename__ = "bugs"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("bug_reports.id"), nullable=False)
    bug_id = Column(String(100))           # ID externo: BUG-123, DEFECT-45
    title = Column(String(500), nullable=False)
    severity = Column(String(20), default="medium")   # critical, high, medium, low
    status = Column(String(50), default="open")       # open, resolved, rejected, wont_fix, in_progress
    environment = Column(String(20), default="qa")    # qa, uat, sit, prod
    sprint_name = Column(String(100))
    story_id = Column(Integer, ForeignKey("user_stories.id"), nullable=True)  # cruce automático
    linked_case_id = Column(String(50))    # TC-001-02 — cruce por caso de prueba
    reporter = Column(String(100))
    assignee = Column(String(100))
    found_date = Column(Date)
    resolved_date = Column(Date)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    report = relationship("BugReport", back_populates="bugs")
    story = relationship("UserStory", back_populates="bugs")


class TestPlan(Base):
    """
    QA Plan de Pruebas generado a partir de la plantilla canónica.

    El wizard del frontend (Bloques 0-9) llena `wizard_data` (JSON con todos los
    placeholders). El TestPlanService rellena la plantilla, opcionalmente llama a
    OpenAI para refinar prosa narrativa (BUSINESS_GOAL, USER_STORY_LIFECYCLE, etc.)
    y guarda el Markdown final en `markdown_content`.
    """
    __tablename__ = "test_plans"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    client_name = Column(String(200), nullable=False)
    doc_version = Column(String(20), nullable=False, default="1.0")
    status = Column(String(20), nullable=False, default="draft")  # draft | generated

    wizard_data = Column(JSON, nullable=False, default=dict)
    markdown_content = Column(Text)
    pending_fields = Column(JSON, default=list)  # lista de placeholders marcados como [[PENDIENTE]]

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    generated_at = Column(DateTime(timezone=True), nullable=True)

    project = relationship("Project", back_populates="test_plans")
    owner = relationship("User")
    coach_messages = relationship(
        "TestPlanCoachMessage",
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="TestPlanCoachMessage.turn_index",
    )


class TestPlanCoachMessage(Base):
    """
    Mensajes del Coach conversacional para un Test Plan (sabor "como Cursor").

    Cada turn = 1 fila. El `actions` JSON contiene la lista de CoachAction
    estructuradas (ask_text, ask_picklist, suggest_replace, block, set_field,
    summary, ready_to_generate, ...). El frontend renderiza cada action como
    un widget nativo.

    El historial se trunca dinámicamente cuando se manda al LLM (ver
    TestPlanCoachService) para evitar token bloat.
    """
    __tablename__ = "test_plan_coach_messages"

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(
        Integer,
        ForeignKey("test_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    turn_index = Column(Integer, nullable=False)  # 0-based, ordena los mensajes
    role = Column(String(20), nullable=False)     # "user" | "assistant" | "system"
    content = Column(Text, nullable=False, default="")
    actions = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    plan = relationship("TestPlan", back_populates="coach_messages")


class ProjectChatMessage(Base):
    """
    Mensajes del Asistente de proyecto (chat Q&A contextualizado).

    Más simple que TestPlanCoachMessage: SIN actions JSON (es chat puro, no
    devuelve widgets accionables como el coach del wizard). El frontend solo
    renderiza role + content como bubbles.

    Cada turn = 1 fila. El historial se trunca dinámicamente cuando se manda
    al LLM (ver ProjectChatService) para evitar token bloat.

    Cascade DELETE con Project: si se borra el proyecto, los mensajes se van
    también, alineado con cómo borran ya stories/test_plans.
    """
    __tablename__ = "project_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    turn_index = Column(Integer, nullable=False)  # 0-based, ordena los mensajes
    role = Column(String(20), nullable=False)     # "user" | "assistant"
    content = Column(Text, nullable=False, default="")
    # story_id opcional: si el mensaje user/assistant fue dentro del contexto
    # de una HU específica (StoryPage), lo guardamos para auditoría futura.
    # NO se hace FK estricta para no romper si la HU se borra (el chat puede
    # sobrevivir aunque desaparezca la HU referida).
    story_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="chat_messages")
