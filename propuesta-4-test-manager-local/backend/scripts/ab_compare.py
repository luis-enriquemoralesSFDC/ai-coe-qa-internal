#!/usr/bin/env python3
"""
Script A/B — compara flujo clásico (generate_for_story) vs flujo agente
(StoryReviewService) sobre el mismo set de HUs de muestra.

Uso desde backend/:
    source venv/bin/activate
    python -m scripts.ab_compare

Costo esperado: ~$0.05-$0.20 USD por run (depende del modelo configurado).

Salida: tabla side-by-side por HU + agregado al final. Útil para validar
que el flujo agente realmente trae más casos / mejor cobertura antes de
defenderlo internamente.

Notas:
- BD aislada en memoria: NO contamina tu qa_manager.db de desarrollo.
- Reusa el OPENAI_API_KEY y OPENAI_MODEL del backend/.env.
- El usuario de prueba se crea como is_admin=True para BYPASSEAR el cap de
  cuota (esto es solo para evitar que el script falle a mitad de run si tu
  cuenta tiene poco presupuesto). En producción el agente respeta la cuota
  como cualquier otro endpoint de IA.
"""
from __future__ import annotations

import asyncio
import sys
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from app.auth.utils import hash_password  # noqa: E402
from app.config import settings  # noqa: E402
from app.database import Base  # noqa: E402
from app.models import Project, TestCase, User, UserStory  # noqa: E402
from app.providers.openai_provider import (  # noqa: E402
    OpenAIInvestAnalyzer,
    OpenAITestCaseGenerator,
)
from app.repositories.story_repository import StoryRepository  # noqa: E402
from app.repositories.test_case_repository import TestCaseRepository  # noqa: E402
from app.repositories.usage_repository import UsageRepository  # noqa: E402
from app.services.invest_service import InvestService  # noqa: E402
from app.services.story_review.archetype_detector import ArchetypeDetector  # noqa: E402
from app.services.story_review.edge_case_catalog import EdgeCaseCatalog  # noqa: E402
from app.services.story_review.story_review_service import StoryReviewService  # noqa: E402
from app.services.testcase_service import TestCaseService  # noqa: E402
from app.services.usage_service import UsageService  # noqa: E402


SAMPLE_STORIES = [
    {
        "title": "Login con MFA opcional",
        "description": "Como usuario quiero poder activar 2FA con app autenticadora para proteger mi cuenta.",
        "acceptance_criteria": (
            "- Si el usuario tiene MFA activo, después del password se pide código TOTP de 6 dígitos.\n"
            "- Si el código es incorrecto 3 veces seguidas, la cuenta se bloquea 15 min.\n"
            "- El usuario puede generar 5 códigos de respaldo de un solo uso.\n"
            "- En el primer login con MFA, se muestra QR para escanear con Google Authenticator."
        ),
    },
    {
        "title": "Importar contactos desde CSV",
        "description": "El admin puede subir un archivo CSV con hasta 5000 contactos y crearlos en bulk.",
        "acceptance_criteria": (
            "- Solo se aceptan archivos .csv.\n"
            "- Tamaño máximo 10 MB.\n"
            "- El CSV debe tener columnas: nombre, email, teléfono, empresa.\n"
            "- Si una fila tiene email duplicado en el CSV, se reporta y la importación continúa.\n"
            "- Al terminar se muestra: importados OK, fallidos, motivo del fallo."
        ),
    },
    {
        "title": "Reembolso parcial de pedido",
        "description": "El agente de soporte puede emitir un reembolso parcial sobre un pedido pagado.",
        "acceptance_criteria": (
            "- El monto del reembolso no puede exceder el total pagado.\n"
            "- Solo se permite reembolsar pedidos en estado 'completado'.\n"
            "- El sistema notifica al cliente por email con el motivo y el monto reembolsado.\n"
            "- El reembolso se refleja en Stripe (sandbox) en menos de 60 segundos."
        ),
    },
]


# ── Setup ────────────────────────────────────────────────────────────────────


