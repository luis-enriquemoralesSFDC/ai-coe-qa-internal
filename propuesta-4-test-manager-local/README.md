# QA Test Manager — Local

App de gestión QA para correr **en tu Mac**, sin cloud. Útil cuando quieres analizar historias de usuario con INVEST, generar casos de prueba con IA y manejar tus reportes de bugs sin depender de un servidor compartido.

> Esta es la **versión local** del producto. Existe también una versión cloud (multi-usuario, Heroku) que vive en otro repo.

## Qué hace

- **Análisis INVEST** — Evalúa cada historia de usuario con score y sugerencias por criterio.
- **Generación de casos con IA** — GPT-4o (vía SFR Gateway) propone flujos principales, alternativos, negativos y edge cases.
- **QA Agent** — Pipeline de 3 pasos (INVEST → contexto → generación con baseline curado) para HUs nuevas o complejas.
- **Test Plan Coach** — Wizard conversacional que va llenando el plan de pruebas paso a paso.
- **Project Chat** — Chatbot Q&A flotante para preguntar sobre el proyecto/HU activa.
- **Matriz de pruebas** — Editor visual con todos los campos estándar de QA.
- **KPIs y bugs** — Dashboard con FPY, severidad, efectividad de TC.
- **Exportación a Excel** — Descarga la matriz formateada.

## Dos caminos para arrancar la app

Elige el que más te acomode. Ambos llegan al mismo lugar (la app corriendo en tu Mac).

### Camino A — Terminal (clásico, 3 comandos)

> Requisitos: macOS, Python 3.11+ y Node 18+. Si te faltan, el setup ofrece instalarlos con Homebrew automáticamente.

```bash
# 1. Instalar todo (la primera vez)
./setup.sh

# 2. (El setup te pide tu API key del SFR Gateway durante la instalación.)

# 3. Arrancar la app
./start.sh
```

Cuando termine, abre **http://localhost:5173** en tu navegador.

### Camino B — Cursor (sin terminal, sin código)

