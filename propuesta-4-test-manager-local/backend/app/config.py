from pydantic_settings import BaseSettings
from pydantic import model_validator
import logging

from .providers._pricing import is_known_model, supported_models

logger = logging.getLogger(__name__)

_INSECURE_KEY = "dev-secret-key-change-in-production"
_DEFAULT_MODEL = "gpt-4o-2024-08-06"


class Settings(BaseSettings):
    ai_provider: str = "openai"

    openai_api_key: str = ""
    openai_model: str = _DEFAULT_MODEL

    # ── SFR Gateway (opcional) ─────────────────────────────────────────────
    # Si se setea OPENAI_BASE_URL, las llamadas van al gateway en vez de api.openai.com
    # y la key se manda en el header `X-Api-Key` (no en Authorization Bearer).
    # Auto-detect: si la key no empieza con "sk-", se asume modo gateway y
    # OPENAI_BASE_URL pasa a ser obligatorio.
    openai_base_url: str = ""

    # Trust Layer del SFR Gateway (opt-in, solo aplica con base_url de gateway)
    openai_trust_layer_bias: bool = False
    openai_trust_layer_toxicity: bool = False
    openai_trust_layer_prompt_injection: bool = False

    secret_key: str = _INSECURE_KEY
    # Heroku Postgres entrega URLs con prefijo `postgres://`, pero SQLAlchemy 2.x
    # exige `postgresql://` (driver psycopg2) o `postgresql+psycopg://` (psycopg3).
    # La normalización se hace en el validator `normalize_database_url` más abajo.
    database_url: str = "sqlite:///./qa_manager.db"
    # 24h por default: balance entre UX (no relogueo constante) y blast radius
    # de un token comprometido. Para subir, considera implementar refresh tokens.
    access_token_expire_minutes: int = 1440
    log_level: str = "INFO"

    # Rate limit para endpoints de IA. Aplica POR USUARIO autenticado (no por IP),
    # así cada QA tiene su propia cuota aunque compartan red/laptop.
    # Formato slowapi: "<n>/<período>" — ej: "120/minute", "5000/hour", "1/second".
    # Por defecto 120/minuto = 2 req/s por usuario, suficiente para iterar sin trabarte.
    ai_rate_limit: str = "120/minute"

    # Tope de historias por lote en /generate-batch. NO es cuota total del usuario,
    # solo evita que un solo prompt rompa el max_tokens del modelo (4K-8K out).
    # Si querés meter más, divide en varios lotes — no hay cuota global.
    max_batch_size: int = 50

    # Presupuesto mensual de IA POR USUARIO (en USD). Cuando un user excede esto,
    # los endpoints de IA devuelven 429 hasta el siguiente mes calendario.
    # Los admins (User.is_admin=True) BYPASSAN este check.
    # Cero o negativo = sin límite (modo dev).
    monthly_budget_usd: float = 100.0

    # Default de casos por historia cuando el usuario no especifica max_cases.
    # None = la IA decide (3-5 típicos). Si seteás un número, ese es el límite duro.
    default_max_cases_per_story: int | None = None

    # ── Cursor SDK (worker de ejecución automática de pruebas) ─────────────
    # API key de Cursor que el worker Node usa para invocar el SDK
    # (`Agent.create` + `agent.send`) y que el agente luego use Playwright MCP.
    # Vacía está OK: la app arranca igual; solo los endpoints de test-runs y el
    # worker fallarán si no hay key. Distinta lógica que OPENAI_API_KEY (que sí
    # warning), porque la ejecución automática es un feature opcional, no core.
    cursor_api_key: str = ""

    # Modelo por defecto que el worker pide al SDK. Haiku es el más barato y
    # suficiente para la mayoría de casos UI guiados por Playwright. El frontend
    # puede override por run, pero este es el default si no se especifica.
    cursor_model_id: str = "claude-haiku-4-5"

    @property
    def use_gateway(self) -> bool:
        """True si vamos a hablar via SFR Gateway, False si va directo a api.openai.com."""
        if self.openai_base_url:
            return True
        # Auto-detect: keys de OpenAI directo siempre empiezan con "sk-".
        # Una key sin ese prefijo + sin base_url es config inconsistente (lo atrapa el validator).
        if self.openai_api_key and not self.openai_api_key.startswith("sk-"):
            return True
        return False

    @model_validator(mode="after")
    def normalize_database_url(self) -> "Settings":
        """
        Normaliza prefijos de URL de Postgres para que SQLAlchemy 2.x los acepte.

        Heroku Postgres entrega URLs con `postgres://` (legacy). SQLAlchemy 2.x
        las rechaza explícitamente y exige uno de estos:
          - `postgresql://...`               → driver psycopg2 (legacy, no en requirements)
          - `postgresql+psycopg://...`       → driver psycopg3 (lo que tenemos en requirements)
          - `postgresql+psycopg2://...`      → driver psycopg2 explícito

        Por seguridad, normalizamos `postgres://` y `postgresql://` a
        `postgresql+psycopg://` para que use psycopg3 sin ambigüedad.

        Esta normalización es idempotente (no toca URLs ya correctas o sqlite).
        """
        url = self.database_url
        if url.startswith("postgres://"):
            self.database_url = url.replace("postgres://", "postgresql+psycopg://", 1)
        elif url.startswith("postgresql://") and "+psycopg" not in url.split("://", 1)[0]:
            # `postgresql://` sin driver explicito → forzamos psycopg3
            self.database_url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        return self

    @model_validator(mode="after")
    def validate_secret_key(self) -> "Settings":
        """
        Política de seguridad de SECRET_KEY:
        - Si la DB es SQLite local → warning suave (asumimos dev).
        - Si la DB NO es SQLite (Postgres/MySQL/Neon/Heroku) → error duro.
          Heurística cero-config: si no estás corriendo SQLite, estás en algo
          parecido a staging/prod y NO podemos arrancar con el secret default.

        Para generar uno seguro: `python -c "import secrets; print(secrets.token_urlsafe(32))"`
        """
        if self.secret_key != _INSECURE_KEY:
            return self
        is_local_sqlite = self.database_url.startswith("sqlite:")
        if is_local_sqlite:
            import warnings
            warnings.warn(
                "SECRET_KEY usa el valor por defecto inseguro. "
                "OK para dev local con SQLite, pero define SECRET_KEY en .env "
                "antes de cualquier deploy.",
                stacklevel=2,
            )
            return self
        raise ValueError(
            "SECRET_KEY usa el valor por defecto inseguro y la DB NO es SQLite local "
            f"(database_url='{self.database_url[:40]}...'). "
            "Esto parece un deploy/staging/produccion y NO podemos arrancar asi. "
            "Define SECRET_KEY en el .env con un valor robusto. "
            "Generador: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
        )

    @model_validator(mode="after")
    def validate_openai_model(self) -> "Settings":
        """
        Si vamos por OpenAI directo, el modelo DEBE estar en el allowlist.
        Si vamos por gateway, solo emitimos warning (el gateway puede tener nombres custom).
        """
        if not is_known_model(self.openai_model):
            if self.use_gateway:
                logger.warning(
                    "OPENAI_MODEL='%s' no está en el allowlist de pricing. "
                    "El cost_usd se estimará con tarifas de gpt-4o por defecto. "
                    "Si es un alias del SFR Gateway, esto es esperado.",
                    self.openai_model,
                )
            else:
                raise ValueError(
                    f"OPENAI_MODEL='{self.openai_model}' no está en el allowlist. "
                    f"Modelos soportados: {', '.join(supported_models())}. "
                    f"Para agregar un nuevo modelo, actualiza app/providers/_pricing.py."
                )
        return self

    @model_validator(mode="after")
    def validate_openai_credentials(self) -> "Settings":
        """
        Coherencia entre key, base_url y modo gateway.
        - Sin key: warning suave (la app arranca, pero IA falla).
        - Key tipo gateway (no 'sk-') sin OPENAI_BASE_URL: error duro.
        - Key 'sk-' con OPENAI_BASE_URL custom: OK (el SDK acepta apuntar a otro host).
        """
        if not self.openai_api_key:
            import warnings
            warnings.warn(
                "OPENAI_API_KEY no está configurada. La app arrancará pero los endpoints "
                "de IA fallarán con error de autenticación. Configúrala en backend/.env.",
                stacklevel=2,
            )
            return self

        # Key parece de gateway (no empieza con 'sk-') pero falta el base_url.
        if not self.openai_api_key.startswith("sk-") and not self.openai_base_url:
            raise ValueError(
                "Tu OPENAI_API_KEY no parece ser de OpenAI directo (no empieza con 'sk-'), "
                "lo que sugiere que estás usando un gateway interno (ej: SFR Gateway). "
                "En ese caso necesitás definir también OPENAI_BASE_URL en backend/.env. "
                "Ejemplo: OPENAI_BASE_URL=https://gateway.salesforceresearch.ai/openai/process/v1"
            )
        return self

    class Config:
        env_file = ".env"


settings = Settings()
