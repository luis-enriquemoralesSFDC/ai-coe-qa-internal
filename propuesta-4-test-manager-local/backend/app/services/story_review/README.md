# Story Review Agent — guía técnica

> Para QAs/usuarios finales, ver el `README.md` raíz del proyecto.
> Este archivo es para devs que vayan a tocar el código del agente.

## Qué es y qué NO es

`StoryReviewService` es un **orquestador determinístico** sobre los servicios
existentes. NO es un agente LLM clásico estilo ReAct: **no hay loop de
reasoning, no hay tool selection autónoma del LLM, no hay recursión**.

Es un pipeline lineal de 3 pasos que se presenta al QA con UX "tipo agente"
(timeline visual, steps trazables) sin asumir el riesgo de un agente real.

| Aspecto                    | Agente LLM clásico (ReAct)         | StoryReviewService             |
| -------------------------- | ---------------------------------- | ------------------------------ |
| Selección de tools         | LLM decide en runtime              | Pipeline fijo en código        |
| Recursión / loops          | Sí (puede iterar N veces)          | No, lineal                     |
| Cost predictability        | Difícil de capear                  | Cap claro: 1-2 LLM calls/run   |
| Cuota mensual              | Hay que reestructurar `UsageService` | Reusa el actual sin cambios    |
| Ownership / IDOR           | Cada tool debe revalidar           | Validado 1 vez en la route     |
| Trazabilidad para el QA    | Logs internos, hard de exponer     | `steps[]` tipado en response   |

## Arquitectura

```
POST /projects/{pid}/stories/{sid}/agent/review
        │
        ├─ get_current_user (JWT)
        ├─ _require_project (ownership)
        ├─ _limiter (rate limit)
        │
        ▼
StoryReviewService.review(story, user, max_cases, force_invest)
        │
        ├─ Step 1: INVEST
        │   └─ InvestService.analyze_and_save (skip si ya existe)
        │       └─ ensure_within_budget(user) → QuotaExceeded → 429
        │
        ├─ Step 2: Detección de contexto (sin LLM, sin cuota)
        │   ├─ ArchetypeDetector.detect(story)
        │   └─ EdgeCaseCatalog.lookup(archetypes)
        │
        ├─ Step 3: Generate con contexto
        │   └─ TestCaseService.generate_for_story_with_context
        │       ├─ ensure_within_budget(user)
        │       ├─ OpenAITestCaseGenerator.generate_with_context
        │       │   └─ _context_tc_user_prompt (sanitizado, wrapped)
        │       └─ usage_service.record(user.id, usage)
        │
        └─ Persistir archetypes, edge_cases_baseline, last_review_at en BD
```

## Componentes

| Archivo                          | Responsabilidad                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `archetype_detector.py`          | Regex sobre title+desc+AC. 11 archetypes, cap 5/HU. Sin LLM, sin estado.        |
| `edge_case_catalog.py`           | Dict curado: archetype → list de escenarios baseline. ~40 escenarios.           |
| `story_review_service.py`        | Orquestador de los 3 steps. Idempotente en INVEST. Sin PII en logs/response.    |

Todo lo demás (provider, testcase_service, route, schemas, DI) son extensiones
aditivas a archivos existentes; no hay nada nuevo fuera de este folder.

## Decisiones de diseño

### 1. ¿Por qué el catálogo de archetypes y edge cases NO viene del LLM?

**Hallucination y costo.** Si pedimos al LLM que clasifique la HU y luego nos
sugiera escenarios, en cada call:

- Inventa archetypes nuevos cada vez (ruido).
- Sugiere escenarios distintos en cada run (no reproducible).
- Cobra tokens por algo que es un lookup determinístico.

El detector regex + catálogo curado da **0 ms de latencia, 0 USD, 0 hallucination,
output 100% reproducible**. El LLM solo se usa donde aporta valor real:
generar los casos de prueba con contexto.

### 2. ¿Por qué `generate_with_context` y no extender `generate`?

ISP (Interface Segregation). Mocks y providers alternativos que solo necesitan
el path básico no se ven forzados a implementar el path enriquecido. Si un
provider futuro no implementa `generate_with_context`, el service detecta con
`hasattr` y cae al `generate` clásico (degradación elegante, ver
`testcase_service.py`).

### 3. ¿Por qué la response no incluye PII?

Defensa en profundidad. La response viaja por:

- Logger del service (no debe loguear PII).
- Logger del LLM provider (`_log_call` ya solo guarda `repr(title)[:80]`).
- Middlewares de FastAPI / slowapi.
- Cliente del frontend (puede quedar en sessionStorage).
- Eventualmente, posibles logs de Heroku / monitoreo externo.

