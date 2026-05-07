#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# QA Test Manager — Local — Arranque
#
# Levanta el backend (FastAPI :8000) y el frontend (Vite :5173) en paralelo.
# Si la instalación no se hizo, te avisa y manda a correr ./setup.sh.
#
# Para detener ambos servidores: Ctrl+C
# ──────────────────────────────────────────────────────────────────────────────

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

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

# ── Pre-flight 2: ¿está configurada la API key? ──────────────────────────────
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

# ── Backend ──────────────────────────────────────────────────────────────────
echo "▶ Iniciando Backend (FastAPI)..."
cd "$ROOT/backend"
# shellcheck disable=SC1091
source venv/bin/activate
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
echo "  Backend corriendo en http://localhost:8000"
echo "  Docs de la API en http://localhost:8000/docs"

# ── Frontend ─────────────────────────────────────────────────────────────────
echo ""
echo "▶ Iniciando Frontend (React)..."
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!
echo "  Frontend corriendo en http://localhost:5173"

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
      echo "║                                                                  ║"
      echo "║   Para detener: Ctrl+C en esta terminal                          ║"
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
trap "echo ''; echo 'Deteniendo servidores...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
