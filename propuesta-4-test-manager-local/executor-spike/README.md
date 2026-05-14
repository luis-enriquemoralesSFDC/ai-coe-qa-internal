# executor-spike

Spike aislado para validar `@cursor/sdk` + Playwright MCP **antes** de integrarlo al backend / frontend del Test Manager.

## Qué prueba

1. Que el SDK puede arrancar un agente Cursor desde Node con `Agent.prompt(...)`.
2. Que el agente puede usar el MCP de Playwright (stdio, igual que en el chat) declarándolo inline.
3. Que el resultado del agente vuelve como texto procesable que después podemos parsear / guardar en BD.

Si esto funciona, el patrón es reutilizable en un `node executor.ts` invocado por FastAPI.

## Prerequisitos

- Node ≥ 18 (este equipo: v25.9.0).
- `npx @playwright/mcp@latest` funcionando (el MCP del chat). El SDK reusa el mismo binario via `npx`.
- API key Cursor: [cursor.com/dashboard/cloud-agents](https://cursor.com/dashboard/integrations) → API Keys.

## Setup

```bash
cd propuesta-4-test-manager-local/executor-spike
cp .env.example .env
# Editar .env y pegar tu CURSOR_API_KEY
```

Las dependencias ya están instaladas. Si tienes que reinstalar:

```bash
npm install
```

> Nota sobre `sqlite3`: el SDK la usa en runtime. La versión que arrastra por
> defecto (5.1.7) no tiene prebuilt para Node ≥ 25 y compilarla desde fuente
> falla porque Python 3.13 ya no incluye `distutils`. La fix está aplicada en
> `package.json` via `overrides`, forzando `sqlite3@^6.0.1` que sí publica
> prebuilt para Node 25. Mantener esta override mientras el SDK no actualice
> su dep directa de sqlite3.

## Correr

Hay dos spikes con propósito distinto:

| Script | Patrón SDK | Para qué |
|---|---|---|
| `npm run spike` | `Agent.prompt` (one-shot) | Validar setup base: SDK + MCP funcionando |
| `npm run spike:conv` | `Agent.create + agent.send` (multi-turno) | Validar que el agente puede pausar para login manual y continuar después |

### Spike #1 (one-shot)

```bash
npm run spike
```

Lo que verás:

1. El proceso imprime `[spike] arrancando Agent.prompt …`.
2. `npx @playwright/mcp@latest` levanta una ventana de Chromium controlada por el agente.
3. El agente navega al sandbox QA de Salesforce.
4. Si no hay sesión, **pausa** y te dice "necesito que te logues" — entra manualmente en la ventana (incluyendo MFA).
5. El agente ejecuta el caso TC-001-02 y devuelve un reporte estructurado.

Códigos de salida:

| código | qué significa |
|---|---|
| 0 | `result.status === "finished"` — el agente terminó OK |
| 1 | `CursorAgentError` — el agente no arrancó (auth, config, red) |
| 2 | `result.status !== "finished"` — el agente arrancó pero falló a mitad de run |

### Spike #2 (conversacional)

```bash
npm run spike:conv
```

Lo que verás:

1. Mismas líneas iniciales que el spike #1 más `[spike-conv] run1.id=… agentId=…`.
2. Mientras el agente trabaja, ves líneas tipo `[T1] tool: browser_navigate` y previews de mensajes assistant.
3. Cuando el agente detecta la pantalla de login, responde "necesito que te loguees" y el spike entra en pausa con un prompt en tu terminal:

   ```
   [spike-conv] Cuando termines de loguearte, presiona ENTER aquí para continuar…
   ```

4. Te vas a la ventana de Chromium, te logueas manualmente (MFA incluido), regresas a la terminal y presionas ENTER.
5. El spike manda un `agent.send("Listo, ya estoy logueado...")` como follow-up — la conversación conserva todo el contexto previo, así que el agente reanuda donde quedó.
6. Termina imprimiendo el bloque `──────── REPORTE FINAL ────────` con el resultado estructurado del caso.

Si esto funciona, queda confirmado que el patrón es viable para integrar con FastAPI: el "presiona ENTER" será un endpoint que el botón "ya me logué" del frontend invoque para mandar el follow-up.

## Si algo falla

- **`401 Unauthorized`**: la API key está mal o tiene espacios. Regenera y vuelve a pegar.
- **El agente no abre browser**: verificar que `npx @playwright/mcp@latest` corra a mano (`npx @playwright/mcp@latest --help`). Posible problema de instalación de @playwright/mcp en cache de npm.
- **Cuelga sin hacer nada**: probablemente el agente está esperando login. Mira si hay una ventana de Chromium abierta.
- **`Could not locate the bindings file` de sqlite3**: el override de `sqlite3@^6.0.1` se perdió. Verifica que `package.json` tenga el bloque `"overrides": { "sqlite3": "^6.0.1" }`, borra `node_modules` y `package-lock.json`, y reinstala.

## Cuando funcione

El siguiente paso (fuera de este spike) es:

1. Crear endpoint `POST /api/test-runs` en FastAPI que persista un run y lance `node executor.ts --run-id=<id>` como subproceso.
2. `executor.ts` será similar a `spike.ts` pero leerá el prompt desde BD/stdin y escribirá el resultado de vuelta.
3. El frontend reemplaza "Copiar prompt" por "Ejecutar" → consume el endpoint → polea estado.
