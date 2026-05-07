# Templates del Test Plan Generator (QA Hub)

Esta carpeta contiene una **copia** de los assets canónicos del QA Plan que viven en la **Propuesta 1 — Test Plan Generator** (`propuesta-1-test-plan/`).

| Archivo | Origen canónico | Propósito |
|---|---|---|
| `qa_plan_master.md` | `propuesta-1-test-plan/plantillas/qa_plan_master.md` | Plantilla maestra con placeholders `{{...}}` que el `TestPlanService` rellena |
| `placeholders.md` | `propuesta-1-test-plan/docs/placeholders.md` | Catálogo de referencia (qué placeholder existe, tipo de dato, validación) |

## Por qué hay copia y no symlink/import

QA Hub (`propuesta-2-test-manager/`) y el Test Plan Generator (`propuesta-1-test-plan/`) son **deliverables independientes** del repo. Si en el futuro se separan en repos distintos, esta copia no rompe nada.

## Cómo sincronizar cuando cambia la plantilla

La fuente de verdad sigue siendo **Propuesta 1**. Cuando el equipo actualiza la plantilla canónica:

```bash
cp propuesta-1-test-plan/plantillas/qa_plan_master.md \
   propuesta-2-test-manager/backend/app/templates/test_plan/qa_plan_master.md

cp propuesta-1-test-plan/docs/placeholders.md \
   propuesta-2-test-manager/backend/app/templates/test_plan/placeholders.md
```

Después, correr el smoke test del backend (`scripts/smoke_test_plan.py`) para validar que:

1. Todos los placeholders de la plantilla siguen mapeados a campos del schema `TestPlanCreate`.
2. Ningún placeholder nuevo quedó sin mapear (rompería la generación).
3. Ningún campo del schema dejó de tener placeholder en la plantilla (deuda muerta).

## Validación automática de drift

El módulo `app.services.test_plan_service` levanta `RuntimeError` al startup si detecta:

- Un `{{PLACEHOLDER}}` en la plantilla que no tiene mapping en `TestPlanCreate` schema.
- Un campo de schema que ya no aparece en la plantilla.

Esto previene divergencias silenciosas entre plantilla y schema cuando alguien sincroniza solo uno de los dos archivos.
