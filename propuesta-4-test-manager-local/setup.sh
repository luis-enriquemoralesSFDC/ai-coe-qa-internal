#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# QA Test Manager — Local — Instalador
#
# Prepara tu Mac para correr la app localmente.
# Es idempotente: lo puedes correr 100 veces sin romper nada.
#
# Pasos:
#   1. Verifica Python 3.11+ y Node 18+ (los instala con brew si faltan).
#   2. Crea el entorno virtual de Python e instala dependencias del backend.
#   3. Instala dependencias del frontend (npm install).
#   4. Instala dependencias del qa-worker (npm install) — ejecuta los runs
#      del Cursor SDK + Playwright MCP.
#   5. Crea backend/.env y qa-worker/.env desde sus templates y configura las
#      API keys (SFR Gateway y Cursor SDK).
#
# ── Modos de uso ──────────────────────────────────────────────────────────────
#
# A) Interactivo (humano en su terminal):
#      ./setup.sh
#    El script te pregunta tu key del SFR Gateway y tu CURSOR_API_KEY con read -s.
#
# B) No-interactivo (agente de Cursor o CI):
#      SFR_API_KEY="<tu-sfr-key>" CURSOR_API_KEY="<tu-cursor-key>" ./setup.sh
#      # o
#      SFR_API_KEY="..." CURSOR_API_KEY="..." ./setup.sh --non-interactive
#    El script usa las keys del environment, no pregunta nada.
#    (Si solo quieres setear una y respetar la otra ya configurada, omítela).
#
# C) Auto-instalar prerequisites (Python/Node) sin preguntar:
#      ./setup.sh --auto-install-deps
#    Útil para agentes; salta el prompt de confirmación de brew.
#
# Cuando termine, corre ./start.sh para arrancar la app + el worker.
# ──────────────────────────────────────────────────────────────────────────────

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# ── Parseo de flags ──────────────────────────────────────────────────────────
NON_INTERACTIVE=0
AUTO_INSTALL_DEPS=0
for arg in "$@"; do
  case "$arg" in
    --non-interactive)
      NON_INTERACTIVE=1
      ;;
    --auto-install-deps)
      AUTO_INSTALL_DEPS=1
      ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *)
      echo "⚠  Argumento desconocido: $arg"
      echo "   Usa -h para ver opciones."
      exit 2
      ;;
  esac
done

# Si SFR_API_KEY o CURSOR_API_KEY vienen del environment, asumimos modo
# no-interactivo automáticamente.
if [ -n "${SFR_API_KEY:-}" ] || [ -n "${CURSOR_API_KEY:-}" ]; then
  NON_INTERACTIVE=1
fi

# Fail-fast: si estamos en modo no-interactivo y NO hay key en el environment,
# fallamos AHORA (no después de instalar 4 minutos de dependencias).
# Excepción: si el .env ya existe con una key real, no necesitamos SFR_API_KEY
# (vamos a respetar lo que esté configurado).
ENV_FILE_PRECHECK="$ROOT/backend/.env"
if [ "$NON_INTERACTIVE" = "1" ] && [ -z "${SFR_API_KEY:-}" ]; then
  if [ ! -f "$ENV_FILE_PRECHECK" ] || grep -q "^OPENAI_API_KEY=tu-key-aqui" "$ENV_FILE_PRECHECK" 2>/dev/null; then
    echo ""
    echo "✗ Modo no-interactivo activado pero no hay SFR_API_KEY en el environment."
    echo ""
    echo "  Pásala así:"
    echo "    SFR_API_KEY=\"<tu-key>\" ./setup.sh"
    echo ""
    echo "  O corre el setup interactivo (sin --non-interactive):"
    echo "    ./setup.sh"
    echo ""
    exit 1
  fi
fi

# ── Helpers de presentación ──────────────────────────────────────────────────
print_header() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║   QA Test Manager (local) — Instalación                         ║"
  echo "╚══════════════════════════════════════════════════════════════════╝"
  if [ "$NON_INTERACTIVE" = "1" ]; then
    echo "   (modo no-interactivo)"
  fi
  echo ""
}

print_step() { echo ""; echo "▶ $1"; }
print_ok()   { echo "  ✓ $1"; }
print_warn() { echo "  ⚠ $1"; }
print_fail() { echo "  ✗ $1"; }

# Pregunta sí/no en modo interactivo. En modo no-interactivo retorna 0 (sí)
# si AUTO_INSTALL_DEPS=1, o 1 (no) en caso contrario.
ask_yes_no() {
  local prompt="$1"
  if [ "$NON_INTERACTIVE" = "1" ]; then
    if [ "$AUTO_INSTALL_DEPS" = "1" ]; then
      echo "  [auto-install-deps] $prompt → sí"
      return 0
    fi
    return 1
  fi
  read -r -p "  $prompt (s/n): " resp
  [[ "$resp" =~ ^[sS] ]]
}

