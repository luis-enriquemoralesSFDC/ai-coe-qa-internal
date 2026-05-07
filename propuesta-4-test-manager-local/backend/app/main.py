import logging
import os
import pathlib
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from alembic.config import Config as AlembicConfig
from alembic import command as alembic_command
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from .config import settings
from .logging_config import configure_logging
from .auth.utils import user_or_ip_key
from .auth.router import router as auth_router
from .routes.admin import router as admin_router
from .routes.projects import router as projects_router
from .routes.stories import router as stories_router
from .routes.test_cases import router as test_cases_router
from .routes.export import router as export_router
from .routes.kpis.bugs import router as kpi_bugs_router
from .routes.kpis.metrics import router as kpi_metrics_router
from .routes.test_plans import (
    project_test_plans_router,
    test_plans_router,
)
from .routes.test_plan_coach import router as test_plan_coach_router
from .routes.project_chat import router as project_chat_router
from .services.test_plan_service import validate_template_schema_sync

configure_logging(settings.log_level)
logger = logging.getLogger(__name__)

# Limiter global — usa la MISMA key function que los routers de IA: por usuario
# (sub del JWT) si hay token, fallback a IP en endpoints anónimos. Así dos QAs
# detrás del mismo NAT no comparten cuota.
# default_limits aplica a TODOS los endpoints sin decorador @limiter.limit:
# CRUD, KPIs, exports, etc. 600/min/user es generoso para uso interactivo y
# corta abusos automatizados.
limiter = Limiter(key_func=user_or_ip_key, default_limits=["600/minute"])


def _run_migrations() -> None:
    ini_path = os.path.join(os.path.dirname(__file__), "..", "alembic.ini")
    alembic_cfg = AlembicConfig(os.path.abspath(ini_path))
    alembic_command.upgrade(alembic_cfg, "head")
    logger.info("Migraciones aplicadas correctamente")


_run_migrations()
# Falla fast si la plantilla del Test Plan está desincronizada con el schema.
# Mejor romper en boot que generar test plans con placeholders sin reemplazar.
validate_template_schema_sync()

app = FastAPI(
    title="QA Hub",
    description="Plataforma de gestión QA con casos de prueba, INVEST y Test Plans (powered by OpenAI)",
    version="1.1.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
# Middleware necesario para que default_limits del Limiter se apliquen.
# Sin esto, slowapi solo respeta los decoradores @limiter.limit explicitos.
app.add_middleware(SlowAPIMiddleware)

_DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
]
# CORS_EXTRA_ORIGINS permite agregar dominios adicionales sin tocar código.
# Útil para staging/prod (ej: "https://qa-hub-ai-coe.herokuapp.com,https://qa-hub.example.com").
# En el deploy "monorepo + StaticFiles" del CoE no se usa (mismo origen), pero queda
# como defensa por si en el futuro se sirven frontend y backend en hosts distintos.
_extra_origins_raw = os.environ.get("CORS_EXTRA_ORIGINS", "")
_extra_origins = [o.strip() for o in _extra_origins_raw.split(",") if o.strip()]
_cors_origins = _DEFAULT_CORS_ORIGINS + _extra_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(stories_router, prefix="/api")
app.include_router(test_cases_router, prefix="/api")
app.include_router(export_router, prefix="/api")
app.include_router(kpi_bugs_router, prefix="/api")
app.include_router(kpi_metrics_router, prefix="/api")
app.include_router(project_test_plans_router, prefix="/api")
app.include_router(test_plans_router, prefix="/api")
app.include_router(test_plan_coach_router, prefix="/api")
app.include_router(project_chat_router, prefix="/api")


@app.get("/api/health")
def health():
    """Health check endpoint para Heroku/monitoreo. Liviano, sin tocar BD ni IA."""
    return {"status": "ok", "service": "QA Hub", "version": "1.1.0"}


# ── Servir frontend SPA (React) detrás de FastAPI ─────────────────────────────
# En producción Heroku, el buildpack heroku/nodejs corre `npm run build` y deja
# los assets en `propuesta-2-test-manager/frontend/dist/`. Acá hacemos `app.mount`
# de ese directorio en `/` para servir el SPA y todos sus assets.
#
# Importante: este mount debe ir AL FINAL, después de todos los routers `/api`,
# para que las rutas de API ganen el match. Cualquier ruta que NO empiece con
# `/api/`, `/docs`, `/redoc` u `/openapi.json` cae acá y se sirve como SPA.
#
# Para que el client-side routing de React Router funcione (ej: cargar
# `/projects/123` directo en el browser), el SPA fallback de abajo intercepta
# 404s del StaticFiles y devuelve `index.html` para que React Router se haga
# cargo del routing en cliente.
#
# Si el directorio dist/ no existe (ej: dev local sin build), el mount se omite
# y el frontend se sirve por Vite en otro puerto (5173) con su propio dev server.
_BACKEND_DIR = pathlib.Path(__file__).resolve().parent.parent  # backend/
_MONOREPO_DIR = _BACKEND_DIR.parent  # propuesta-2-test-manager/
_FRONTEND_DIST = _MONOREPO_DIR / "frontend" / "dist"

if _FRONTEND_DIST.is_dir():
    logger.info("Frontend dist detectado en %s, montando SPA en /", _FRONTEND_DIST)

    # Prefijos que NO deben caer al fallback SPA: rutas reservadas por el backend
    # (API, docs OpenAPI, health). Si el cliente pide algo bajo estos prefijos y
    # no existe, devolvemos 404 puro para que el frontend (axios) lo maneje como
    # error real, no como HTML "exitoso".
    _SPA_PASSTHROUGH_PREFIXES = ("api/", "docs", "redoc", "openapi.json")

    class _SPAStaticFiles(StaticFiles):
        """StaticFiles que sirve index.html en 404 SOLO para rutas no reservadas.

        Las rutas que comienzan con alguno de los prefijos en _SPA_PASSTHROUGH_PREFIXES
        devuelven el 404 nativo, para que el cliente sepa que esa ruta de API/docs
        no existe y no intente parsear HTML como JSON.
        """

        async def get_response(self, path: str, scope):
            try:
                return await super().get_response(path, scope)
            except StarletteHTTPException as exc:
                if exc.status_code == 404 and not path.startswith(_SPA_PASSTHROUGH_PREFIXES):
                    return await super().get_response("index.html", scope)
                raise

    app.mount(
        "/",
        _SPAStaticFiles(directory=str(_FRONTEND_DIST), html=True),
        name="frontend",
    )
else:
    logger.info(
        "Frontend dist NO detectado en %s — saltando mount SPA. "
        "El frontend debe servirse por Vite (npm run dev en el frontend).",
        _FRONTEND_DIST,
    )

    @app.get("/")
    def root_dev():
        return {
            "message": "QA Hub API (frontend dist no detectado)",
            "docs": "/docs",
            "health": "/api/health",
        }
