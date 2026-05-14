# qa-worker

Worker Node que ejecuta automáticamente los `test_runs` creados por el backend
(FastAPI) usando `@cursor/sdk` + Playwright MCP.

## Cómo encaja

```
┌────────────┐     POST /api/test-runs       ┌──────────────────┐
│  Frontend  │ ─────────────────────────────▶│  FastAPI :8000   │
│  (React)   │◀──── status / result ─────────│  test_runs API   │
└────────────┘                               └────────┬─────────┘
                                                      │
                                                      ▼ INSERT row
                                             ┌──────────────────┐
                                             │   SQLite (WAL)   │
                                             │   test_runs      │
                                             └────────┬─────────┘
                                                      │ poll cada 2s
                                                      ▼
                                             ┌──────────────────┐
                                             │    qa-worker     │
                                             │   (este proyecto)│
                                             │                  │
                                             │   @cursor/sdk    │
                                             │   Playwright MCP │
                                             │   Chromium       │
                                             └──────────────────┘
```

El worker NO habla HTTP con FastAPI. Lee y escribe directo a la misma
SQLite (`backend/qa_manager.db`) en modo WAL para no chocar locks.

## Setup

1. Asegúrate de que la BD existe. La crea el backend al arrancar:
   ```bash
   cd ../backend && uvicorn app.main:app --port 8000
   ```
   (Esto aplica las migraciones, incluida la de `test_runs`.)

2. Instala dependencias del worker:
   ```bash
   cd qa-worker
   npm install
   ```
   `better-sqlite3` y `sqlite3` (transitivo del SDK) usan binarios prebuilt
   compatibles con Node 25, así que no requieren compilación.

3. Configura variables de entorno:
   ```bash
   cp .env.example .env
   ```
   Edita `.env` y pega tu `CURSOR_API_KEY` (la misma que usaste en
   `executor-spike/.env`).

## Cómo correrlo

```bash
npm start              # arranca el loop
npm run dev            # con tsx watch (auto-restart al editar src/)
npm run typecheck      # solo tipos, sin ejecutar
```

Salida esperada al boot:

```
[16:30:01] ──────────────────────────────────────────────────────────────
[16:30:01] qa-worker arrancando
[16:30:01]   db          : /Users/.../backend/qa_manager.db
[16:30:01]   model       : claude-haiku-4-5
[16:30:01]   poll        : 2000ms
[16:30:01]   max run     : 900000ms (15 min)
[16:30:01]   max login   : 600000ms (10 min)
[16:30:01] ──────────────────────────────────────────────────────────────
```

A partir de aquí, queda en silencio hasta que aparezca una fila
`status='queued'` en la tabla. Cuando llega:

```
[16:32:14] ▶ Iniciando run id=42 project=1 cases=[1,2]
[16:32:14]   [run 42] [runner] Agent.create modelo=claude-haiku-4-5 …
[16:32:18]   [run 42]   tool: browser_navigate
[16:32:25]   [run 42]   assistant: necesito que te loguees…
[16:32:25]   [run 42] [runner] Agente pidió login. Pausando…
[16:32:25]   [run 42]   ⏸ Pausa: esperando login del QA…
```

Cuando el frontend hace `POST /api/test-runs/42/continue`:

```
[16:35:02]   [run 42]   ▶ Continue signal recibido. Reanudando.
[16:35:02]   [run 42] [runner] Enviando follow-up post-login…
…
[16:36:20] ✅ run id=42 finished
```

## Probarlo manualmente sin frontend

Con el backend levantado y el worker corriendo, en otra terminal:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"TU@salesforce.com","password":"TU_PASS"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -X POST http://localhost:8000/api/test-runs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": 1,
    "case_ids": [2],
    "env": "qa",
    "base_url": "https://envasesalu--qa.sandbox.my.salesforce.com",
    "prompt": "Necesito que ejecutes 1 caso de prueba ... [tu prompt completo]"
  }'
```

El worker debe detectar la fila en ≤ 2s y empezar a ejecutar. Cuando pida
login, hazlo en la ventana de Chromium y luego:

```bash
RUN_ID=42  # el id que devolvió el POST anterior
curl -X POST "http://localhost:8000/api/test-runs/$RUN_ID/continue" \
  -H "Authorization: Bearer $TOKEN"
```

Para abortar:

```bash
curl -X POST "http://localhost:8000/api/test-runs/$RUN_ID/cancel" \
  -H "Authorization: Bearer $TOKEN"
```

## Variables de entorno (.env)

Ver `.env.example` para descripciones completas. Las relevantes:

| Variable | Default | Para qué |
|---|---|---|
| `CURSOR_API_KEY` | (obligatoria) | Auth contra el SDK |
| `QA_WORKER_DB_PATH` | `../backend/qa_manager.db` | Path al SQLite compartido |
| `QA_WORKER_MODEL_ID` | `claude-haiku-4-5` | Modelo default si la fila no especifica |
| `QA_WORKER_POLL_INTERVAL_MS` | `2000` | Cada cuánto polea la BD |
| `QA_WORKER_MAX_RUN_MS` | `900000` (15 min) | Timeout duro por run |
| `QA_WORKER_MAX_LOGIN_WAIT_MS` | `600000` (10 min) | Timeout esperando QA logueado |

## Troubleshooting

**"No se encontró la BD en /path/qa_manager.db"**
El backend no se ha levantado todavía. Arráncalo primero — él aplica las
migraciones que crean la tabla `test_runs`.

**"FATAL: Falta CURSOR_API_KEY en .env"**
Crea `qa-worker/.env` (no en backend/.env) y pega `CURSOR_API_KEY=crsr_…`.

**"database is locked" intermitente**
Asegúrate de que la BD está en WAL mode:
```bash
sqlite3 ../backend/qa_manager.db "PRAGMA journal_mode;"   # debe decir 'wal'
```
Si dice `delete`, ejecuta:
```bash
sqlite3 ../backend/qa_manager.db "PRAGMA journal_mode=WAL;"
```

**El worker no detecta nuevas filas**
Revisa que estés mirando el mismo SQLite: `lsof | grep qa_manager.db`
debe mostrar tanto el proceso del backend como el del worker.

**El agente queda "rumiando" sin terminar**
Eso quema quota. Usa cancel:
```bash
curl -X POST http://localhost:8000/api/test-runs/$RUN_ID/cancel \
  -H "Authorization: Bearer $TOKEN"
```
O sube `QA_WORKER_MAX_RUN_MS` si los casos legítimamente toman > 15 min.

## Limitaciones conocidas (Fase 2 MVP)

1. **No hay timeline detallado**: solo se persiste el status y el reporte
   final, no cada tool call. Ver Fase B (test_run_events) cuando se
   requiera UI con timeline.
2. **Un run a la vez**: por diseño (un Chromium activo). Si el QA mete 10
   runs, se procesan secuencialmente.
3. **Sin recovery automático**: si matas el worker en medio de un run, la
   fila queda en `running` para siempre. Tendrás que limpiarla a mano:
   ```bash
   sqlite3 ../backend/qa_manager.db \
     "UPDATE test_runs SET status='error', error_message='worker died'
      WHERE status='running';"
   ```
   Una mejora futura es que el worker, al arrancar, recupere todas las
   filas en `running`/`waiting_login` y las marque error con
   `error_message='orphaned'`.
4. **El prompt se confía 100% al frontend**: el backend lo guarda tal cual.
   Si el frontend manda algo malicioso, el agente lo ejecuta. En contexto
   single-user/single-tenant local esto es OK; en multi-tenant habría que
   sanear.