print_header

# ── 1. Verificar / instalar prerequisites ────────────────────────────────────
print_step "1/5 — Verificando prerequisites"

# Homebrew (necesario solo si tenemos que instalar algo).
have_brew() { command -v brew >/dev/null 2>&1; }

install_with_brew() {
  local formula="$1"
  if ! have_brew; then
    print_fail "Homebrew no está instalado y se necesita para instalar '$formula'."
    echo ""
    echo "   Instala Homebrew primero desde: https://brew.sh"
    echo "   Pega esto en tu terminal:"
    echo '     /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    echo ""
    exit 1
  fi
  echo "  Instalando $formula con brew..."
  brew install "$formula"
}

# Python 3.11+
PYTHON_BIN=""
detect_python() {
  if command -v python3.11 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3.11)"
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    local pv pv_major pv_minor
    pv="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)"
    pv_major="$(echo "$pv" | cut -d. -f1)"
    pv_minor="$(echo "$pv" | cut -d. -f2)"
    if [ "$pv_major" = "3" ] && [ -n "$pv_minor" ] && [ "$pv_minor" -ge 11 ]; then
      PYTHON_BIN="$(command -v python3)"
      return 0
    fi
  fi
  return 1
}

if detect_python; then
  print_ok "Python detectado en: $PYTHON_BIN"
else
  print_warn "Python 3.11+ no encontrado."
  if ask_yes_no "¿Quieres que lo instale con Homebrew (brew install python@3.11)?"; then
    install_with_brew "python@3.11"
    if ! detect_python; then
      print_fail "Tras instalar python@3.11 sigue sin detectarse. Revisa tu PATH."
      exit 1
    fi
    print_ok "Python instalado en: $PYTHON_BIN"
  else
    print_fail "Sin Python 3.11+ no puedo continuar."
    echo "   Instálalo manualmente con: brew install python@3.11"
    echo "   Luego vuelve a correr ./setup.sh"
    exit 1
  fi
fi

# Node 18+
detect_node() {
  if command -v node >/dev/null 2>&1; then
    local nv_raw nv_major
    nv_raw="$(node -v)"
    nv_major="$(echo "$nv_raw" | sed 's/^v//' | cut -d. -f1)"
    if [ -n "$nv_major" ] && [ "$nv_major" -ge 18 ]; then
      return 0
    fi
  fi
  return 1
}

if detect_node; then
  print_ok "Node detectado: $(node -v)"
else
  print_warn "Node 18+ no encontrado."
  if ask_yes_no "¿Quieres que lo instale con Homebrew (brew install node)?"; then
    install_with_brew "node"
    if ! detect_node; then
      print_fail "Tras instalar node sigue sin detectarse. Revisa tu PATH."
      exit 1
    fi
    print_ok "Node instalado: $(node -v)"
  else
    print_fail "Sin Node 18+ no puedo continuar."
    echo "   Instálalo manualmente con: brew install node"
    echo "   Luego vuelve a correr ./setup.sh"
    exit 1
  fi
fi

# ── 2. Backend: venv + pip install ───────────────────────────────────────────
print_step "2/5 — Preparando backend (Python)"

cd "$ROOT/backend"

if [ ! -d "venv" ]; then
  echo "  Creando entorno virtual en backend/venv..."
  "$PYTHON_BIN" -m venv venv
  print_ok "venv creado"
else
  print_ok "venv ya existe (lo reutilizo)"
fi

# shellcheck disable=SC1091
source venv/bin/activate

echo "  Instalando dependencias de Python (esto tarda 30-60s)..."
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
print_ok "Dependencias de Python instaladas"

deactivate
cd "$ROOT"

# ── 3. Frontend: npm install ─────────────────────────────────────────────────
print_step "3/5 — Preparando frontend (Node)"

cd "$ROOT/frontend"

if [ ! -d "node_modules" ]; then
  echo "  Ejecutando npm install (esto tarda 1-3 minutos la primera vez)..."
  npm install --silent
  print_ok "node_modules instalado"
else
  print_ok "node_modules ya existe (lo reutilizo)"
fi

cd "$ROOT"

# ── 4. qa-worker: npm install ────────────────────────────────────────────────
print_step "4/5 — Preparando qa-worker (Node + Cursor SDK)"

if [ ! -d "$ROOT/qa-worker" ]; then
  print_warn "Carpeta qa-worker/ no existe. ¿Repo desactualizado?"
  print_warn "Saltando este paso — vuelve a hacer git pull e intenta de nuevo."
