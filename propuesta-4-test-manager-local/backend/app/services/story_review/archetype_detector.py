from __future__ import annotations
"""
ArchetypeDetector — clasifica una HU en archetypes funcionales SIN llamar al LLM.

Es código determinístico (regex case-insensitive) sobre title + description +
acceptance_criteria. Cero costo, instantáneo, predecible. Cero riesgo de
hallucination en la clasificación.

Diseño:
- Cada archetype tiene una lista de regex; basta UN match para activarlo.
- Tope de 5 archetypes por HU para no inflar el prompt enriquecido del agente.
- Lista cerrada de archetypes: agregar uno requiere PR (no es runtime config).
- Si una HU no matchea nada, devuelve [] (el agente sigue funcionando con el
  flujo base sin archetypes ni edge cases del catálogo).

NUNCA mezcla input del QA con código: las regex viven acá hardcodeadas; el QA
no puede inyectar archetypes via title/description/AC. El detector solo lee.
"""
import re
from typing import Iterable

from ...models import UserStory


# Tope duro de archetypes detectados por HU. Más allá, infla el prompt y el
# valor marginal cae rápido (los baselines empiezan a duplicarse).
_MAX_ARCHETYPES = 5


def _compile_patterns(words: Iterable[str]) -> list[re.Pattern]:
    """
    Compila cada palabra/frase como regex case-insensitive con \\b para evitar
    falsos positivos por substring (ej: 'admin' en 'administrar').
    """
    return [re.compile(rf"\b{w}\b", re.IGNORECASE) for w in words]


# Catálogo de archetypes y sus disparadores (regex). Lista cerrada; agregar
# requiere PR. Cada archetype activa un set de edge cases baseline (ver
# edge_case_catalog.py). Las palabras incluyen variantes ES/EN típicas en
# Salesforce CoE.
_ARCHETYPE_PATTERNS: dict[str, list[re.Pattern]] = {
    "auth": _compile_patterns([
        r"login", r"logout", r"sesi[oó]n", r"sign[\s-]?in", r"sign[\s-]?out",
        r"autenticaci[oó]n", r"authentication", r"contrase[ñn]a", r"password",
        r"credenciales", r"credentials", r"mfa", r"2fa", r"otp",
        r"recuperar contrase[ñn]a", r"reset password",
    ]),
    "permissions": _compile_patterns([
        r"permiso", r"permission", r"rol", r"role", r"autorizaci[oó]n",
        r"authorization", r"acceso", r"access\s+control", r"admin",
        r"administrador", r"profile", r"perfil",
    ]),
    "validation": _compile_patterns([
        r"validar", r"validate", r"validaci[oó]n", r"validation",
        r"requerido", r"required", r"obligatorio", r"mandatory",
        r"formato", r"format", r"rango", r"range", r"longitud", r"length",
        r"m[aá]ximo", r"m[ií]nimo", r"max", r"min",
    ]),
    "crud": _compile_patterns([
        r"crear", r"create", r"editar", r"edit", r"actualizar", r"update",
        r"eliminar", r"delete", r"borrar", r"listar", r"list",
        r"guardar", r"save", r"registrar",
    ]),
    "search": _compile_patterns([
        r"buscar", r"search", r"b[uú]squeda", r"filtrar", r"filter",
        r"filtro", r"query", r"ordenar", r"sort",
    ]),
    "payment": _compile_patterns([
        r"pago", r"payment", r"cobro", r"charge", r"tarjeta", r"card",
        r"transferencia", r"transfer", r"monto", r"amount", r"factura",
        r"invoice", r"saldo", r"balance",
    ]),
    "notification": _compile_patterns([
        r"correo", r"email", r"notificaci[oó]n", r"notification",
        r"alerta", r"alert", r"sms", r"push", r"mensaj[ae]ría",
        r"recordatorio", r"reminder",
    ]),
    "integration": _compile_patterns([
        r"api", r"webhook", r"integraci[oó]n", r"integration",
        r"sap", r"jira", r"workday", r"oauth", r"saml",
        r"sincroniz", r"sync", r"externo",
    ]),
    "file_upload": _compile_patterns([
        r"subir(?:\s+archivo)?", r"upload", r"adjunto", r"attachment",
        r"csv", r"excel", r"\.xlsx", r"\.pdf", r"\.docx", r"descargar",
        r"download", r"importar", r"import", r"exportar", r"export",
    ]),
    "data_migration": _compile_patterns([
        r"migrar", r"migrate", r"migraci[oó]n", r"migration",
        r"sincronizaci[oó]n", r"data\s+migration",
        r"backfill", r"poblar", r"seed",
    ]),
    "reporting": _compile_patterns([
        r"reporte", r"report", r"dashboard", r"kpi", r"m[eé]trica",
        r"metric", r"gr[aá]fico", r"chart", r"resumen", r"summary",
    ]),
}


class ArchetypeDetector:
    """
    Stateless. Una sola operación pública: detect(story) → list[str].

    Reusable como singleton (no tiene I/O ni estado mutable).
    """

    def detect(self, story: UserStory) -> list[str]:
        """
        Devuelve hasta _MAX_ARCHETYPES archetypes que matchean en alguna parte
        del texto de la HU. Lista vacía si no matchea ninguno (lo cual es OK:
        el agente funciona igual, solo sin contexto extra del catálogo).

        Orden estable: respeta el orden de inserción de _ARCHETYPE_PATTERNS,
        para que dos llamadas con la misma HU devuelvan los archetypes en el
        mismo orden (importante para reproducibilidad y auditoría).
        """
        # Concatenamos los 3 campos. None safe.
        text = " ".join(filter(None, [
            story.title or "",
            story.description or "",
            story.acceptance_criteria or "",
        ]))
        if not text.strip():
            return []

        matched: list[str] = []
        for archetype, patterns in _ARCHETYPE_PATTERNS.items():
            if any(p.search(text) for p in patterns):
                matched.append(archetype)
                if len(matched) >= _MAX_ARCHETYPES:
                    break
        return matched

    @property
    def known_archetypes(self) -> list[str]:
        """Lista pública de los archetypes soportados (para validación/UI)."""
        return list(_ARCHETYPE_PATTERNS.keys())
