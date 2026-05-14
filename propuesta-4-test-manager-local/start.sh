#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# QA Test Manager — Local — Arranque
#
# Levanta los 3 procesos necesarios en paralelo:
#   • Backend FastAPI  (puerto 8000)
#   • Frontend Vite    (puerto 5173)
#   • qa-worker (Node) (sin puerto; corre en background con logs en logs/)
#
# Si la instalación no se hizo, te avisa y manda a correr ./setup.sh.
#
# ── Modos de uso ──────────────────────────────────────────────────────────────
#
# A) Normal (todo, incluido el worker):
#      ./start.sh
#
# B) Sin worker (útil para desarrollo del backend/frontend sin gastar
#    cuota de Cursor SDK ni abrir Chromium):
#      ./start.sh --no-worker
#
# Para detener todo: Ctrl+C en esta terminal.
# ──────────────────────────────────────────────────────────────────────────────

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# ── Parseo de flags ──────────────────────────────────────────────────────────
START_WORKER=1
for arg in "$@"; do
  case "$arg" in
    --no-worker)
      START_WORKER=0
      ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0
      ;;
    *)
      echo "⚠  Argumento desconocido: $arg"
      echo "   Usa -h para ver opciones."
      exit 2
      ;;
  esac
done

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║   QA Test Manager (local) — Iniciando                           ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# ── Pre-flight 1: ¿corrió el setup? ──────────────────────────────────────────
if [ ! -d "$ROOT/backend/venv" ]; then
  echo "❌ No encuentro backend/venv."
  echo "   Corre primero la instalación:"
  echo "     ./setup.sh"
  echo ""
  exit 1
fi

if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "❌ No encuentro frontend/node_modules."
  echo "   Corre primero la instalación:"
  echo "     ./setup.sh"
  echo ""
  exit 1
fi

# ── Pre-flight 2: ¿está configurada la API key del backend? ──────────────────
ENV_FILE="$ROOT/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ No encuentro backend/.env."
  echo "   Corre primero la instalación (te ayuda a configurar tu key):"
  echo "     ./setup.sh"
  echo ""
  exit 1
fi

if grep -q "^OPENAI_API_KEY=tu-key-aqui" "$ENV_FILE" 2>/dev/null; then
  echo "⚠  backend/.env todavía tiene la key placeholder ('tu-key-aqui')."
  echo "   Opciones:"
  echo "     1. Vuelve a correr ./setup.sh y pega tu key cuando te pregunte."
  echo "     2. O edita backend/.env manualmente con tu editor favorito."
  echo ""
  exit 1
fi

KEY_VALUE="$(grep "^OPENAI_API_KEY=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '[:space:]')"
if [ -z "$KEY_VALUE" ]; then
  echo "⚠  OPENAI_API_KEY está vacío en backend/.env."
  echo "   Vuelve a correr ./setup.sh o edita el archivo manualmente."
  echo ""
  exit 1
fi

# ── Pre-flight 3: si el worker está habilitado, validar su instalación ───────
WORKER_ENV_FILE="$ROOT/qa-worker/.env"
WORKER_KEY_OK=0

if [ "$START_WORKER" = "1" ]; then
  if [ ! -d "$ROOT/qa-worker" ]; then
    echo "⚠  Carpeta qa-worker/ no existe — arranco sin worker."
    echo "   (Test runs no se ejecutarán; el resto de la app sí funciona.)"
    START_WORKER=0
  elif [ ! -d "$ROOT/qa-worker/node_modules" ]; then
    echo "❌ No encuentro qa-worker/node_modules."
    echo "   Corre primero la instalación:"
    echo "     ./setup.sh"
    echo ""
    exit 1
  elif [ ! -f "$WORKER_ENV_FILE" ]; then
    echo "⚠  qa-worker/.env no existe — arranco sin worker."
    echo "   Cuando quieras ejecutar test runs, corre ./setup.sh para configurarlo."
    START_WORKER=0
  else
    WORKER_KEY_VALUE="$(grep "^CURSOR_API_KEY=" "$WORKER_ENV_FILE" | cut -d'=' -f2- | tr -d '[:space:]')"
    if [ -z "$WORKER_KEY_VALUE" ] || [ "$WORKER_KEY_VALUE" = "your-cursor-api-key-here" ]; then
      echo "⚠  qa-worker/.env tiene CURSOR_API_KEY vacío — arranco sin worker."
      echo "   Edita qa-worker/.env y pega tu key, o vuelve a correr ./setup.sh."
      START_WORKER=0
    else
      WORKER_KEY_OK=1
    fi
  fi