else
  cd "$ROOT/qa-worker"

  if [ ! -d "node_modules" ]; then
    echo "  Ejecutando npm install para qa-worker (tarda 30-90s la primera vez)..."
    echo "  (Esto baja @cursor/sdk + better-sqlite3; este último compila nativamente.)"
    npm install --silent
    print_ok "qa-worker/node_modules instalado"
  else
    print_ok "qa-worker/node_modules ya existe (lo reutilizo)"
  fi

  cd "$ROOT"
fi

# ── 5. Configurar credenciales (.env de backend y qa-worker) ─────────────────
print_step "5/5 — Configurando API keys (SFR Gateway + Cursor SDK)"

ENV_FILE="$ROOT/backend/.env"
ENV_EXAMPLE="$ROOT/backend/.env.example"

# Función helper: escribe key + URL en el .env
write_key_to_env() {
  local key="$1"
  local url="${2:-https://gateway.salesforceresearch.ai/openai/process/v1}"

  if [ ! -f "$ENV_FILE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
  fi
  cp "$ENV_FILE" "$ENV_FILE.bak"
  sed -i.tmp "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=$key|" "$ENV_FILE"
  sed -i.tmp "s|^OPENAI_BASE_URL=.*|OPENAI_BASE_URL=$url|" "$ENV_FILE"
  rm -f "$ENV_FILE.tmp"
}

# Caso A: ya está configurado y NO viene una key nueva por env → respeto lo que hay.
if [ -f "$ENV_FILE" ] && ! grep -q "^OPENAI_API_KEY=tu-key-aqui" "$ENV_FILE" && [ -z "${SFR_API_KEY:-}" ]; then
  print_ok "backend/.env ya está configurado (lo respeto)"
  if [ "$NON_INTERACTIVE" != "1" ]; then
    echo ""
    echo "  Si quieres rotar tu key:"
    echo "    1. Edita $ENV_FILE manualmente, o"
    echo "    2. Borra el archivo y vuelve a correr ./setup.sh"
  fi

# Caso B: modo no-interactivo o key viene por env var.
elif [ "$NON_INTERACTIVE" = "1" ]; then
  if [ -z "${SFR_API_KEY:-}" ]; then
    print_fail "Modo no-interactivo pero no hay SFR_API_KEY en el environment."
    echo ""
    echo "   Pásala así:"
    echo "     SFR_API_KEY=\"tu-key\" ./setup.sh"
    echo ""
    exit 1
  fi
  write_key_to_env "$SFR_API_KEY" "${SFR_BASE_URL:-https://gateway.salesforceresearch.ai/openai/process/v1}"
  print_ok "backend/.env configurado desde SFR_API_KEY (no-interactivo)"

# Caso C: interactivo, le pregunto al humano.
else
  if [ ! -f "$ENV_FILE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    print_ok "Archivo backend/.env creado desde el template"
  else
    print_warn "backend/.env existe pero tiene la key placeholder, lo voy a actualizar"
  fi

  echo ""
  echo "  ──────────────────────────────────────────────────────────────────"
  echo "   Necesitas tu API key del SFR Gateway de Salesforce."
  echo "   La key NO empieza con 'sk-' (esa sería de OpenAI directo)."
  echo ""
  echo "   ⚠  IMPORTANTE:"
  echo "      • Tu key se guarda SOLO en backend/.env (tu Mac, local)."
  echo "      • Está en .gitignore — no se sube a git."
  echo "      • NO la pegues en Slack, screenshots ni Quip."
  echo "      • Si la expones por error, rótala YA en la consola del Gateway."
  echo "  ──────────────────────────────────────────────────────────────────"
  echo ""

  read -r -s -p "  Pega aquí tu key del SFR Gateway (no se mostrará): " SFR_KEY_INTERACTIVE
  echo ""

  if [ -z "$SFR_KEY_INTERACTIVE" ]; then
    print_warn "No pegaste ninguna key. backend/.env quedó con el placeholder."
    print_warn "Edítalo manualmente antes de correr ./start.sh"
  else
    DEFAULT_URL="https://gateway.salesforceresearch.ai/openai/process/v1"
    read -r -p "  URL del Gateway [Enter para usar default]: " SFR_URL_INTERACTIVE
    SFR_URL_INTERACTIVE="${SFR_URL_INTERACTIVE:-$DEFAULT_URL}"

    write_key_to_env "$SFR_KEY_INTERACTIVE" "$SFR_URL_INTERACTIVE"
    print_ok "backend/.env actualizado con tu key del SFR Gateway"
    print_ok "URL del Gateway: $SFR_URL_INTERACTIVE"
    echo "  (backup en backend/.env.bak por si necesitas revertir)"
  fi
fi

# ── 5b. Configurar qa-worker/.env (CURSOR_API_KEY) ───────────────────────────
echo ""

WORKER_ENV_FILE="$ROOT/qa-worker/.env"
WORKER_ENV_EXAMPLE="$ROOT/qa-worker/.env.example"

write_cursor_key_to_worker_env() {
  local key="$1"

  if [ ! -f "$WORKER_ENV_FILE" ]; then
    cp "$WORKER_ENV_EXAMPLE" "$WORKER_ENV_FILE"
  fi
  cp "$WORKER_ENV_FILE" "$WORKER_ENV_FILE.bak"
  sed -i.tmp "s|^CURSOR_API_KEY=.*|CURSOR_API_KEY=$key|" "$WORKER_ENV_FILE"
  rm -f "$WORKER_ENV_FILE.tmp"
}

# Detectar si el worker .env tiene una key real (no vacía y no placeholder).
worker_env_has_real_key() {
  [ -f "$WORKER_ENV_FILE" ] || return 1
  local v
  v="$(grep "^CURSOR_API_KEY=" "$WORKER_ENV_FILE" | cut -d'=' -f2- | tr -d '[:space:]')"
  [ -n "$v" ] && [ "$v" != "your-cursor-api-key-here" ]
}

if [ ! -d "$ROOT/qa-worker" ]; then
  print_warn "Carpeta qa-worker/ no existe — saltando configuración de CURSOR_API_KEY"

# Caso A: ya está configurado y no viene una key nueva por env → respeto.
elif worker_env_has_real_key && [ -z "${CURSOR_API_KEY:-}" ]; then
  print_ok "qa-worker/.env ya está configurado con CURSOR_API_KEY (lo respeto)"

# Caso B: no-interactivo y viene CURSOR_API_KEY por env var.
elif [ "$NON_INTERACTIVE" = "1" ]; then
  if [ -z "${CURSOR_API_KEY:-}" ]; then
    print_warn "Modo no-interactivo sin CURSOR_API_KEY — qa-worker/.env quedará sin configurar"
    print_warn "El backend y frontend van a arrancar pero el worker fallará al ejecutar runs"
    if [ ! -f "$WORKER_ENV_FILE" ]; then
      cp "$WORKER_ENV_EXAMPLE" "$WORKER_ENV_FILE"
      print_ok "qa-worker/.env creado desde el template (CURSOR_API_KEY vacío)"
    fi
  else
    write_cursor_key_to_worker_env "$CURSOR_API_KEY"
    print_ok "qa-worker/.env configurado desde CURSOR_API_KEY (no-interactivo)"
  fi

# Caso C: interactivo, le pregunto al humano.
else
  if [ ! -f "$WORKER_ENV_FILE" ]; then
    cp "$WORKER_ENV_EXAMPLE" "$WORKER_ENV_FILE"
    print_ok "Archivo qa-worker/.env creado desde el template"
  else
    print_warn "qa-worker/.env existe pero sin key real, lo voy a actualizar"
  fi

  echo ""
  echo "  ──────────────────────────────────────────────────────────────────"
  echo "   Necesitas tu API key personal de Cursor para ejecutar test runs."
  echo "   La sacas de: https://cursor.com/dashboard → API Keys"
  echo "   La key empieza con 'crsr_' (o similar)."
  echo ""
  echo "   ⚠  IMPORTANTE:"
  echo "      • Es PERSONAL — cada miembro del equipo usa la suya."
  echo "      • Cada run consume cuota de tu plan de Cursor."
  echo "      • Se guarda SOLO en qa-worker/.env (tu Mac, local)."
  echo "      • Está en .gitignore — no se sube a git."
  echo "      • NO la pegues en Slack, screenshots ni Quip."
  echo "  ──────────────────────────────────────────────────────────────────"
  echo ""

  read -r -s -p "  Pega aquí tu CURSOR_API_KEY (no se mostrará): " CURSOR_KEY_INTERACTIVE
  echo ""

  if [ -z "$CURSOR_KEY_INTERACTIVE" ]; then
    print_warn "No pegaste ninguna key. qa-worker/.env quedó con CURSOR_API_KEY vacía."
    print_warn "Edítalo manualmente antes de ejecutar test runs (./start.sh igual arranca)."
  else
    write_cursor_key_to_worker_env "$CURSOR_KEY_INTERACTIVE"
    print_ok "qa-worker/.env actualizado con tu CURSOR_API_KEY"
    echo "  (backup en qa-worker/.env.bak por si necesitas revertir)"
  fi
fi

# ── Cierre ───────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║   ✅ Setup completo                                              ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "  Próximo paso:"
echo "    ./start.sh"
echo ""
echo "  Esto arranca 3 procesos en paralelo:"
echo "    • Backend FastAPI    → http://localhost:8000"
echo "    • Frontend React     → http://localhost:5173"
echo "    • qa-worker (Node)   → ejecuta los test runs en Chromium"
echo ""
