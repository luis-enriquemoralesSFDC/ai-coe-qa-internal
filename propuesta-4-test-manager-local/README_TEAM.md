# QA Test Manager — Guía de instalación para el equipo

Esta guía es para **cada miembro del equipo** que vaya a correr el proyecto en su Mac.
La app es 100% local: cada uno tiene su propia instancia, su propia base de datos
y sus propias keys.

> **TL;DR**: instala prerequisites → corre `./setup.sh` → corre `./start.sh` →
> abre `http://localhost:5173`. Tienes la guía completa abajo.

---

## 1. Qué vas a correr en tu Mac

Cuando ejecutes `./start.sh` se levantan **3 procesos en paralelo** en una sola terminal:

| Proceso | Puerto | Para qué |
|---|---|---|
| Backend FastAPI | `:8000` | API + base de datos SQLite local (`backend/qa_manager.db`) |
| Frontend Vite | `:5173` | UI de React. Lo que abres en el navegador. |
| qa-worker (Node) | sin puerto | Ejecuta los test runs con Playwright + Cursor SDK. Corre en background con logs en `logs/qa-worker.log`. |

> El worker abre Chromium cuando ejecutas un test. Es la primera vez que vas a
> ver una ventana de navegador "fantasma" controlada por el agente.

---

## 2. Prerequisites del sistema

Necesitas estas herramientas instaladas **una sola vez por máquina**.

| Herramienta | Verificar | Cómo instalar (macOS) |
|---|---|---|
| Homebrew | `brew --version` | https://brew.sh |
| Python 3.11+ | `python3 --version` | `brew install python@3.11` |
| Node 18+ (idealmente 20+) | `node -v` | `brew install node` |
| Git | `git --version` | `xcode-select --install` |

Si te faltan Python o Node, `./setup.sh` te ofrece instalarlos automáticamente
con Homebrew (te pregunta antes).

---

## 3. Credenciales que tú necesitas conseguir

Cada persona usa **sus propias** credenciales. No las comparten en Slack ni en
ningún otro lado.

### 3.1 Key del SFR Gateway (Salesforce)

- **Para qué**: que el backend genere casos de prueba con IA (endpoint
  `/api/cases/from-text`, etc.).
- **Dónde la sacas**: la consola del Gateway interno (la misma que usabas antes
  en este proyecto). Pregunta al equipo si no la tienes.
- **Formato**: NO empieza con `sk-`. Es la key del Gateway, no de OpenAI directo.
- **Dónde se guarda**: `backend/.env` → `OPENAI_API_KEY=...`

### 3.2 Cursor API Key (PERSONAL — nueva)

- **Para qué**: que el `qa-worker` ejecute los test runs vía Cursor SDK.
- **Dónde la sacas**: https://cursor.com/dashboard → **API Keys** → **Create API Key**.
- **Formato**: empieza con `crsr_...` (o similar).
- **Dónde se guarda**: `qa-worker/.env` → `CURSOR_API_KEY=...`
- **Importante**:
  - Es **personal**. Cada persona crea la suya en su cuenta de Cursor.
  - **Cada test run consume cuota de tu plan de Cursor** (Hobby/Pro/Business).
    Un caso simple gasta poco; uno largo puede gastar más.
  - Si tu cuenta no tiene API access, pídelo al admin del workspace de Cursor.

### 3.3 Credenciales de los ambientes (QA/UAT/Prod)

- Las usas tú **manualmente** cuando el agente abra Chromium pidiendo login.
  No se guardan en el proyecto. El sistema te muestra el navegador, te logueas
  como QA normalmente, y le das al botón **"Ya me logué"** en la UI.

---

## 4. Instalación paso a paso

### 4.1 Clonar el repo

```bash
git clone <url-del-repo-interno>
cd ai-coe-qa-internal/propuesta-4-test-manager-local
```

### 4.2 Correr el instalador

**Opción A — Interactivo (recomendado la primera vez):**

```bash
./setup.sh
```

El script:
1. Verifica Python 3.11+ y Node 18+ (ofrece instalarlos si faltan).
2. Crea `backend/venv` e instala dependencias de Python.
3. Corre `npm install` en `frontend/`.
4. Corre `npm install` en `qa-worker/` (baja `@cursor/sdk` y compila `better-sqlite3`).
5. Te pide tu **key del SFR Gateway** (paso interactivo, no se muestra en pantalla).
6. Te pide tu **CURSOR_API_KEY** (paso interactivo, no se muestra en pantalla).

Tarda 3–6 minutos la primera vez. Es **idempotente**: lo puedes correr 100 veces.

**Opción B — Una sola línea, sin prompts:**

```bash
SFR_API_KEY="<tu-sfr-key>" CURSOR_API_KEY="<tu-cursor-key>" ./setup.sh --auto-install-deps
```

