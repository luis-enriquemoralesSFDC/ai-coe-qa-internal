# Arquitectura — `propuesta-2-test-manager/`

Documento de referencia con dos diagramas:

1. **Arquitectura general** del sitio (frontend → backend → DB → IA externa).
2. **Estructura de los agentes de IA** (Story Review Agent, Test Plan Coach, Project Chat Assistant) y su pipeline interno.

> Los bloques `mermaid` se renderizan en GitHub, en VS Code/Cursor con la extensión adecuada, o pegándolos en [mermaid.live](https://mermaid.live) para exportar a PNG/SVG.

---

## Glosario rápido de los agentes

El sistema corre **3 agentes de IA distintos**. Los nombres más comunes se mapean así:

- **"QA Agent que revisa HUs"** → **Story Review Agent**. Pipeline determinístico de 3 pasos detrás del botón "Revisar con QA Agent" en `StoryPage`. Endpoint: `POST /api/projects/{pid}/stories/{sid}/agent/review`.
- **"QA Coach"** → **Test Plan Coach**. Chat estructurado que va llenando el wizard del Test Plan. Endpoint: `POST /api/test-plans/{planId}/coach/turn`. Página dedicada `TestPlanCoachPage`.
- **Project Chat Assistant** (no confundir con el Coach): chatbot Q&A flotante (`ProjectChatDrawer`) para preguntar sobre el proyecto / HU activa. Endpoint: `POST /api/projects/{pid}/chat/messages`. **No** modifica nada, solo responde.

---

## Diagrama 1 — Arquitectura general del sitio

```mermaid
graph TB
  subgraph browser ["Navegador (cliente QA)"]
    UI["React 18 + Vite + TS<br/>14 paginas, React Router 6"]
    QC["TanStack Query<br/>cache de servidor"]
    AX["axios cliente baseURL /api<br/>interceptor Authorization Bearer<br/>interceptor 401 -- redirect /login"]
    LS["localStorage<br/>token + user"]
    UI <--> QC
    QC <--> AX
    AX <--> LS
  end

  subgraph fastapi ["Backend FastAPI - QA Hub v1.1.0 (app/main.py)"]
    MW["Middleware<br/>CORSMiddleware + SlowAPIMiddleware<br/>JWT HS256 via get_current_user<br/>auto migracion Alembic upgrade head al boot"]

    subgraph routes ["Routers REST bajo /api/*"]
      direction LR
      R1["auth, admin"]
      R2["projects, stories, test_cases"]
      R3["test_plans, test_plan_coach,<br/>project_chat"]
      R4["kpis (bugs + metrics), export"]
    end

    subgraph services ["Services (logica de negocio)"]
      direction LR
      SV1["InvestService, TestCaseService,<br/>DocumentService, ExportService"]
      SV2["TestPlanService<br/>+ test_plan_policies (engine SIN LLM)<br/>+ TestPlanCoachService"]
      SV3["ProjectChatService,<br/>StoryReviewService,<br/>KpiService + BugImportService"]
      SV4["UsageService<br/>cuota mensual USD<br/>+ admin bypass"]
    end

    subgraph dataAccess ["Repositories (SQLAlchemy 2.0)"]
      RPS["8 repositorios<br/>Project, UserStory, TestCase,<br/>TestPlan, TestPlanCoachMessage,<br/>ProjectChatMessage, Bug/BugReport,<br/>AiUsage<br/><br/>Defense in depth: doble<br/>filtro por user_id en cada read"]
    end

    subgraph providers ["Providers de IA (Dependency Inversion)"]
      PROT["Protocols app/interfaces/ai_provider.py<br/>IInvestAnalyzer, ITestCaseGenerator,<br/>ITestCaseGeneratorWithContext,<br/>ITestPlanCoach, ITestPlanProseAssistant,<br/>IProjectChatAssistant, IDocumentExtractor"]
      OPENAI["OpenAIProvider<br/>AsyncOpenAI lazy singleton<br/>+ Structured Outputs estrictos<br/>+ sanitize_user_text + wrap_user_input<br/>+ store=false (zero retention)<br/>+ pricing.py para cost_usd"]
    end

    subgraph readers ["Readers (Strategy + Registry, OCP)"]
      RDR["pdfplumber (.pdf)<br/>python-docx (.docx)<br/>nativo (.txt, .md)"]
    end

    MW --> routes
    routes --> services
    services --> dataAccess
    services -. "ensure_within_budget pre-call" .-> SV4
    services --> providers
    SV1 --> readers
    PROT --> OPENAI
  end

  subgraph storage ["Persistencia"]
    DB[("SQLite (dev) / Postgres (prod)<br/>11 tablas, 7 migraciones<br/>users, projects, user_stories,<br/>test_cases, test_plans,<br/>test_plan_coach_messages,<br/>project_chat_messages,<br/>bugs, bug_reports, ai_usage")]
    TPL["templates/test_plan/<br/>qa_plan_master.md<br/>+ placeholders.md"]
  end

  subgraph external ["IA externa"]
    OAI_DIR["OpenAI directo<br/>api_key sk-..."]
    SFR["SFR Gateway<br/>X-Api-Key + Trust Layer<br/>(bias / toxicity / prompt-injection)"]
  end

  AX -- "HTTPS JSON" --> MW
  dataAccess <--> DB
  SV2 --> TPL
  OPENAI -- "auto-detect por settings.use_gateway" --> OAI_DIR
  OPENAI --> SFR
```

### Cómo leerlo

- **Capas estrictas** (Layered Architecture): `routes → services → repositories → models`. Toda la inyección está centralizada en [`backend/app/dependencies.py`](../backend/app/dependencies.py).
- **Dos cuellos transversales** que tocan toda llamada de IA: `UsageService` (cuota mensual de USD por usuario, valida antes y registra después) y el rate limit de slowapi (`120/min/user` en endpoints IA, `600/min/user` global, key por `sub` del JWT).
- **Provider abstracto via Protocols**: el día que se cambie de OpenAI a otro modelo solo se reemplaza la clase concreta en [`backend/app/providers/openai_provider.py`](../backend/app/providers/openai_provider.py). El gateway de Salesforce Research se activa solo si la API key no empieza con `sk-`.
- **El frontend es un SPA puro** consumiendo `/api`. En Heroku, FastAPI sirve el `dist/` del frontend con `_SPAStaticFiles` (fallback a `index.html` para 404 no-API).

---

## Diagrama 2 — Estructura de los agentes de IA

```mermaid
graph TB
  subgraph user ["Trigger desde el frontend"]
    A_BTN["StoryPage<br/>boton Revisar con QA Agent<br/>+ AgentReviewModal con timeline"]
    B_BTN["TestPlanCoachPage<br/>chat estructurado del wizard"]
    C_BTN["ProjectChatDrawer<br/>FAB flotante en ProjectPage<br/>y StoryPage"]
  end

  subgraph agentSR ["AGENTE 1 - Story Review Agent (revisor de HUs)"]
    direction TB
    SR_EP["POST /projects/.../stories/.../agent/review<br/>routes/stories.py<br/>modes: skip / append / replace"]
    SR_SVC["StoryReviewService.run<br/>orquestador deterministico de 3 pasos<br/>(NO ReAct, NO tool selection)"]
    SR1["Paso 1 -- INVEST<br/>idempotente: skip si ya existe<br/>OpenAIInvestAnalyzer<br/>Structured Output 6 criterios"]
    SR2["Paso 2 -- Context detection<br/>archetype_detector.py REGEX<br/>+ edge_case_catalog.py baseline curado<br/>SIN llamada al LLM"]
    SR3["Paso 3 -- Generate test cases<br/>OpenAITestCaseGenerator.generate_with_context<br/>HU + archetypes + baseline + INVEST<br/>(Structured Output)"]
    SR_OUT["StoryReviewResponse<br/>steps[] con status / latency / detail<br/>test_cases_created"]
    SR_DB[("UserStory<br/>archetypes, edge_cases_baseline,<br/>last_review_at, invest_*")]
    SR_TC[("TestCase bulk insert")]

    SR_EP --> SR_SVC
    SR_SVC --> SR1
    SR1 --> SR2
    SR2 --> SR3
    SR3 --> SR_OUT
    SR1 -. write .-> SR_DB
    SR2 -. write .-> SR_DB
    SR3 -. write .-> SR_TC
  end

  subgraph agentTPC ["AGENTE 2 - Test Plan Coach (QA Coach)"]
    direction TB
    TPC_EP["POST /test-plans/.../coach/start<br/>POST /test-plans/.../coach/turn<br/>routes/test_plan_coach.py<br/>headers Cache-Control no-store"]
    TPC_SVC["TestPlanCoachService<br/>orquesta turno conversacional<br/>guard de campos identitarios"]
    TPC_HIST["TestPlanCoachMessage<br/>historial completo por plan_id"]
    TPC_POL["test_plan_policies.py<br/>policy engine deterministico<br/>SIN LLM<br/>reglas duras (client_name, sow_id, etc)"]
    TPC_LLM["OpenAITestPlanCoach<br/>Structured Output _LLMCoachTurn<br/>actions tipadas:<br/>ask_text, ask_picklist,<br/>confirm_value, suggest_replace,<br/>set_field, follow_up, summary"]
    TPC_PATCH["Aplica patches al wizard_data<br/>JSON merge controlado"]
    TPC_RES["CoachTurnResponse<br/>message, wizard_data,<br/>violations[], can_generate"]
    TPC_DB[("TestPlan.wizard_data JSON<br/>vuelve a status=draft<br/>si se modifica")]

    TPC_EP --> TPC_SVC
    TPC_SVC --> TPC_HIST
    TPC_SVC --> TPC_POL
    TPC_SVC --> TPC_LLM
    TPC_LLM --> TPC_PATCH
    TPC_PATCH --> TPC_DB
    TPC_PATCH --> TPC_RES
    TPC_POL --> TPC_RES

    TPC_NOTE["IMPORTANTE: el .md final NO lo<br/>genera el Coach.<br/>Cuando can_generate=true, el frontend<br/>llama POST /test-plans/.../generate<br/>que invoca TestPlanService.generate<br/>(reemplaza placeholders en qa_plan_master.md)"]
  end

  subgraph agentPC ["AGENTE 3 - Project Chat Assistant (drawer)"]
    direction TB
    PC_EP["POST /projects/.../chat/messages<br/>routes/project_chat.py<br/>headers Cache-Control no-store"]
    PC_GUARD["Anti-IDOR:<br/>valida que story_id (opcional)<br/>pertenezca al proyecto"]
    PC_SVC["ProjectChatService.send_message"]
    PC_CTX["Contexto inyectado:<br/>metadata del proyecto<br/>+ lista top-N de HUs<br/>+ HU activa (opcional)<br/>+ historial truncado a 10 turnos"]
    PC_LLM["OpenAIProjectChatAssistant<br/>texto libre<br/>SIN Structured Outputs"]
    PC_PERSIST["append_pair atomico<br/>user + assistant en una transaccion<br/>(evita mensajes huerfanos)"]
    PC_DB[("ProjectChatMessage")]

    PC_EP --> PC_GUARD
    PC_GUARD --> PC_SVC
    PC_SVC --> PC_CTX
    PC_CTX --> PC_LLM
    PC_LLM --> PC_PERSIST
    PC_PERSIST --> PC_DB
  end

  subgraph shared ["Infraestructura comun a los 3 agentes"]
    SH_PROV["OpenAIProvider<br/>AsyncOpenAI singleton<br/>+ sanitize_and_wrap (anti prompt-injection)<br/>+ Structured Outputs (excepto Project Chat)<br/>+ store=false / SFR Gateway opcional"]
    SH_USAGE["UsageService<br/>ensure_within_budget pre-call<br/>record post-call -- ai_usage table<br/>cuota MONTHLY_BUDGET_USD por usuario"]
    SH_RL["slowapi rate limit<br/>120/min/user en todos los endpoints IA"]
    SH_LOG["Logging estructurado<br/>[ai_call] op=... model=... status=...<br/>tokens_in tokens_out cost_usd latency_ms"]
  end

  A_BTN --> SR_EP
  B_BTN --> TPC_EP
  C_BTN --> PC_EP

  SR1 --> SH_PROV
  SR3 --> SH_PROV
  TPC_LLM --> SH_PROV
  PC_LLM --> SH_PROV

  SR_SVC --> SH_USAGE
  TPC_SVC --> SH_USAGE
  PC_SVC --> SH_USAGE

  SR_EP --> SH_RL
  TPC_EP --> SH_RL
  PC_EP --> SH_RL

  SH_PROV --> SH_LOG
```

### Diferencias clave entre los 3 agentes

- **Story Review** es un **pipeline determinístico** de 3 pasos. Hay heurística (regex de archetypes + lookup de catálogo) **antes** del LLM, lo que reduce variabilidad y costo. Una corrida típica gasta 1-2 calls al modelo ($0.005-$0.020 USD).
- **Test Plan Coach** es **conversacional con structured output**: cada turno del LLM devuelve un `assistant_message` + un `next_action` tipado (`ask_text`, `ask_picklist`, `confirm_value`, etc.) que el frontend renderiza como un widget interactivo. Encima del LLM hay un policy engine determinístico (`test_plan_policies.py`) que valida reglas duras y bloquea la generación si no se cumplen.
- **Project Chat** es **conversacional libre**: solo Q&A, no modifica nada del proyecto. Es texto plano, sin Structured Outputs.

---

## Archivos clave por agente

**Story Review Agent**:

- Routes: [`backend/app/routes/stories.py`](../backend/app/routes/stories.py)
- Servicio orquestador: [`backend/app/services/story_review/story_review_service.py`](../backend/app/services/story_review/story_review_service.py)
- Detección de arquetipos: [`backend/app/services/story_review/archetype_detector.py`](../backend/app/services/story_review/archetype_detector.py)
- Catálogo de edge cases: [`backend/app/services/story_review/edge_case_catalog.py`](../backend/app/services/story_review/edge_case_catalog.py)
- Provider: clases `OpenAIInvestAnalyzer` y `OpenAITestCaseGenerator.generate_with_context` en [`backend/app/providers/openai_provider.py`](../backend/app/providers/openai_provider.py)
- Frontend: [`frontend/src/pages/StoryPage.tsx`](../frontend/src/pages/StoryPage.tsx) (botón + `AgentReviewModal`)

**Test Plan Coach (QA Coach)**:

- Routes: [`backend/app/routes/test_plan_coach.py`](../backend/app/routes/test_plan_coach.py)
- Servicio: [`backend/app/services/test_plan_coach_service.py`](../backend/app/services/test_plan_coach_service.py)
- Policy engine determinístico: [`backend/app/services/test_plan_policies.py`](../backend/app/services/test_plan_policies.py)
- Provider: clase `OpenAITestPlanCoach` en [`backend/app/providers/openai_provider.py`](../backend/app/providers/openai_provider.py)
- Frontend: [`frontend/src/pages/TestPlanCoachPage.tsx`](../frontend/src/pages/TestPlanCoachPage.tsx)
- Generación final del `.md` (separada del Coach): [`backend/app/services/test_plan_service.py`](../backend/app/services/test_plan_service.py) + plantilla [`backend/app/templates/test_plan/qa_plan_master.md`](../backend/app/templates/test_plan/qa_plan_master.md)

**Project Chat Assistant**:

- Routes: [`backend/app/routes/project_chat.py`](../backend/app/routes/project_chat.py)
- Servicio: [`backend/app/services/project_chat_service.py`](../backend/app/services/project_chat_service.py)
- Provider: clase `OpenAIProjectChatAssistant` en [`backend/app/providers/openai_provider.py`](../backend/app/providers/openai_provider.py)
- Frontend: [`frontend/src/components/ProjectChatDrawer.tsx`](../frontend/src/components/ProjectChatDrawer.tsx)