Si tienes [Cursor](https://cursor.com) instalado y prefieres no tocar la terminal:

1. Abre este repo en Cursor.
2. Abre el chat del agente (Cmd+L).
3. Pega este mensaje literal:

   > Léete el archivo `MANUAL_DE_ARRANQUE.md` de la raíz y sigue las instrucciones para instalar y arrancar la app por mí. Soy QA, no quiero ver código.

4. El agente te pedirá tu API key del SFR Gateway en el chat (no la tipees en terminal).
5. Cuando te diga "listo", abre **http://localhost:5173** en tu navegador.

> ⚠ Para el Camino B necesitas la app Cursor con un agente activo. La instalación con `brew install python@3.11 node` puede tardar 2-3 minutos la primera vez.

### Cómo detener la app

- Si la arrancaste por terminal: `Ctrl+C` en la misma terminal.
- Si la arrancaste por Cursor: cierra Cursor o pídele al agente "detén la app".

### Cómo volver a arrancarla otro día

```bash
./start.sh
```
No necesitas correr `./setup.sh` otra vez (a menos que actualices dependencias o quieras rotar tu key).

## Cómo conseguir tu API key del SFR Gateway

Tu key del SFR Gateway es lo que la app usa para hablar con los modelos de IA (GPT-4o y compañía). Es **personal** y se cobra a Salesforce.

1. Obtenla aqui,en el portal interno del Salesforce Research Gateway:https://gateway-dashboard.salesforceresearch.ai/
2. Cópiala completa (es una cadena alfanumérica de ~32 caracteres, **NO** empieza con `sk-`).
3. Pégala cuando `./setup.sh` te la pida.
4. Si necesitas rotarla, edita `backend/.env` o vuelve a correr `./setup.sh`.

> ⚠ **Nunca** pegues tu key en Slack, screenshots, Quip ni mensajes. Si la expones por error, **rótala inmediatamente** en la consola del Gateway.

## Estructura

```
propuesta-4-test-manager-local/
├── README.md                ← este archivo
├── setup.sh                 ← instalador interactivo (Mac)
├── start.sh                 ← arranca backend + frontend
├── backend/                 ← FastAPI + SQLAlchemy + Alembic
│   ├── .env.example         ← template del .env (copialo a .env)
│   ├── app/                 ← código de la app (routes, services, providers)
│   ├── alembic/             ← migraciones de BD
│   ├── scripts/             ← utilidades (create_admin, etc.)
│   └── tests/               ← suite de pytest
├── docs/
│   └── architecture.md      ← diagramas mermaid del backend y los agentes
└── frontend/                ← React + Vite + TypeScript + Tailwind
    └── src/                 ← 14 páginas, React Router, TanStack Query
```

## Variables de entorno clave

Las que más probablemente vas a tocar en `backend/.env`:

| Variable | Por defecto | Cuándo cambiarla |
|---|---|---|
| `OPENAI_API_KEY` | `tu-key-aqui` | **Siempre.** El setup te la pregunta. |
| `OPENAI_BASE_URL` | `https://gateway.salesforceresearch.ai/openai/process/v1` | Solo si tu equipo tiene un gateway distinto. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Cámbialo a `gpt-4o-2024-08-06` si quieres más calidad. |
| `LOG_LEVEL` | `INFO` | `DEBUG` si vas a depurar. |
| `MONTHLY_BUDGET_USD` | `0.0` (sin límite) | Si quieres frenarte solo, ponle un tope. |

El resto está documentado en `backend/.env.example` con comentarios.

## Troubleshooting

### `command not found: python3.11`
Instala Python con Homebrew:
```bash
brew install python@3.11
```
Si no tienes Homebrew, instálalo desde [brew.sh](https://brew.sh).

### `command not found: node`
```bash
brew install node
```

### Puerto `8000` o `5173` ocupado
Otra cosa está corriendo en ese puerto. Mátala:
```bash
# Ver qué usa el puerto 8000
lsof -i :8000
# Matar el proceso (reemplaza PID)
kill -9 <PID>
```

### Quiero rotar mi API key
Edita `backend/.env`, cambia la línea `OPENAI_API_KEY=...` y reinicia con `./start.sh`. O simplemente borra `backend/.env` y vuelve a correr `./setup.sh`.

### La app dice "OPENAI_API_KEY no parece ser de OpenAI directo..."
Tu key no empieza con `sk-` (correcto, es del Gateway). Verifica que `OPENAI_BASE_URL` esté seteado en `backend/.env`. El setup lo pone por default en la URL oficial.

### La BD se corrompió o quiero empezar de cero
Borra `backend/qa_manager.db` y reinicia. La app la vuelve a crear desde las migraciones.

```bash
rm backend/qa_manager.db
./start.sh
```

### Las dependencias se actualizaron y mi venv quedó viejo
Borra el venv y vuelve a correr el setup:
```bash
rm -rf backend/venv
./setup.sh
```

## Diferencias con la versión cloud

Si vienes de la versión cloud (Heroku), estas son las diferencias importantes:

- **Single-user**: la app está pensada para que tú la uses en tu laptop. Sigue habiendo login (puedes crear varias cuentas si quieres separar proyectos), pero no hay multi-tenancy real.
- **SQLite en lugar de Postgres**: todo el estado vive en `backend/qa_manager.db`. Hacer un backup es copiar ese archivo.
- **Sin cuotas mensuales**: `MONTHLY_BUDGET_USD=0` por default — la cuota real la decide el SFR Gateway, no esta app.
- **Sin Heroku**: no hay `Procfile`, `app.json`, `gunicorn`. Solo `start.sh`.
- **Tu data no sale de tu Mac**: ningún proyecto, HU, caso de prueba ni reporte de bug se sube a ningún lado. Lo único que sale son los prompts a la IA cuando le das a "Generar casos" o "Revisar con QA Agent".

## Dónde leer más

- **Arquitectura del backend y los 3 agentes de IA**: [`docs/architecture.md`](docs/architecture.md) (diagramas mermaid).
- **Endpoints de la API**: con la app corriendo, abre [`http://localhost:8000/docs`](http://localhost:8000/docs) (Swagger UI generado por FastAPI).