fi

# ── Carpeta de logs (para el worker en background) ───────────────────────────
mkdir -p "$ROOT/logs"

# ── Backend ──────────────────────────────────────────────────────────────────
echo "▶ Iniciando Backend (FastAPI)..."
cd "$ROOT/backend"
# shellcheck disable=SC1091
source venv/bin/activate
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
echo "  Backend corriendo en http://localhost:8000  (PID $BACKEND_PID)"
echo "  Docs de la API en http://localhost:8000/docs"

# ── Frontend ─────────────────────────────────────────────────────────────────
echo ""
echo "▶ Iniciando Frontend (React)..."
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!
echo "  Frontend corriendo en http://localhost:5173  (PID $FRONTEND_PID)"

# ── qa-worker (opcional) ─────────────────────────────────────────────────────
WORKER_PID=""
if [ "$START_WORKER" = "1" ] && [ "$WORKER_KEY_OK" = "1" ]; then
  echo ""
  echo "▶ Iniciando qa-worker (Cursor SDK + Playwright MCP)..."
  cd "$ROOT/qa-worker"
  # Logs van a logs/qa-worker.log para no inundar esta terminal con la salida
  # del SDK + Chromium. Si necesitas verlos en vivo: tail -f logs/qa-worker.log
  npm start --silent >>"$ROOT/logs/qa-worker.log" 2>&1 &
  WORKER_PID=$!
  echo "  qa-worker corriendo en background          (PID $WORKER_PID)"
  echo "  Logs en vivo: tail -f logs/qa-worker.log"
else
  echo ""
  echo "ℹ  qa-worker NO se va a iniciar (--no-worker o configuración faltante)."
  echo "   Test runs quedarán en estado 'queued' hasta que arranques el worker:"
  echo "     cd qa-worker && npm start"
fi

cd "$ROOT"

echo ""
echo "⏳ Los servidores están arrancando — espera ~15-20 segundos."
echo "   (FastAPI tarda en aplicar migraciones; Vite tarda en compilar el primer build)"
echo ""

# ── Esperar a que ambos servicios estén listos ───────────────────────────────
# Hacemos polling con curl en segundo plano y emitimos un marcador "QA_TM_READY"
# cuando los dos respondan. El agente de Cursor puede esperar a este marcador
# con un regex (más confiable que dormir N segundos a ciegas).
(
  for _ in $(seq 1 60); do
    sleep 1
    backend_ok=0
    frontend_ok=0
    curl -fsS -o /dev/null --max-time 1 http://localhost:8000/docs 2>/dev/null && backend_ok=1
    curl -fsS -o /dev/null --max-time 1 http://localhost:5173/ 2>/dev/null && frontend_ok=1
    if [ "$backend_ok" = "1" ] && [ "$frontend_ok" = "1" ]; then
      echo ""
      echo "╔══════════════════════════════════════════════════════════════════╗"
      echo "║   ✅ QA_TM_READY — La app está corriendo                         ║"
      echo "║                                                                  ║"
      echo "║   Abre en tu navegador:  http://localhost:5173                   ║"
      echo "║   Docs de la API:        http://localhost:8000/docs              ║"
      if [ -n "$WORKER_PID" ]; then
        echo "║   Worker corriendo en background (logs/qa-worker.log)            ║"
      else
        echo "║   ⚠  qa-worker NO arrancado — runs no se ejecutarán              ║"
      fi
      echo "║                                                                  ║"
      echo "║   Para detener todo: Ctrl+C en esta terminal                     ║"
      echo "╚══════════════════════════════════════════════════════════════════╝"
      echo ""
      exit 0
    fi
  done
  echo ""
  echo "⚠  Tras 60 segundos los servidores no respondieron. Revisa los logs arriba."
  echo "   Backend esperado en :8000, frontend en :5173."
  echo ""
) &

# ── Cleanup al recibir Ctrl+C ────────────────────────────────────────────────
# Mata los 3 procesos. El kill al WORKER_PID solo se ejecuta si arrancó.
cleanup() {
  echo ''
  echo 'Deteniendo servidores...'
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  if [ -n "$WORKER_PID" ]; then
    kill "$WORKER_PID" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup INT TERM
wait
