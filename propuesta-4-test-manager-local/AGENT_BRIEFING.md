# AGENT BRIEFING — QA Test Manager (versión local)

> **Hola, agente.** Este archivo es tu manual de bienvenida al repo. Léelo COMPLETO antes de tocar cualquier cosa. Cuando termines, dime "ya leí el briefing" y resume en 5 bullets qué entendiste, así verifico que estamos en la misma página antes de empezar.
>
> Este archivo es **temporal**: una vez que ya entendiste el repo y nos pusimos a trabajar, lo voy a borrar. No lo cuides como si fuera código de producción.

---

## Tabla de contenidos

1. [Quién soy yo y por qué estoy aquí](#1-quién-soy-yo-y-por-qué-estoy-aquí)
2. [Qué es esta app, en 60 segundos](#2-qué-es-esta-app-en-60-segundos)
2.5 [⚡ Si me pides "instala y arranca por mí", ve a la sección 13.1.bis](#131bis-instala-y-arranca-la-app-por-mí-modo-automatizado-no-interactivo)
3. [El problema real que resuelve](#3-el-problema-real-que-resuelve)
4. [Para quién es esta app](#4-para-quién-es-esta-app)
5. [Por qué existe una "versión local" además de la cloud](#5-por-qué-existe-una-versión-local-además-de-la-cloud)
6. [Genealogía: de dónde vino este repo](#6-genealogía-de-dónde-vino-este-repo)
7. [Qué hace, feature por feature](#7-qué-hace-feature-por-feature)
8. [Los 3 agentes de IA que viven adentro](#8-los-3-agentes-de-ia-que-viven-adentro)
9. [Stack técnico completo](#9-stack-técnico-completo)
10. [Estructura del repo (mapa de archivos)](#10-estructura-del-repo-mapa-de-archivos)
11. [Cómo arranca la app](#11-cómo-arranca-la-app)
12. [Reglas del juego para ti, agente](#12-reglas-del-juego-para-ti-agente)
13. [Tareas típicas que probablemente te pediré](#13-tareas-típicas-que-probablemente-te-pediré)
14. [Glosario rápido](#14-glosario-rápido)
15. [Lo que NO sabemos todavía / decisiones pendientes](#15-lo-que-no-sabemos-todavía--decisiones-pendientes)
16. [Cuando termines de leer](#16-cuando-termines-de-leer)

---

## 1. Quién soy yo y por qué estoy aquí

Soy **Luis Morales**, QA Manual en Salesforce, parte del **CoE (Center of Excellence) de QA**. Mi trabajo es asegurar la calidad del software, principalmente en proyectos basados en Salesforce: validar historias de usuario, escribir y ejecutar casos de prueba, gestionar reportes de bugs y entregar evidencia.

**No soy desarrollador full-time.** Soy un QA que está aprendiendo a usar IA (vibe coding con Cursor) para acelerar mi trabajo. Eso significa:

- Te voy a pedir cosas en lenguaje natural, no siempre con jerga técnica perfecta.
- Si algo es ambiguo, **pregúntame antes de asumir**. Mejor un turno extra de pregunta que un commit equivocado.
- Si algo que te pido es una mala idea, **dímelo**. Prefiero un agente honesto que uno que ejecuta a ciegas.
- Si algo que te pido va a romper algo más en el repo, **frena y avísame**.

---

## 2. Qué es esta app, en 60 segundos

**Una plataforma web que vive en mi laptop** y me ayuda a hacer mi trabajo de QA con IA. Concretamente:

1. Le pego (o subo en PDF/DOCX/TXT) una **historia de usuario** del backlog de un proyecto.
2. La app me dice si la HU está bien escrita usando criterio **INVEST** (Independent, Negotiable, Valuable, Estimable, Small, Testable).
3. La IA me genera **casos de prueba** automáticamente: flujo principal, flujos alternativos, casos negativos y edge cases.
4. Yo edito/ajusto los casos en una matriz visual, los marco como pasados/fallidos, y los exporto a Excel.
5. También gestiono reportes de bugs por sprint y veo KPIs de calidad (FPY, severidad, efectividad de test cases).

Encima de eso hay **3 agentes de IA** específicos (no es solo "un chatGPT genérico embebido"): un revisor de HUs, un coach que llena un Test Plan paso a paso, y un chatbot Q&A que responde dudas sobre el proyecto activo. Más detalle en la sección 8.

**Resultado**: lo que me tomaba 2-3 horas escribir a mano (analizar HU + redactar 5-8 casos de prueba bien estructurados) ahora me toma 5-15 minutos revisar lo que la IA propone.

---

## 3. El problema real que resuelve

El día a día de un QA Manual sin esta app:

- **Recibe una HU mal escrita** (sin criterios de aceptación claros, ambigua, demasiado grande). Pierde tiempo yendo y viniendo con el PO o el dev para entenderla. INVEST le ayudaría a detectar esto al toque, pero hacerlo a mano por cada HU es tedioso.
- **Escribe casos de prueba desde cero** copiando un template en Excel o Jira. Olvida casos negativos, edge cases o validaciones obvias (ej: ¿qué pasa si el campo está vacío? ¿si tiene caracteres raros? ¿si el timeout falla?). La cobertura depende de cuánto descansó la noche anterior.
- **Re-escribe los mismos patrones**: validación de email, login con MFA, subida de archivos, integración con API externa. Cada QA del equipo reinventa la rueda.
- **El Test Plan oficial es un documento de 16 secciones** que casi nadie llena bien porque es aburrido y no hay guía paso a paso.
- **Cuando llega un bug, no hay trazabilidad** entre el bug y el caso de prueba que debió haberlo cazado. Las métricas de "efectividad de la batería de pruebas" son adivinanza.

Esta app ataca todo lo de arriba con IA + heurística determinística + plantillas curadas por QAs senior.

---

## 4. Para quién es esta app

**Yo principalmente** — un QA Manual no técnico, en su Mac, trabajando en proyectos de Salesforce.

**Otros QAs internos** del CoE pueden adoptarla bajándose el repo, corriendo `./setup.sh` y poniendo su propia API key del SFR Gateway. Cada QA tiene su propia BD SQLite local y sus propios proyectos. Nada se comparte entre QAs (a propósito — esta es la versión local, ver sección 5).

**No es para**:
- Equipos que necesiten colaborar en tiempo real sobre el mismo proyecto → usen la versión cloud (Heroku) que vive en otro repo.
- Devs que escriben tests automatizados (unit/integration/e2e) → esta app es para **QA manual**, no para code-coverage de Jest.
- Stakeholders no-QA → la UI es de QA para QA.

---

## 5. Por qué existe una "versión local" además de la cloud

Existen **dos sabores** del producto:

| | Versión cloud (Heroku) | Versión LOCAL (este repo) |
|---|---|---|
| Dónde corre | `qa-hub.herokuapp.com` o similar | En la laptop del QA (`localhost`) |
| Multi-usuario | Sí, varios QAs comparten la misma instancia | No, 1 QA por instancia |
| Base de datos | Postgres (Heroku addon) | SQLite (`backend/qa_manager.db`) |
| Auth | JWT, registro, login, admin panel | JWT pero pensado para 1 user (puede simplificarse) |
| Cuota mensual de IA | `$100 USD/user/mes`, hard cap | `$0` = sin límite (la cuota real la decide el SFR Gateway) |
| Rate limiting | `120 req/min/user` | Casi irrelevante (1 user en localhost) |
| Despliegue | `Procfile`, `app.json`, `gunicorn` | `start.sh` directo |
| Quién la mantiene | El equipo que cuida el deploy | Yo, el QA, en mi laptop |

**Por qué hay dos**: la cloud tiene fricción (alguien tiene que pagar Heroku, gestionar usuarios, lidiar con multi-tenancy y compliance). La local no tiene esa fricción — el QA se la baja, mete su key del SFR Gateway, y está corriendo en 10 minutos sin pedirle permiso a nadie.

**La cloud sigue existiendo y va por su camino en otro repo.** Este repo NUNCA va a Heroku. Si encuentras código que parece "preparado para Heroku", probablemente sea residuo de la copia inicial — pregúntame antes de borrar.

---

## 6. Genealogía: de dónde vino este repo

Para que entiendas el contexto histórico cuando aparezcan referencias raras:

1. **Repo padre**: `qa-ai-coe-internal` (monorepo interno con 4 propuestas de productos QA con IA).
2. Dentro del padre vivían:
   - `propuesta-1-test-plan/` → skills de Cursor para generar test plans tipo documento.
   - `propuesta-2-test-manager/` → la **app web cloud** (Heroku). El padre directo de este repo.
   - `propuesta-3-invest-skill/` → skill de Cursor para análisis INVEST suelto.
   - `propuesta-4-test-manager-local/` → **fork limpio de la `propuesta-2`, adaptado para Mac single-user**. Lo que ahora estás viendo.
3. **Operación de fork** (ya hecha):
   - Copia con `rsync` excluyendo `venv/`, `node_modules/`, `__pycache__/`, `.pytest_cache/`, `*.db`, `.env`, `dist/`, `.DS_Store`.
   - Reescritos manualmente: `setup.sh` (nuevo), `start.sh`, `backend/.env.example`, `README.md`.
   - Resto del código: idéntico a `propuesta-2-test-manager/` al momento del fork.
4. **Este repo** = el contenido de `propuesta-4-test-manager-local/` movido a la raíz de un repo nuevo + `git init` + primer commit.

**Cosas a tener en cuenta por el origen**:

- Todavía hay código del lado cloud que **no aplica** en local (admin panel, sistema de cuotas mensuales, rate limiting agresivo, registro de usuarios, etc.). No está mal — solo está de más. Cuando yo decida limpiarlo te pediré que lo hagas con cuidado.
- Algunas migraciones de Alembic vienen de la era cloud (ej: `b7d2e1f4a890_add_admin_and_usage.py`). **NO las modifiques retroactivamente**: para cualquier cambio de schema, una migración nueva encima.
- El `README.md` y `backend/.env.example` ya fueron adaptados a la versión local (Mac, SFR Gateway, sin Heroku). El resto del código todavía habla "cloud" en algunos lugares.

---

## 7. Qué hace, feature por feature

### 7.1 Análisis INVEST de historias de usuario

Pego una HU y la app me devuelve:
- **Score por criterio** (Independent, Negotiable, Valuable, Estimable, Small, Testable) en escala 0-10.
- **Score global**.
- **Sugerencias específicas** por criterio bajo (ej: "Esta HU no es Testable porque no define qué significa 'rápido' en el criterio de aceptación 3").
- Output garantizado válido (Structured Outputs estrictos de OpenAI).

Endpoint: `POST /api/projects/{pid}/stories/{sid}/invest/analyze`
Servicio: `backend/app/services/invest_service.py`

### 7.2 Generación de casos de prueba (modo clásico)

Botón **"Generar casos"** en la página de la HU. La IA propone:
- Caso de flujo principal.
- Casos de flujos alternativos.
- Casos negativos (qué pasa si falla).
- Edge cases (límites, valores extremos, concurrencia).

Cada caso trae: título, precondiciones, pasos numerados, resultado esperado, prioridad, tipo (funcional/UI/seguridad/etc).

Endpoint: `POST /api/projects/{pid}/stories/{sid}/test-cases/generate`
Servicio: `backend/app/services/testcase_service.py`

### 7.3 QA Agent — revisión enriquecida (modo recomendado)

Botón **"Revisar con QA Agent"**. Pipeline determinístico de 3 pasos en lugar de un solo prompt:

1. **Análisis INVEST** (idempotente: si ya existe, lo reusa).
2. **Detección de archetypes** con regex (`auth`, `validation`, `payment`, `file_upload`, etc.) + lookup de un **catálogo curado de edge cases** por tipo. Esto pasa **sin llamar al LLM** (ahorra costo).
3. **Generación con contexto**: la IA recibe la HU + INVEST + archetypes detectados + baseline de casos obligatorios. Resultado: cobertura mejor, menos huecos.

Costo típico: $0.005 - $0.020 USD por HU.

Endpoint: `POST /api/projects/{pid}/stories/{sid}/agent/review`
Servicio: `backend/app/services/story_review/story_review_service.py`

### 7.4 Test Plan Coach — wizard conversacional

Página `/test-plans/{id}/coach`. Un chat estructurado donde el agente me pregunta sección por sección y va llenando un **wizard de 16 secciones** (alcance, riesgos, dependencias, herramientas, ambientes, etc.). Cuando termina, el botón "Generar" produce un Markdown formal a partir de la plantilla `qa_plan_master.md`.

Hay un **policy engine determinístico** (`test_plan_policies.py`, sin LLM) que valida reglas duras (`client_name` no vacío, `sow_id` con formato correcto, etc.) y bloquea la generación si no se cumplen.

Endpoints: `POST /api/test-plans/{id}/coach/start`, `POST /api/test-plans/{id}/coach/turn`
Servicio: `backend/app/services/test_plan_coach_service.py`

### 7.5 Project Chat — Q&A flotante

FAB (botón flotante) en `ProjectPage` y `StoryPage`. Abre un drawer con un chatbot al estilo "ChatGPT del proyecto": responde preguntas sobre el proyecto activo, las HUs, los casos. **No modifica nada**, solo responde.

Endpoint: `POST /api/projects/{pid}/chat/messages`
Servicio: `backend/app/services/project_chat_service.py`

### 7.6 Importación de HUs

Pego varias HUs en formato `ID | Título | Descripción | Criterios` o subo PDF/DOCX/TXT. La app hace el parsing y crea las HUs en bulk.

Servicio: `backend/app/services/document_service.py`

### 7.7 KPIs y bugs por sprint

Página **Métricas**: subo un reporte de bugs (CSV/JSON), lo vinculo a HUs/TCs, y veo:
- **FPY** (First Pass Yield): % de HUs que pasaron QA a la primera.
- **Severidad**: distribución de bugs por nivel.
- **Efectividad de TC**: % de bugs que un TC ya cubría vs los que se escaparon.

Endpoints: `routes/kpis/`
Servicios: `services/kpis/`, `services/document_service.py` (para parsing de bugs).

### 7.8 Exportación a Excel

Botón "Exportar". Descarga la matriz completa formateada en `.xlsx`.

Endpoint: `routes/export.py`
Servicio: `services/export_service.py`

### 7.9 Logging de costo y trazabilidad de IA

Cada llamada a la IA queda loggeada como una línea estructurada:
```
[ai_call] op=invest_analyze model=gpt-4o-mini status=ok tokens_in=890 tokens_out=412 cost_usd=0.0015 latency_ms=2103
```
Y persistida en la tabla `ai_usage` (modelo `AiUsage`).

---

## 8. Los 3 agentes de IA que viven adentro

Importante: cuando yo digo "el agente" puedo referirme a tres cosas distintas. No te confundas:

| Yo digo | Es realmente | Endpoint | Botón / UI |
|---|---|---|---|
| "QA Agent" | **Story Review Agent** | `POST /api/projects/{pid}/stories/{sid}/agent/review` | Botón "Revisar con QA Agent" en `StoryPage` |
| "QA Coach" / "Coach" | **Test Plan Coach** | `POST /api/test-plans/{id}/coach/turn` | Página `TestPlanCoachPage` |
| "Chat" / "el bot" | **Project Chat Assistant** | `POST /api/projects/{pid}/chat/messages` | FAB flotante (`ProjectChatDrawer`) |

Diferencias clave:

- **Story Review Agent** = pipeline DETERMINÍSTICO de 3 pasos (INVEST → context detection con regex → generación con contexto). 1-2 calls a OpenAI por corrida.
- **Test Plan Coach** = LLM con **Structured Outputs** + policy engine determinístico encima. Cada turno devuelve un `next_action` tipado (`ask_text`, `ask_picklist`, `confirm_value`, `set_field`, etc.) que el frontend renderiza como widgets.
- **Project Chat Assistant** = LLM con texto libre, SIN Structured Outputs. Solo responde preguntas, no escribe a la DB del proyecto.

Detalle técnico completo en `docs/architecture.md` (diagramas mermaid). Léelo si vas a tocar código de cualquiera de los 3 agentes.

---

## 9. Stack técnico completo

### Backend

- **Python 3.11+**
- **FastAPI** (routing, OpenAPI docs en `/docs`)
- **SQLAlchemy 2.0** (ORM)
- **Alembic** (migraciones — auto-aplicadas al boot)
- **Pydantic v2 + pydantic-settings** (config y schemas)
- **slowapi** (rate limiting por user, vía JWT `sub`)
- **bcrypt** (hash de passwords)
- **python-jose** (JWT HS256)
- **OpenAI SDK** (`AsyncOpenAI`, lazy singleton)
- **pdfplumber, python-docx** (lectura de archivos)
- **openpyxl** (export a Excel)

### Frontend

- **React 18**
- **Vite** (dev server + build)
- **TypeScript**
- **React Router 6**
- **TanStack Query (React Query)** (cache de servidor)
- **axios** (HTTP, baseURL `/api`, interceptor JWT)
- **Tailwind CSS** (estilos)
- **clsx** (concat de clases)

### Persistencia

- **SQLite** (default local, archivo `backend/qa_manager.db`).
- **11 tablas**: `users`, `ai_usage`, `projects`, `user_stories`, `test_cases`, `bug_reports`, `bugs`, `test_plans`, `test_plan_coach_messages`, `project_chat_messages`, `alembic_version`.
- **7 migraciones** en `backend/alembic/versions/`.

### IA

- **Provider abstracto** (`backend/app/interfaces/ai_provider.py` — Protocols).
- **Provider concreto**: `OpenAIProvider` (`backend/app/providers/openai_provider.py`). Soporta auto-detección entre OpenAI directo y SFR Gateway por el prefijo de la key.
- **En esta versión local**: SOLO SFR Gateway (key sin prefijo `sk-` + `OPENAI_BASE_URL`).
- **Modelos soportados** (allowlist en `_pricing.py`): `gpt-4o`, `gpt-4o-2024-08-06`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `o1`, `o1-mini`, `o3-mini`. Default actual: `gpt-4o-mini`.
- **Trust Layer del Gateway** (opcional): bias, toxicity, prompt-injection.
- **Antiprompt-injection**: `sanitize_user_text` + `wrap_user_input` antes de mandar texto del usuario al LLM.
- **Zero retention**: `store=false` en cada request a OpenAI.

### Deploy / arranque

- **Solo local en Mac.** No Heroku, no Docker (todavía), no CI.
- `./setup.sh` instala todo. `./start.sh` arranca backend `:8000` + frontend `:5173`.

---

## 10. Estructura del repo (mapa de archivos)

```
.
├── AGENT_BRIEFING.md            ← este archivo (temporal, lo voy a borrar después)
├── README.md                    ← onboarding del QA usuario final
├── setup.sh                     ← instalador interactivo Mac (Python+Node+venv+npm+.env)
├── start.sh                     ← arranque (con pre-flight checks)
├── .gitignore                   ← cubre .env, *.db, venv, node_modules, etc.
├── backend/
│   ├── .env.example             ← template del .env con MEGA WARNING (NO copies a .env, lo hace setup.sh)
│   ├── alembic.ini              ← config de migraciones
│   ├── alembic/
│   │   └── versions/            ← 7 migraciones, NO las modifiques retroactivamente
│   ├── app/
│   │   ├── main.py              ← punto de entrada FastAPI + auto-migración Alembic al boot
│   │   ├── config.py            ← Settings con pydantic-settings + validators
│   │   ├── database.py          ← engine + Session
│   │   ├── dependencies.py      ← inyección de dependencias (DB, current_user, services)
│   │   ├── logging_config.py
│   │   ├── models.py            ← 12 clases SQLAlchemy + 2 enums (TestStatus, Priority)
│   │   ├── schemas.py           ← schemas Pydantic (28KB, todos los DTOs)
│   │   ├── auth/                ← JWT, password hashing, get_current_user
│   │   ├── interfaces/
│   │   │   └── ai_provider.py   ← Protocols (DIP) — IInvestAnalyzer, ITestCaseGenerator, etc.
│   │   ├── providers/
│   │   │   ├── openai_provider.py  ← provider concreto (todas las clases AI)
│   │   │   └── _pricing.py         ← tabla de precios por modelo
│   │   ├── readers/             ← lectores de PDF/DOCX/TXT
│   │   ├── repositories/        ← 8 repositorios SQLAlchemy (defense in depth: doble filtro user_id)
│   │   ├── routes/              ← 9 routers REST
│   │   │   ├── admin.py         ← admin panel (puede simplificarse en local)
│   │   │   ├── export.py
│   │   │   ├── kpis/
│   │   │   ├── project_chat.py  ← endpoint del Agente 3
│   │   │   ├── projects.py
│   │   │   ├── stories.py       ← incluye endpoint /agent/review (Agente 1)
│   │   │   ├── test_cases.py
│   │   │   ├── test_plan_coach.py  ← endpoints del Agente 2
│   │   │   └── test_plans.py
│   │   ├── services/            ← lógica de negocio
│   │   │   ├── document_service.py
│   │   │   ├── export_service.py
│   │   │   ├── invest_service.py
│   │   │   ├── kpis/
│   │   │   ├── project_chat_service.py
│   │   │   ├── story_review/    ← Agente 1: orquestador, archetype_detector, edge_case_catalog
│   │   │   ├── test_plan_coach_service.py
│   │   │   ├── test_plan_policies.py  ← policy engine sin LLM
│   │   │   ├── test_plan_service.py   ← genera el .md final desde plantilla
│   │   │   ├── testcase_service.py
│   │   │   └── usage_service.py       ← cuotas mensuales (puede simplificarse en local)
│   │   └── templates/
│   │       └── test_plan/
│   │           ├── qa_plan_master.md  ← plantilla canónica de 16 secciones
│   │           └── placeholders.md     ← lista de placeholders permitidos
│   ├── pytest.ini
│   ├── requirements.txt
│   ├── scripts/
│   │   └── create_admin.py      ← útil de cloud, posiblemente irrelevante en local
│   └── tests/                   ← suite de pytest (8 archivos)
├── docs/
│   └── architecture.md          ← diagramas mermaid (LÉELO si vas a tocar código de IA)
└── frontend/
    ├── index.html
    ├── package.json
    ├── package-lock.json
    ├── postcss.config.js
    ├── tailwind.config.js
    ├── tsconfig*.json
    ├── vite.config.ts
    └── src/
        ├── api/                 ← clientes axios
        ├── components/          ← Layout, InvestBadge, ProjectChatDrawer, AgentReviewModal, etc.
        ├── hooks/               ← useAuth, etc.
        ├── pages/               ← 11 páginas (ver lista en sección 11)
        ├── store/               ← state global (Zustand o similar)
        ├── App.tsx
        ├── main.tsx
        └── index.css
```

---

## 11. Cómo arranca la app

### Primer arranque

```bash
./setup.sh
```

Esto verifica `python3.11+` y `node 18+`, crea `backend/venv`, corre `pip install`, corre `npm install` en `frontend/`, y al final me pregunta de forma interactiva mi key del SFR Gateway (lectura silenciosa, no se muestra en terminal). El `.env` se genera con la key + URL del gateway por mí.

### Arranque normal (después del primero)

```bash
./start.sh
```

Pre-flight checks que aborta si:
- `backend/venv/` no existe → "corre setup.sh".
- `frontend/node_modules/` no existe → "corre setup.sh".
- `backend/.env` no existe o tiene la key placeholder.

Si pasa, levanta:
- Backend: `uvicorn app.main:app --reload --port 8000` con `source venv/bin/activate`.
- Frontend: `npm run dev` (Vite, puerto 5173).
- Ambos en background, `wait` espera, `Ctrl+C` los mata a ambos via trap.

### Páginas del frontend (rutas de React Router)

| Ruta | Página | Qué hace |
|---|---|---|
| `/login` | `LoginPage.tsx` | Login con email/password |
| `/register` | `RegisterPage.tsx` | Registro |
| `/dashboard` | `DashboardPage.tsx` | Lista de proyectos del usuario |
| `/projects/:id` | `ProjectPage.tsx` | Detalle de proyecto + lista de HUs |
| `/projects/:id/stories/:sid` | `StoryPage.tsx` | Detalle de HU + casos + botones IA |
| `/metrics` (o similar) | `MetricasPage.tsx` | KPIs y gestión de bugs |
| `/test-plans` | `TestPlanListPage.tsx` | Lista de Test Plans |
| `/test-plans/:id` | `TestPlanViewPage.tsx` | Vista de TP |
| `/test-plans/:id/wizard` | `TestPlanWizardPage.tsx` | Wizard de 16 secciones |
| `/test-plans/:id/coach` | `TestPlanCoachPage.tsx` | Chat del Coach (Agente 2) |
| `/admin` | `AdminPage.tsx` | Panel de admin (probablemente irrelevante en local) |

---

## 12. Reglas del juego para ti, agente

### Reglas DURAS (no negociables)

1. **NUNCA commitees secretos.** El `backend/.env` está en `.gitignore`, pero verifica antes de cualquier `git add` que no se cuele. Si vas a hacer un commit, primero `git status` y `git diff --cached` para auditarlo.
2. **NUNCA inventes archivos ni rutas que no veas.** Si dudas si algo existe, listalo (`ls`) o léelo (`Read`). Inventar imports rompe builds y me hace perder horas.
3. **NUNCA modifiques migraciones existentes** de Alembic. Para cualquier cambio de schema → migración nueva encima.
4. **Esta app NO va a Heroku.** Si me ves agregando `Procfile`, `app.json`, `gunicorn`, `runtime.txt`, párame.
5. **macOS only.** No agregues scripts `.bat` ni `.ps1` salvo que yo lo pida explícitamente.
6. **Solo soportamos SFR Gateway** (key sin prefijo `sk-`). NO agregues docs ni flujos para "OpenAI directo" personal salvo que yo lo pida.
7. **Single-user en mente.** Cuando toques auth, asume 1 user en localhost. No optimices para multi-tenancy.
8. **NUNCA borres data sin confirmar.** Si una operación toca `*.db`, me preguntas primero. Lo mismo con cualquier `git reset --hard`, `rm -rf` agresivo, o force-push.

### Reglas BLANDAS (preferencias fuertes)

1. **Antes de un cambio grande**, hazme un plan corto: qué archivos vas a tocar, qué tests podrían romperse, cuánto tarda. Yo digo "go" y ejecutas.
2. **Después de un cambio**, corre `git status` y muéstrame qué quedó modificado.
3. **Cuando tengas dudas** entre dos formas de hacer algo, **pregúntame** (con `AskQuestion` si la tienes). No adivines.
4. **Comentarios solo cuando aporten contexto no-obvio.** No quiero `// Importa el módulo` antes de un import. Comentarios sí cuando explican un trade-off, una decisión histórica o un workaround.
5. **No me expliques cosas básicas** que ya entiendo (qué es Python, qué es React, qué es git). Sé conciso. Si dudas si lo entiendo, pregúntame antes de explicar.
6. **No me hagas perder tiempo con yapping**. Si la respuesta es "lo cambié, listo", no me escribas 3 párrafos.
7. **Cuando uses la terminal**, prefiere comandos explicables (no `sed` ni `awk` mágicos). Si necesitas `sed`, comenta qué hace.
8. **Idioma**: yo escribo en español. Tú respondes en español. Los nombres de variables/funciones en inglés (es la convención del codebase actual).

### Cómo me gusta trabajar

- **Modo Coach + Estricto**: si veo algo mal, dímelo. Si me equivoco, corrígeme. Pero si todo está bien, no me sermonees.
- **Sin emojis** salvo que yo los use primero.
- **Markdown bien formateado**, tablas cuando aplique, listas cuando aplique. Pero sin abusar.
- **Decisiones de producto** (qué simplificar, qué agregar, qué prioridad) son MÍAS. Tú implementas y opinas, no decides solo.

---

## 13. Tareas típicas que probablemente te pediré

Estas son las cosas que más probable van a salir en los primeros días. Familiarízate.

### 13.1 "Probemos que la app arranca"

Pasos esperados:
1. Verifico que `setup.sh` y `start.sh` sean ejecutables (`ls -la *.sh`).
2. Yo corro `./setup.sh` en mi terminal (no lo corras tú, necesita stdin para mi key).
3. Cuando termine, yo corro `./start.sh`.
4. Si algo falla, te paso el error y vemos.

### 13.1.bis "Instala y arranca la app por mí" (modo automatizado, no-interactivo)

Este es el caso en que YO o cualquier QA Manual te dice algo como:

> "Hola, instala la app y arráncala. Soy QA, no quiero ver código."

**El `setup.sh` ya está preparado para este caso.** Soporta modo no-interactivo vía variable de entorno `SFR_API_KEY`. NO uses el modo interactivo (`./setup.sh` a secas) porque se cuelga esperando un `read -s` que no puedes alimentar desde tu shell.

Sigue este protocolo, en este orden:

1. **Saluda y verifica intención**. Una sola pregunta corta: "¿Tienes tu API key del SFR Gateway en mano? Si no, dime para indicarte dónde conseguirla". Si no la tiene → para acá, dile dónde pedirla y termina.

2. **Pide la key con `AskQuestion`** (campo de texto libre). Mensaje sugerido: "Pega tu key del SFR Gateway. Es una cadena alfanumérica que NO empieza con `sk-`. La voy a usar solo para configurar tu `.env` local — no la voy a loguear en ningún lado."

3. **Verifica prerequisites silenciosamente** corriendo:
   ```bash
   command -v python3.11 >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1
   command -v node >/dev/null 2>&1
   command -v brew >/dev/null 2>&1
   ```
   Si Python o Node faltan y `brew` está disponible, avísale al QA: "Veo que te falta Python/Node, los voy a instalar con Homebrew (~2-3 min)". Si `brew` tampoco existe, dile que lo instale primero desde [brew.sh](https://brew.sh) y para acá.

4. **Corre el setup en modo no-interactivo con la key como env var**:
   ```bash
   SFR_API_KEY="<la-key>" ./setup.sh --auto-install-deps
   ```
   El flag `--auto-install-deps` autoriza a `setup.sh` a correr `brew install python@3.11` y `brew install node` sin preguntar (útil porque no puedes responder prompts interactivos).

   **CRÍTICO — manejo de la key**:
   - Pasa la key SOLO como variable de entorno al comando (no en el `command` string que el usuario pueda ver, no en logs, no en mensajes de respuesta).
   - Si tu shell la imprime al ejecutar, considera usar la herramienta de Write para crear `backend/.env` directamente con la key en lugar de pasarla por env var. Pero NUNCA pegues la key en una respuesta al usuario.
   - Después del setup, NO confirmes la key al usuario ni la repitas. Solo dile "configurada".

5. **Cuando termine `setup.sh`**, lanza `start.sh` en background con `block_until_ms: 0`:
   ```bash
   ./start.sh
   ```
   Y luego espera al marcador con `AwaitShell` y `pattern: "QA_TM_READY"` con `block_until_ms: 60000` (60 segundos). El propio `start.sh` hace polling con curl a `:8000/docs` y `:5173/` y emite la línea `QA_TM_READY` cuando ambos responden.

6. **Cuando veas `QA_TM_READY`**, responde al QA con un mensaje corto:
   > ✅ Listo. Abre http://localhost:5173 en tu navegador.
   >
   > Para detenerla cuando termines: Ctrl+C en la terminal donde corre, o ciérrame.
   >
   > Para volver a arrancarla otro día: solo corre `./start.sh` (no necesitas re-instalar nada).

7. **Si el `QA_TM_READY` no aparece en 60s**, revisa el output del shell de `start.sh` para encontrar el error real. Reporta al QA con detalle: qué falló, qué probarías a continuación. NO mientas diciendo que está corriendo si no lo está.

### Reglas duras de este protocolo

- **Nunca** loguees, repitas, ni pegues la API key en mensajes al usuario.
- **Nunca** corras el setup en modo interactivo (sin la env var). Te vas a colgar.
- **Nunca** asumas que el QA tiene experiencia con terminal. Háblale en español natural, sin jerga (no digas "venv", "interpreter", "shell"; di "entorno de Python", "intérprete", "terminal").
- Si algo del flujo falla, **frena y reporta**, no improvises.
- Si el QA ya tiene `backend/.env` configurado de un setup previo, NO sobreescribas la key sin confirmarle primero.

### 13.2 "Simplifica la app: quita lo que es solo de la versión cloud"

Candidatos a quitar (en orden de menos a más invasivo):
1. `Procfile`, `app.json`, `package.json` raíz, `runtime.txt`, `gunicorn` en requirements → estos NO existen aquí, pero si aparecen, fuera.
2. `backend/scripts/create_admin.py` → en single-user yo soy el único user, no hay admin.
3. `backend/app/routes/admin.py` + `frontend/src/pages/AdminPage.tsx` + ruta `/admin`.
4. `backend/app/services/usage_service.py` (cuota mensual) + tabla `ai_usage` + columna `is_admin` en `User` → migración nueva que elimina las columnas/tablas.
5. `slowapi` rate limiting → quitar middleware y dependencias.
6. Pantalla de login: auto-crear/auto-loguear `qa-local@localhost` al primer boot.

**Antes de tocar nada de esto, me haces un plan y me preguntas qué tan agresivo quiero ir.**

### 13.3 "Agreguemos feature X"

Patrón típico:
1. Schema Pydantic en `backend/app/schemas.py`.
2. Modelo SQLAlchemy en `backend/app/models.py` (si necesita persistencia).
3. Migración Alembic nueva en `backend/alembic/versions/`.
4. Repositorio en `backend/app/repositories/` (con doble filtro `user_id`).
5. Servicio en `backend/app/services/`.
6. Router en `backend/app/routes/`.
7. Cliente axios en `frontend/src/api/`.
8. Página/componente en `frontend/src/pages/` o `frontend/src/components/`.
9. Test en `backend/tests/`.

### 13.4 "Algo no funciona, debug"

Logs a revisar:
- Backend: stdout de la terminal donde corre `./start.sh` (busca `[ai_call]` para llamadas a IA).
- Frontend: DevTools del navegador (Network tab para errores HTTP, Console para errores de React).
- BD: `sqlite3 backend/qa_manager.db` y consultas SQL directas.

### 13.5 "Hagamos un commit"

Antes:
1. `git status` para ver qué cambió.
2. `git diff` para revisar contenido.
3. Verifica que NO haya `.env`, `*.db`, `node_modules/`, `venv/` en lo que se va a commitear.
4. Mensaje de commit: estilo conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
5. Yo te confirmo, tú ejecutas `git add` y `git commit`.

### 13.6 "Despleguémoslo"

**No hay deploy aquí.** Esta versión vive solo en mi laptop. Si alguna vez te pido "deploy", confirma primero que no estoy confundido con la versión cloud.

---

## 14. Glosario rápido

- **HU** = Historia de Usuario (User Story).
- **TC** = Test Case (caso de prueba).
- **CA / AC** = Criterios de Aceptación (Acceptance Criteria).
- **INVEST** = Independent / Negotiable / Valuable / Estimable / Small / Testable. Heurística para evaluar HUs.
- **FPY** = First Pass Yield. % de HUs que pasaron QA a la primera (sin reabrir bug).
- **SOW** = Statement of Work (documento de alcance contractual con el cliente).
- **PO** = Product Owner.
- **CoE** = Center of Excellence.
- **SFR Gateway** = Salesforce Research Gateway. Proxy interno de Salesforce que enmascara llamadas a OpenAI con Trust Layer (bias / toxicity / prompt-injection filtering). Las keys del Gateway NO empiezan con `sk-`.
- **Trust Layer** = capa de filtros del SFR Gateway sobre los prompts/respuestas de IA.
- **Structured Outputs** = feature de OpenAI que garantiza que la respuesta siga un JSON Schema estricto. Fundamental para los Agentes 1 y 2.
- **Archetype** (en este repo) = tipo de HU detectado por regex (`auth`, `validation`, `payment`, `file_upload`, `external_api`, etc.).
- **Edge case catalog** = `backend/app/services/story_review/edge_case_catalog.py`. Casos baseline curados por QAs senior por archetype.
- **Wizard** = la UI por pasos del Test Plan (16 secciones).

---

## 15. Lo que NO sabemos todavía / decisiones pendientes

Heads-up para que no asumas nada:

1. **¿Se va a quitar el login?** Aún no decido. Por ahora sigue habiendo login con JWT.
2. **¿Se va a quitar el admin panel?** Probablemente sí, pero todavía no lo confirmé.
3. **¿Se va a soportar import/export de BD entre QAs?** No prioritario.
4. **¿Vamos a empaquetar como `.dmg` o Docker?** Posible futuro, no urgente.
5. **¿Quién más va a usar este repo?** Probablemente otros QAs internos, pero por ahora solo yo.
6. **¿Tests automatizados (pytest)?** Existen 8 archivos en `backend/tests/`. No me pongas a chequear cobertura full salvo que yo te lo pida — son útiles como referencia pero no son obligatorios para cada cambio.
7. **¿CI/CD?** No hay. No agregar GitHub Actions salvo que yo lo pida.

Cuando avancemos y tomemos decisiones aquí, este archivo se va a borrar — la fuente de verdad pasa al `README.md` o a las propias rules de `.cursor/rules/` que armemos.

---

## 16. Cuando termines de leer

Hazme estas 5 cosas, en este orden:

1. Dime: **"Ya leí el AGENT_BRIEFING."**
2. Resume en 5 bullets concretos qué entendiste (qué es la app, para quién, qué NO debes hacer, cuál es la diferencia con cloud, qué stack tiene).
3. Dime si hay algo del briefing que te quedó confuso o contradictorio.
4. **NO ejecutes nada todavía.** Espera mi siguiente mensaje con la primera tarea.
5. Si quieres, sugiéreme tareas de "warm up" pequeñas (ej: "auditar que `git status` esté limpio", "verificar que `./setup.sh` no tenga errores de bash con `bash -n`").

Listo. Bienvenido al repo. Empezamos cuando me confirmes que estamos en la misma página.