Cuanto menos PII viaje, menos blast radius si algo falla. El frontend re-fetch
la HU si necesita esos campos (ya están en BD bajo el mismo control de
ownership).

### 4. ¿Por qué INVEST se skipea en re-runs?

INVEST sobre la misma HU da el mismo análisis (es semánticamente determinístico
sobre el mismo input). Re-correrlo cobra cuota innecesaria. El QA puede forzarlo
con `force_invest: true` si actualizó la HU y quiere refrescarlo.

### 5. ¿Por qué el endpoint es síncrono y no SSE?

Para v0.1, simpler is better. El response llega en 5-15 segundos (1-2 LLM calls
sequential). El modal del frontend muestra "loading" mientras tanto. Para v0.2
se puede cambiar a SSE sin romper el frontend si mantenemos el mismo schema de
`steps` en los eventos.

### 6. ¿Por qué los singletons del catálogo y detector?

Ambos son stateless e idempotentes (no tienen IO, no tienen mutable state).
Compartirlos entre requests evita la sobrecarga de recompilar regex en cada
request. Ver `dependencies.py:_archetype_detector`, `_edge_case_catalog`.

## Defensa anti-prompt-injection

Aunque `archetypes` y `edge_cases_baseline` vienen de **código nuestro** (no
de input del QA), el prompt enriquecido los sanitiza igual. Defensa en
profundidad para futuro:

- Si alguien permite editar el catálogo vía API → ya estamos cubiertos.
- Si una migración futura corrompe la columna `archetypes` con basura → no
  rompe el LLM.
- Si `invest_summary` viene de un análisis LLM previo manipulado por una HU
  injectada → la sanitización lo neutraliza antes de re-inyectarlo.

Ver `_context_tc_user_prompt` en `app/providers/openai_provider.py`. Cada
string pasa por `sanitize_user_text` con cap individual y todo el bloque se
envuelve en `<<<CONTEXT_ENRICHED>>>...<<<END_CONTEXT_ENRICHED>>>` para que el
system prompt sepa que es DATO, no instrucciones.

## Cómo agregar un archetype nuevo

1. En `archetype_detector.py:_ARCHETYPE_PATTERNS`, agregar entrada:
   ```python
   "mi_archetype": _compile_patterns([r"keyword1", r"keyword2", ...]),
   ```
2. En `edge_case_catalog.py:_CATALOG`, agregar lista de escenarios:
   ```python
   "mi_archetype": [
       EdgeCaseScenario(id="mi_archetype.x", name="...", rationale="...", severity="..."),
       ...
   ],
   ```
3. Agregar test en `tests/test_story_review.py` que verifique la detección
   con una HU típica del archetype.

No hace falta migration ni cambios en el frontend (los muestra como string).

## Tests

- **Unitarios** (`tests/test_story_review.py`, 20 tests, ~100ms):
  detector, catálogo, sanitización del prompt enriquecido. Cero red.
- **Integración** (`tests/test_agent_review_integration.py`, 5 tests, ~2s):
  endpoint completo con AsyncMock de los providers OpenAI. Verifica auth,
  ownership cross-user, cuota → 429, no-PII, idempotencia INVEST.

Correr todo el pack del agente:
```bash
pytest tests/test_story_review.py tests/test_agent_review_integration.py -v
```

## Métricas que vale la pena monitorear

Estos campos ya están en logs estructurados (`_log_call`):

- `with_context=True` en operaciones `tc_generate_single` → muestra qué % de
  generaciones usan el agente vs el flujo clásico.
- `archetypes_count`, `baseline_count` → distribución de complejidad por HU.
- `latency_ms` por step → si INVEST se vuelve cuello de botella, vale la pena
  paralelizar steps 1 y 2.
- `cost_usd` por run del agente → comparar con el flujo clásico para validar
  ROI del contexto enriquecido.

## Roadmap obvio (cuando haya tiempo)

- **SSE en lugar de response síncrono**: el frontend ya está estructurado para
  recibir steps; solo cambia el transporte.
- **Persistir runs del agente en una tabla `agent_runs`**: histórico por HU,
  comparativa antes/después, retry de runs fallidos.
- **Catálogo de archetypes editable por admins**: convertir el dict en tabla
  BD. Cuando se haga, asegurar que la sanitización defensiva del prompt
  enriquecido sigue activa (ya está prep para esto).
- **A/B switch en runtime**: feature flag para A/B test de quality (flujo
  clásico vs agente) sobre HUs reales con el mismo QA.