Útil si quieres rehacer la instalación sin que te pregunte nada.

### 4.3 Arrancar todo

```bash
./start.sh
```

Espera ~15-20 segundos. Cuando veas el banner **`✅ QA_TM_READY`**, abre:

```
http://localhost:5173
```

Para detener todo: **Ctrl+C** en la misma terminal.

---

## 5. Cómo se ejecuta un test (flujo end-to-end)

1. En la UI, entras a un proyecto y abres una historia con casos de prueba.
2. Marcas los casos que quieres ejecutar (máx **10 por run**).
3. Click en **"Ejecutar"** → eliges ambiente (QA/UAT/Prod) y `base_url` →
   confirmas modelo (default: `claude-haiku-4-5`).
4. La UI te abre el panel de progreso del run. El estado pasa por:
   - `queued` (esperando que el worker lo levante)
   - `running` (el agente abrió Chromium y está navegando)
   - `waiting_login` (si el caso requiere login → te aparece la ventana de
     Chromium para que te loguees a mano).
5. Te logueas en Chromium normalmente (con MFA si hace falta) → vuelves a la
   UI → click en **"Ya me logué, continuar"**.
6. El agente continúa, ejecuta los pasos del caso, y cuando termina deja el
   reporte en la columna **"Último run"** y dentro del panel:
   - `STATUS: PASSED | FAILED | BLOCKED`
   - `ACTIONS: ...`
   - `EVIDENCE: ...`
   - `NOTE: ...`

> Si el caso tarda demasiado (>15 min) o pasaste >30 min en login sin confirmar,
> el worker auto-cancela el run y lo marca como `error` o `cancelled`. Esos
> límites se configuran en `qa-worker/.env`.

---

## 6. Tres procesos en una terminal — ¿necesito 3 ventanas?

**No.** `./start.sh` arranca los 3 con un solo comando y los detiene todos con
Ctrl+C. Si por algún motivo quieres correrlos por separado:

```bash
# Solo backend
cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000

# Solo frontend
cd frontend && npm run dev

# Solo worker
cd qa-worker && npm start
```

Esto es útil para depurar uno sin reiniciar los otros.

---

## 7. Archivos importantes que NO se suben a git

- `backend/.env` → tu key del SFR Gateway
- `qa-worker/.env` → tu CURSOR_API_KEY
- `backend/qa_manager.db` → tu base local SQLite (cada uno tiene la suya)
- `logs/qa-worker.log` → logs del worker

Todo está en `.gitignore`. **Nunca** subas estos archivos.

---

## 8. Troubleshooting rápido

| Síntoma | Solución |
|---|---|
| `./setup.sh` falla con `ModuleNotFoundError: distutils` | Es Python 3.13 con `sqlite3` legacy. El `package.json` del worker ya usa `overrides` para forzar la versión correcta — vuelve a correrlo. |
| `Cannot use this model: composer-2` | Tu `qa-worker/.env` tiene un `QA_WORKER_MODEL_ID` no permitido por tu plan. Cámbialo a `claude-haiku-4-5` o `default`. |
| El run se queda en `queued` y no avanza | El worker no está corriendo. Revisa `logs/qa-worker.log` o reinicia con `./start.sh`. |
| El run se queda en `waiting_login` aunque ya me logueé | Tienes que dar click al botón **"Ya me logué, continuar"** en la UI. La detección de login es manual a propósito. |
| `EPERM: operation not permitted` al ejecutar el worker | Estás corriendo el worker desde el sandbox de un agente Cursor. Tiene que correrse desde **tu terminal local** (Terminal.app o iTerm), no desde el chat. |
| Chromium no se abre | Primera ejecución descarga ~150 MB. Mira `logs/qa-worker.log`. Asegúrate de tener internet. |
| `sqlite database is locked` | El backend y el worker comparten SQLite con WAL mode. Si pasa, mata todos los procesos (`pkill -f uvicorn; pkill -f tsx`) y reinicia con `./start.sh`. |
| Mi cuota de Cursor se agotó | Comprueba en https://cursor.com/dashboard. Espera al reset mensual o sube de plan. Otros del equipo no se ven afectados (cada uno usa la suya). |

---

## 9. Para mantenerse al día (cuando alguien actualiza el repo)

```bash
git pull
./setup.sh    # idempotente: solo instala lo nuevo, respeta tus .env
./start.sh
```

Si hay migraciones nuevas de la BD, el backend las aplica solo al arrancar.

---

## 10. Soporte

- Docs internas del proyecto: `MANUAL_DE_ARRANQUE.md`, `AGENT_BRIEFING.md`,
  `qa-worker/README.md`.
- Bugs / dudas: canal de Slack del equipo.
- Para rotar tu CURSOR_API_KEY: edita `qa-worker/.env` directamente o re-corre
  `./setup.sh` y pega la nueva.