@contextmanager
def make_db_session() -> Iterator[Session]:
    """SQLite en memoria, tablas inicializadas. Cero contaminación al qa_manager.db real."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _make_demo_user(db: Session) -> User:
    user = User(
        name="AB Demo",
        email="ab-demo@local.test",
        password_hash=hash_password("x"),
        is_admin=True,  # BYPASEA cuota para no fallar a mitad de run
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_demo_project(db: Session, user: User) -> Project:
    project = Project(name="AB Compare Demo", user_id=user.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def _make_story(db: Session, project: Project, sample: dict) -> UserStory:
    story = UserStory(project_id=project.id, source="manual", **sample)
    db.add(story)
    db.commit()
    db.refresh(story)
    return story


# ── Run de cada flujo ────────────────────────────────────────────────────────


async def run_classic(
    story: UserStory,
    user: User,
    invest_service: InvestService,
    tc_service: TestCaseService,
    tc_repo: TestCaseRepository,
) -> dict:
    """
    Flujo clásico = lo que hace el frontend hoy con dos clicks separados:
    1) Botón INVEST  →  invest_service.analyze_and_save
    2) Botón Generar →  tc_service.generate_for_story (sin contexto enriquecido)
    """
    t0 = time.time()
    await invest_service.analyze_and_save(story, user)
    invest_ms = int((time.time() - t0) * 1000)

    t1 = time.time()
    await tc_service.generate_for_story(story, user)
    gen_ms = int((time.time() - t1) * 1000)

    cases = tc_repo.list_by_story(story.id)
    return {
        "flow": "classic",
        "total_cases": len(cases),
        "by_type": _count_by_type(cases),
        "latency_ms": invest_ms + gen_ms,
        "invest_ms": invest_ms,
        "gen_ms": gen_ms,
    }


async def run_agent(
    story: UserStory,
    user: User,
    review_service: StoryReviewService,
    tc_repo: TestCaseRepository,
) -> dict:
    """
    Flujo agente = lo que hace el botón nuevo "Revisar con QA Agent":
    1 sola call, 3 steps internos, devuelve timeline.
    """
    t0 = time.time()
    result = await review_service.review(story, user)
    total_ms = int((time.time() - t0) * 1000)

    cases = tc_repo.list_by_story(story.id)
    invest_step = next(
        (s for s in result["steps"] if s["kind"] == "invest_analysis"), None
    )
    return {
        "flow": "agent",
        "total_cases": result["test_cases_created"],
        "by_type": _count_by_type(cases),
        "latency_ms": total_ms,
        "archetypes": result.get("archetypes") or [],
        "baseline_count": len(result.get("edge_cases_baseline") or []),
        "invest_status": (invest_step or {}).get("status", "n/a"),
    }


def _count_by_type(cases: list[TestCase]) -> dict[str, int]:
    counts = {"happy_path": 0, "negative": 0, "edge_case": 0}
    for c in cases:
        ttype = getattr(c, "test_type", "")
        counts[ttype] = counts.get(ttype, 0) + 1
    return counts


# ── Render ───────────────────────────────────────────────────────────────────


def _print_comparison(story_title: str, classic: dict, agent: dict) -> None:
    print()
    print("─" * 78)
    print(f"HU: {story_title}")
    print("─" * 78)
    print(f"  {'Métrica':<24} | {'Clásico':<16} | {'Agente':<24}")
    print(f"  {'-' * 24}-+-{'-' * 16}-+-{'-' * 24}")
    print(
        f"  {'Total casos':<24} | "
        f"{classic['total_cases']:<16} | "
        f"{agent['total_cases']} ({_diff(agent['total_cases'], classic['total_cases'])})"
    )
    for ttype in ("happy_path", "negative", "edge_case"):
        c = classic["by_type"].get(ttype, 0)
        a = agent["by_type"].get(ttype, 0)
        print(
            f"  {ttype:<24} | {c:<16} | {a} ({_diff(a, c)})"
        )
    print(
        f"  {'Latencia ms':<24} | "
        f"{classic['latency_ms']:<16} | "
        f"{agent['latency_ms']} ({_diff(agent['latency_ms'], classic['latency_ms'])})"
    )
    print(
        f"  {'Archetypes detectados':<24} | "
        f"{'(N/A en clásico)':<16} | "
        f"{', '.join(agent['archetypes']) or '(ninguno)'}"
    )
    print(
        f"  {'Baseline scenarios':<24} | "
        f"{'(N/A en clásico)':<16} | "
        f"{agent['baseline_count']}"
    )
    print(
        f"  {'INVEST status':<24} | "
        f"{'ok (siempre)':<16} | "
        f"{agent['invest_status']}"
    )


def _diff(new: int, old: int) -> str:
    if new == old:
        return "="
    return f"{new - old:+d}"


# ── Main ─────────────────────────────────────────────────────────────────────


async def main() -> int:
    print("=" * 78)
    print("A/B Compare — Flujo clásico vs StoryReviewService (QA Agent)")
    print("=" * 78)
    print(f"Modelo: {settings.openai_model}")
    print(f"Sample stories: {len(SAMPLE_STORIES)}")
    print()

    if not settings.openai_api_key:
        print("ERROR: OPENAI_API_KEY no configurada en backend/.env")
        return 1

    with make_db_session() as db:
        user = _make_demo_user(db)
        project = _make_demo_project(db, user)

        story_repo = StoryRepository(db)
        tc_repo = TestCaseRepository(db)
        usage_repo = UsageRepository(db)
        usage_service = UsageService(usage_repo)

        invest_analyzer = OpenAIInvestAnalyzer()
        tc_generator = OpenAITestCaseGenerator()

        invest_service = InvestService(story_repo, invest_analyzer, usage_service)
        tc_service = TestCaseService(
            story_repo, tc_repo, tc_generator, tc_generator, usage_service
        )

        archetype_detector = ArchetypeDetector()
        edge_case_catalog = EdgeCaseCatalog()
        review_service = StoryReviewService(
            story_repo,
            tc_repo,
            invest_service,
            tc_service,
            archetype_detector,
            edge_case_catalog,
        )

        results = []

        for sample in SAMPLE_STORIES:
            # Dos copias de la HU para que cada flujo arranque desde cero (sin contaminar al otro)
            story_classic = _make_story(db, project, sample)
            story_agent = _make_story(db, project, sample)

            print(f"\nProcesando: {sample['title']}")
            print("  → Flujo clásico...", end=" ", flush=True)
            classic = await run_classic(
                story_classic, user, invest_service, tc_service, tc_repo
            )
            print(f"{classic['total_cases']} casos en {classic['latency_ms']} ms")

            print("  → Flujo agente.....", end=" ", flush=True)
            agent = await run_agent(story_agent, user, review_service, tc_repo)
            print(f"{agent['total_cases']} casos en {agent['latency_ms']} ms")

            results.append((sample["title"], classic, agent))

        print("\n\n" + "=" * 78)
        print("RESULTADOS POR HU")
        print("=" * 78)
        for title, classic, agent in results:
            _print_comparison(title, classic, agent)

        # Agregado
        print("\n\n" + "=" * 78)
        print("AGREGADO")
        print("=" * 78)
        total_classic = sum(c["total_cases"] for _, c, _ in results)
        total_agent = sum(a["total_cases"] for _, _, a in results)
        avg_lat_classic = sum(c["latency_ms"] for _, c, _ in results) // len(results)
        avg_lat_agent = sum(a["latency_ms"] for _, _, a in results) // len(results)

        print(f"  HUs procesadas:               {len(results)}")
        print(
            f"  Total casos generados:        clásico={total_classic} | "
            f"agente={total_agent} ({_diff(total_agent, total_classic)})"
        )
        print(
            f"  Promedio casos por HU:        clásico={total_classic / len(results):.1f} | "
            f"agente={total_agent / len(results):.1f}"
        )
        print(
            f"  Latencia promedio (ms):       clásico={avg_lat_classic} | "
            f"agente={avg_lat_agent} ({_diff(avg_lat_agent, avg_lat_classic)})"
        )
        print()
        print("  Costo total agregado: revisar logs estructurados [ai_call] arriba.")
        print("  Tip: grep '\\[ai_call\\]' la salida y suma cost_usd para tener el total exacto.")
        print("=" * 78)

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
