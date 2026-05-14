/**
 * Spike aislado: validar que @cursor/sdk puede orquestar al agente Cursor desde
 * Node y que el agente puede usar el MCP de Playwright para ejecutar un caso
 * de prueba real (TC-001-02) contra el sandbox QA de Salesforce.
 *
 * Si este script termina con status="finished" y un reporte legible, sabemos
 * que el camino para integrar el SDK en el backend está despejado.
 *
 * Cómo correr:
 *   1. cp .env.example .env  y pegar CURSOR_API_KEY
 *   2. npm run spike
 */

import "dotenv/config";
import { Agent, CursorAgentError } from "@cursor/sdk";

const PROMPT = `Necesito que ejecutes 1 caso de prueba usando Playwright MCP.

AMBIENTE: QA
URL BASE: https://envasesalu--qa.sandbox.my.salesforce.com

PROTOCOLO:
1. browser_navigate a la URL base.
2. Si la app pide login, pausa y dime "necesito que te logues". Yo lo hago
   manualmente en la ventana que abre Playwright.
3. Cuando confirme que estoy logueado, ejecuta el caso.
4. Para el caso:
   a) PRE-CHECK: browser_snapshot del estado inicial. Si el "Resultado esperado"
      ya se cumple SIN ejecutar pasos modificatorios, marca el caso como
      PASSED-PREEXISTING y NO ejecutes acciones que modifiquen datos.
   b) Recorre los pasos en orden. browser_snapshot después de cada uno.
   c) Si es verificación, NUNCA hagas Save/Guardar. Usa Cancel/Esc.
5. Estados válidos: PASSED, PASSED-PREEXISTING, FAILED, BLOCKED, SKIPPED.
6. Al terminar, devuelve un reporte en este formato exacto:
   STATUS: <estado>
   ACTIONS: <acciones tomadas>
   EVIDENCE: <ruta de screenshot si tomaste alguno, o "n/a">
   NOTE: <nota breve>

CASO:

### 1. [TC-001-02] Visualización de la pestaña Related de Account History
Precondición: Existe un objeto Account con historial de cambios en los campos
habilitados (Owner / Status).
Pasos:
  1. Abrir un registro de Account existente. → Se carga el detalle del registro.
  2. Navegar a la pestaña Related (o, si el flexipage no la tiene como tab,
     a la related list "Account History" del record).
Resultado esperado: La related list "Account History" es visible y muestra el
historial de cambios de los campos habilitados.
`;

async function main(): Promise<void> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.error("[spike] Falta CURSOR_API_KEY en .env");
    process.exit(1);
  }

  const modelId = process.env.CURSOR_MODEL_ID || "default";

  console.log("[spike] arrancando Agent.prompt …");
  console.log(`[spike] modelo: ${modelId}, runtime: local, MCP: playwright stdio`);

  try {
    const result = await Agent.prompt(PROMPT, {
      apiKey,
      model: { id: modelId },
      local: { cwd: process.cwd() },
      mcpServers: {
        playwright: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@playwright/mcp@latest", "--browser=chromium"],
        },
      },
    });

    console.log("\n[spike] ──────── RESULTADO ────────");
    console.log("status:", result.status);
    console.log("──── result.result ────");
    console.log(result.result);
    console.log("───────────────────────");

    process.exit(result.status === "finished" ? 0 : 2);
  } catch (err) {
    if (err instanceof CursorAgentError) {
      console.error(
        "[spike] startup failed:",
        err.message,
        "retryable=",
        err.isRetryable
      );
      process.exit(1);
    }
    throw err;
  }
}

main();
