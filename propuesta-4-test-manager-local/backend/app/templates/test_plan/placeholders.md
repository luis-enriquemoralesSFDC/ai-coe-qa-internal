# Catálogo de Placeholders

Todos los campos variables de la plantilla canónica (`plantillas/qa_plan_master.md`). El agente de Cursor debe completar **solo** estos placeholders, sin modificar el resto del documento.

Existen **dos tipos** de marcadores en la plantilla:

| Tipo | Sintaxis | Cuándo se reemplaza | Ejemplo |
|---|---|---|---|
| **Variable de datos** | `{{NOMBRE}}` | El agente lo reemplaza al generar el `.md` (con valor real o con `[[PENDIENTE: ...]]` si falta el dato). | `{{CLIENT_NAME}}` → `Banco Demo` |
| **Pendiente del QA** | `[[PENDIENTE: NOMBRE]]` | El QA lo cierra manualmente en Google Docs después del export. | `[[PENDIENTE: Fecha de aprobación]]` |
| **Inserción manual permanente en Docs** | `[[PORTADA_*]]` | **Nunca lo reemplaza el agente.** Va literal en el `.md`; el QA inserta la imagen/contenido al pasar a Google Docs. | `[[PORTADA_LOGO_CLIENTE]]` |

> **Importante:** los `[[PORTADA_*]]` no son "datos faltantes" — siempre son inserción manual en Docs y el agente NO debe envolverlos en `[[PENDIENTE]]`.

---

## Portada (inserción manual en Google Docs)

Estos marcadores siempre aparecen literales en el `.md` generado y se reemplazan en Google Docs durante el export.

| Marcador | Descripción |
|---|---|
| `[[PORTADA_LOGO_CLIENTE: insertar logo del cliente aquí en Google Docs]]` | Logo del cliente que se inserta en la portada del Doc. |
| `[[PORTADA_IMAGEN: insertar imagen de portada aquí en Google Docs]]` | Imagen principal de portada (cover) del documento. |

> Después de insertar las imágenes, el QA debe agregar **Insert → Break → Page break** antes de `# Índice` para que la portada quede en página dedicada. Ver `docs/export-to-google-docs.md`.

---

## Encabezado del documento

| Placeholder | Descripción | Ejemplo |
| --- | --- | --- |
| `{{CLIENT_NAME}}` | Nombre oficial del cliente. Se usa en todo el documento. | `Banco Ejemplo S.A.` |
| `{{DOC_VERSION}}` | Versión del plan de pruebas. | `1.0` |
| `{{CONFIDENTIALITY_YEAR}}` | Año del aviso de confidencialidad. | `2026` |

## Sección 2 - Historial de versiones

| Placeholder | Descripción | Formato |
| --- | --- | --- |
| `{{VERSION_HISTORY_ROWS}}` | Una o más filas Markdown del historial. | `\| 1.0 \| DD/MM/YYYY \| Texto de cambio \| Autor \|` |

> Una fila por cada cambio relevante. Mínimo 1 fila.

## Sección 3 - Objetivo de Negocio

| Placeholder | Descripción |
| --- | --- |
| `{{BUSINESS_GOAL}}` | Párrafo(s) describiendo el objetivo de negocio según el SOW del proyecto. |

## Sección 4 - Alcance

| Placeholder | Descripción |
| --- | --- |
| `{{SOW_ID}}` | Identificador del SOW. |
| `{{SCOPE_OUT}}` | Bullets Markdown con lo que NO entra en alcance (integraciones, mobile, performance, etc.). Los entregables de QA que SÍ están en alcance son los 4 fijos listados arriba en la plantilla (plan, estáticas, casos manuales, métricas) y no son variables. |
| `{{TEST_MANAGEMENT_TOOL}}` | Herramienta de gestión de pruebas. Default: `JIRA`. |

## Sección 6 - Cronograma

| Placeholder | Descripción |
| --- | --- |
| `{{PROJECT_ROADMAP}}` | Texto, tabla o referencia a imagen con el roadmap del proyecto. Si es imagen, referenciar ruta. |
| `{{SPRINT_WEEKS}}` | Número de semanas por sprint. | `2` |

## Sección 7 - Estrategia de Ambientes

| Placeholder | Descripción | Ejemplo |
| --- | --- | --- |
| `{{ENV_DEV_NAME}}` | Nombre del ambiente de desarrollo. | `DEV01` |
| `{{ENV_QA_NAME}}` | Nombre del ambiente de QA. | `QA` |
| `{{ENV_SIT_NAME}}` | Nombre del ambiente SIT. | `SIT` |
| `{{ENV_UAT_NAME}}` | Nombre del ambiente UAT. | `UAT` |
| `{{DEPLOYMENT_FREQUENCY_ROWS}}` | Filas Markdown con responsables/frecuencias de despliegue. | `\| Salesforce DEV \| DEV01 \| QA \| Cada desarrollo \|` |

## Sección 8 - Herramientas

| Placeholder | Descripción |
| --- | --- |
| `{{DEFECT_MANAGEMENT_TOOL}}` | Herramienta de gestión de defectos. Default: `Complemento de JIRA (Zephyr, Xray, etc.)`. |
| `{{BROWSERS}}` | Navegadores soportados. Default: `Google Chrome`. |

## Sección 10 - Flujo de Historia de Usuario

| Placeholder | Descripción |
| --- | --- |
| `{{USER_STORY_LIFECYCLE}}` | Descripción o referencia al diagrama del ciclo de vida de la historia de usuario. |
| `{{SALESFORCE_CAPACITY}}` | Descripción de la división de capacidad del equipo por sprint. |

## Sección 14 - Suposiciones

| Placeholder | Descripción |
| --- | --- |
| `{{EXTRA_ASSUMPTIONS_ROWS}}` | Filas adicionales opcionales (A6, A7, ...). Dejar vacío si no hay. |

## Sección 15 - Riesgos y Dependencias

| Placeholder | Descripción |
| --- | --- |
| `{{EXTRA_RISKS_ROWS}}` | Filas **adicionales** opcionales (6, 7, ...) de riesgos específicos del cliente. La plantilla ya trae 5 riesgos baseline fijos (atraso, ambigüedad de requisitos, cambios frecuentes, falta de recursos, historias al final del sprint). Dejar vacío si no hay más. |
| `{{EXTRA_DEPENDENCIES_ROWS}}` | Filas **adicionales** opcionales de dependencias específicas del cliente. La plantilla ya trae 3 dependencias baseline (sistemas externos, datos UAT, ambientes a tiempo). Dejar vacío si no hay más. |

## Sección 16 - Aprobación

| Placeholder | Descripción |
| --- | --- |
| `{{APPROVALS_ROWS}}` | Filas con los aprobadores del plan. |

---

## Reglas de llenado

1. **No reordenar** placeholders, solo reemplazarlos.
2. **No tocar** texto fuera de los placeholders.
3. Todas las tablas se construyen agregando filas Markdown con `|` como separador.
4. Si el QA confirma "no aplica" para un bloque opcional (Mobile, API), se mantiene el texto base del bloque (es informativo), pero se pueden ajustar sus placeholders específicos.
5. Si falta un dato variable (`{{...}}`): se reemplaza por `[[PENDIENTE: <NOMBRE_PLACEHOLDER>]]`.
6. Los marcadores de portada (`[[PORTADA_*]]`) **se mantienen literales** en el `.md` final. **Nunca** se envuelven en `[[PENDIENTE]]` (no son datos faltantes; son inserción manual del QA en Docs).
