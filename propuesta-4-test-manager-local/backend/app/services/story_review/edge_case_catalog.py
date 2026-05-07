from __future__ import annotations
"""
EdgeCaseCatalog — para cada archetype, lista de escenarios baseline obligatorios.

Es código determinístico curado por QA seniors. Cero costo, cero latencia,
cero hallucination. Garantiza que ciertos escenarios críticos SIEMPRE se
sugieran al LLM al generar test cases (vía StoryReviewService).

Cada escenario tiene:
- id: string único cross-archetype (para deduplicación cuando una HU activa
  varios archetypes que comparten escenario).
- name: título descriptivo, en español, lenguaje del QA.
- rationale: por qué es obligatorio (visible en UI y logs).
- severity: critical|high|medium — orienta al LLM la prioridad del caso.

Lista cerrada: agregar/modificar requiere PR. NO recibir input del usuario.

Uso típico (en StoryReviewService):
    catalog = EdgeCaseCatalog()
    baseline = catalog.lookup(archetypes=["auth", "validation"])
    # baseline = list[dict] deduplicado, listo para inyectar al prompt
"""
from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class EdgeCaseScenario:
    id: str
    name: str
    rationale: str
    severity: str  # "critical" | "high" | "medium"


# Catálogo: archetype -> lista de escenarios. Los IDs son únicos a nivel global
# (ej: "auth.invalid_credentials") para que dedupe entre archetypes funcione.
_CATALOG: dict[str, list[EdgeCaseScenario]] = {
    "auth": [
        EdgeCaseScenario(
            id="auth.invalid_credentials",
            name="Intento de acceso con credenciales inválidas",
            rationale="Verifica el rechazo correcto y mensaje sin leak de info (no decir si el user o el pass es el incorrecto).",
            severity="critical",
        ),
        EdgeCaseScenario(
            id="auth.locked_account",
            name="Acceso a cuenta bloqueada por intentos fallidos",
            rationale="Política anti-brute-force: la N+1 ésima vez debe bloquear y notificar.",
            severity="high",
        ),
        EdgeCaseScenario(
            id="auth.expired_session",
            name="Operación con sesión expirada (JWT/cookie vencida)",
            rationale="Validar redirect a login y no permitir operaciones autorizadas con token expirado.",
            severity="high",
        ),
        EdgeCaseScenario(
            id="auth.password_case_sensitivity",
            name="Login con contraseña en mayúsculas/minúsculas distintas",
            rationale="La contraseña debe ser case-sensitive; cualquier variante debe rechazarse.",
            severity="medium",
        ),
    ],
    "permissions": [
        EdgeCaseScenario(
            id="permissions.unauthorized_user",
            name="Usuario sin permiso intenta acceder al recurso",
            rationale="Debe retornar 403/redirect, no 200 con UI vacía. Y no leakar metadata del recurso.",
            severity="critical",
        ),
        EdgeCaseScenario(
            id="permissions.idor_other_owner",
            name="Usuario A intenta acceder a recurso de Usuario B (IDOR)",
            rationale="Cambiar el ID del recurso en URL/body no debe permitir leer/modificar lo de otro owner.",
            severity="critical",
        ),
        EdgeCaseScenario(
            id="permissions.role_change_mid_session",
            name="Permiso revocado mientras la sesión está activa",
            rationale="Si admin revoca el permiso, la próxima acción del user debe rechazarse, no funcionar por cache.",
            severity="medium",
        ),
    ],
    "validation": [
        EdgeCaseScenario(
            id="validation.required_empty",
            name="Campo requerido enviado vacío",
            rationale="Mensaje de error claro, no 500. Validar tanto en frontend como backend (defensa en profundidad).",
            severity="high",
        ),
        EdgeCaseScenario(
            id="validation.exceeds_max_length",
            name="Campo con valor que excede el largo máximo (>1000 caracteres)",
            rationale="Truncar o rechazar con mensaje, nunca dejar pasar a BD donde puede romper el schema.",
            severity="medium",
        ),
        EdgeCaseScenario(
            id="validation.utf8_special_chars",
            name="Campo con caracteres especiales y acentos (ñ, é, ç, 中, 日, emojis)",
            rationale="Salesforce/SAP a veces fallan con UTF-8; verificar que se persisten y muestran correctamente.",
            severity="medium",
        ),
        EdgeCaseScenario(
            id="validation.injection_attempt",
            name="Campo con intento de inyección (SQL, script HTML, comando)",
            rationale="Sanitización debe neutralizar; nunca ejecutar el contenido ni renderizar HTML literal.",
            severity="critical",
        ),
        EdgeCaseScenario(
            id="validation.boundary_min_max",
            name="Campo numérico exactamente en el límite mínimo y máximo permitido",
            rationale="Off-by-one es el bug más común en validaciones de rango.",
            severity="medium",
        ),
    ],
    "crud": [
        EdgeCaseScenario(
            id="crud.delete_referenced",
            name="Eliminar un registro que es referenciado por otro",
            rationale="Debe respetar la FK: o cascade documentado, o rechazo con mensaje. Nunca dejar referencias huérfanas.",
            severity="high",
        ),
        EdgeCaseScenario(
            id="crud.concurrent_update",
            name="Dos usuarios actualizan el mismo registro simultáneamente",
            rationale="Validar lost-update: o last-write-wins documentado, o lock optimista con error claro.",
            severity="medium",
        ),
        EdgeCaseScenario(
            id="crud.duplicate_creation",
            name="Crear registro con valor único duplicado (email, código, etc.)",
            rationale="Constraint debe rechazar con mensaje user-friendly, no 500.",
            severity="high",
        ),
    ],
    "search": [
        EdgeCaseScenario(
            id="search.empty_query",
            name="Búsqueda con query vacío o solo espacios",
            rationale="Debe devolver lista vacía o todos los registros (definir y respetar), no 500.",
            severity="medium",
        ),
        EdgeCaseScenario(
            id="search.no_results",
            name="Búsqueda sin resultados (texto que no existe en BD)",
            rationale="UI debe mostrar 'sin resultados' explícito, no parecer estado de carga.",
            severity="medium",
        ),
        EdgeCaseScenario(
            id="search.special_chars_in_query",
            name="Búsqueda con caracteres especiales (%, _, *, comillas)",
            rationale="Esos caracteres son sintaxis SQL/regex; deben escaparse para no romper la query.",
            severity="high",
        ),
    ],
    "payment": [
        EdgeCaseScenario(
            id="payment.insufficient_funds",
            name="Pago con saldo/limite insuficiente",
            rationale="Rechazar antes de llegar al gateway externo; mensaje claro al usuario.",
            severity="critical",
        ),
        EdgeCaseScenario(
            id="payment.gateway_timeout",
            name="Timeout del gateway de pago en medio de la transacción",
            rationale="No marcar como exitoso si no hay confirmación; idempotencia para no doble-cobrar.",
            severity="critical",
        ),
        EdgeCaseScenario(
            id="payment.fractional_currency",
            name="Monto con decimales en moneda que no los permite (ej: JPY)",
            rationale="Validación por moneda; redondeo o rechazo según política.",
            severity="medium",
        ),
        EdgeCaseScenario(
            id="payment.negative_or_zero_amount",
            name="Monto cero o negativo en una transacción",
            rationale="Debe rechazarse antes de procesarse; previene refunds disfrazados de cobros.",
            severity="high",
        ),
    ],
    "notification": [
        EdgeCaseScenario(
            id="notification.invalid_recipient",
            name="Envío a destinatario con email/teléfono inválido",
            rationale="Validar formato antes de mandar al proveedor; no consumir cuota en envíos imposibles.",
            severity="medium",
        ),
        EdgeCaseScenario(
            id="notification.provider_failure",
            name="Falla del proveedor de notificación (SMTP/SMS down)",
            rationale="Reintentos con backoff, registrar fallo, no perder el evento ni fallar la operación principal.",
            severity="high",
        ),
        EdgeCaseScenario(
            id="notification.duplicate_send",
            name="Doble envío del mismo evento (retry o doble click)",
            rationale="Idempotencia: el destinatario debe recibir UNA sola notificación por evento.",
            severity="medium",
        ),
    ],
    "integration": [
        EdgeCaseScenario(
            id="integration.api_timeout",
            name="Timeout de la API externa",
            rationale="No colgar la operación del usuario; fallar rápido con mensaje y registrar el incidente.",
            severity="high",
        ),
        EdgeCaseScenario(
            id="integration.api_5xx",
            name="API externa devuelve error 5xx",
            rationale="Reintentar con backoff (si idempotente) o fallar con mensaje claro; no propagar 500 al user.",
            severity="high",
        ),
        EdgeCaseScenario(
            id="integration.malformed_response",
            name="API externa devuelve JSON malformado o campos faltantes",
            rationale="Validar shape antes de procesar; no asumir éxito porque vino 200.",
            severity="medium",
        ),
        EdgeCaseScenario(
            id="integration.auth_token_expired",
            name="Token de la API externa expiró durante la operación",
            rationale="Refresh transparente o reintento; no fallar la operación del usuario por esto.",
            severity="medium",
        ),
    ],
    "file_upload": [
        EdgeCaseScenario(
            id="file_upload.exceeds_size_limit",
            name="Archivo que excede el tamaño máximo permitido",
            rationale="Rechazar antes de subir todo (validación temprana); mensaje claro con el límite.",
            severity="high",
        ),
        EdgeCaseScenario(
            id="file_upload.wrong_extension",
            name="Archivo con extensión no soportada",
            rationale="Validar por content-type Y extensión (defensa en profundidad); no por solo el nombre.",
            severity="high",
        ),
        EdgeCaseScenario(
            id="file_upload.malicious_content",
            name="Archivo con extensión válida pero contenido malicioso (ej: macro en .xlsx)",
            rationale="Idealmente AV scan; mínimo loggear y limitar superficie de ejecución.",
            severity="critical",
        ),
        EdgeCaseScenario(
            id="file_upload.empty_file",
            name="Archivo vacío (0 bytes)",
            rationale="Rechazar con mensaje, no procesar como si tuviera datos.",
            severity="medium",
        ),
    ],
    "data_migration": [
        EdgeCaseScenario(
            id="data_migration.partial_failure",
            name="Migración falla a la mitad: algunos registros migrados, otros no",
            rationale="Transaccionalidad o checkpoint para retomar; reportar exactamente qué se migró y qué no.",
            severity="critical",
        ),
        EdgeCaseScenario(
            id="data_migration.duplicate_records",
            name="Migrar dos veces el mismo registro (idempotencia)",
            rationale="Detectar por business key; no crear duplicados ni romper por constraint.",
            severity="high",
        ),
        EdgeCaseScenario(
            id="data_migration.encoding_mismatch",
            name="Datos legacy en encoding distinto (Latin-1 vs UTF-8)",
            rationale="Conversión explícita; verificar caracteres con acentos y eñe en la BD destino.",
            severity="high",
        ),
    ],
    "reporting": [
        EdgeCaseScenario(
            id="reporting.empty_dataset",
            name="Reporte sobre dataset vacío (sin registros en el período)",
            rationale="Mostrar 'sin datos' explícito, no gráficos vacíos confusos ni división por cero.",
            severity="medium",
        ),
        EdgeCaseScenario(
            id="reporting.timezone_consistency",
            name="Reporte con datos cruzando zonas horarias o cambio de horario de verano",
            rationale="Definir timezone de referencia; un mismo registro no debe contarse en dos días distintos.",
            severity="medium",
        ),
        EdgeCaseScenario(
            id="reporting.large_dataset_pagination",
            name="Reporte con dataset muy grande (>10K filas)",
            rationale="Paginar o exportar; no traer todo a memoria ni cargar en UI sin paginación.",
            severity="medium",
        ),
    ],
}


class EdgeCaseCatalog:
    """
    Stateless. Una sola operación pública: lookup(archetypes) → list[dict].

    Reusable como singleton.
    """

    def lookup(self, archetypes: list[str]) -> list[dict]:
        """
        Devuelve la lista deduplicada de escenarios baseline aplicables a los
        archetypes detectados. Output ya serializado (list[dict]) listo para
        guardar en BD (JSON column) o serializar a JSON en el response.

        Si un archetype no existe en el catálogo, se ignora silenciosamente
        (el detector solo emite archetypes válidos del propio catálogo, así
        que esto solo aplica si alguien llama el catálogo manualmente).

        Dedup por `id`: si dos archetypes comparten un escenario (ej: futuro
        "validation" + "form" comparten "required_empty"), aparece una sola
        vez en el output.
        """
        seen_ids: set[str] = set()
        out: list[dict] = []
        for arch in archetypes or []:
            for scenario in _CATALOG.get(arch, []):
                if scenario.id in seen_ids:
                    continue
                seen_ids.add(scenario.id)
                out.append(asdict(scenario))
        return out

    @property
    def known_archetypes(self) -> list[str]:
        """Lista pública de archetypes que el catálogo soporta (para validación/UI)."""
        return list(_CATALOG.keys())
