/**
 * Spike #2: validar el patrón conversacional del SDK (Agent.create + agent.send).
 *
 * El spike anterior (spike.ts) usaba Agent.prompt (one-shot). Sirvió para confirmar
 * que el SDK + Playwright MCP funcionan, pero el agente terminó pidiendo login y no
 * había forma de continuar la conversación.
 *
 * Aquí probamos el flujo real que vamos a usar en producción:
 *   1. Crear un agente vivo (Agent.create).
 *   2. Mandar el prompt inicial.
 *   3. Si el agente termina pidiendo login, pausar en stdin esperando ENTER.
 *   4. Mandar un follow-up "ya estoy adentro, continúa" — la conversación
 *      conserva todo el contexto previo, así que el agente reanuda exactamente
 *      donde quedó.
 *   5. Imprimir el resultado final.
 *
 * Si esto funciona, la integración con FastAPI es trivial: el "presiona ENTER"
 * se reemplaza por "botón 'ya me logué' en el modal" que llamará un endpoint
 * que reenvía el agent.send() de follow-up.
 *
 * Cómo correr:
 *   npm run spike:conv
 */

import "dotenv/config";
import * as readline from "node:readline/promises";
import { Agent, CursorAgentError } from "@cursor/sdk";
import type { Run, SDKAgent } from "@cursor/sdk";

const PROMPT_INICIAL = `Necesito que ejecutes 1 caso de prueba usando Playwright MCP.

AMBIENTE: QA
URL BASE: https://envasesalu--qa.sandbox.my.salesforce.com

PROTOCOLO:
1. browser_navigate a la URL base.
2. Si la app pide login, pausa y respondeme exactamente con la frase:
   "necesito que te loguees"
   y no hagas nada mas. Yo me logueare manualmente en la ventana de Chromium.
3. Cuando te confirme "Listo, ya estoy logueado", ejecuta el caso.
4. Para el caso:
   a) PRE-CHECK: browser_snapshot del estado inicial. Si el "Resultado esperado"
      ya se cumple SIN ejecutar pasos modificatorios, marca el caso como
      PASSED-PREEXISTING y NO ejecutes acciones que modifiquen datos.
   b) Recorre los pasos en orden. browser_snapshot despues de cada uno.
   c) Si es verificacion, NUNCA hagas Save/Guardar. Usa Cancel/Esc.
5. Estados validos: PASSED, PASSED-PREEXISTING, FAILED, BLOCKED, SKIPPED.
6. Al terminar el caso, devuelve un reporte exactamente en este formato:
   STATUS: <estado>
   ACTIONS: <acciones tomadas>
   EVIDENCE: <ruta de screenshot o "n/a">
   NOTE: <nota breve>

CASO:

### 1. [TC-001-02] Visualizacion de la pestaña Related de Account History
Precondicion: Existe un objeto Account con historial de cambios en los campos
habilitados (Owner / Status).
Pasos:
  1. Abrir un registro de Account existente. -> Se carga el detalle del registro.
  2. Navegar a la related list "Account History" del record.
Resultado esperado: La related list "Account History" es visible y muestra el
historial de cambios.
`;

const FOLLOW_UP =
  "Listo, ya estoy logueado en el navegador. Continua con el caso desde donde te quedaste, siguiendo el mismo protocolo. Cuando termines, devuelve el reporte estructurado (STATUS / ACTIONS / EVIDENCE / NOTE).";

// Heurística simple para detectar que el agente está esperando login manual.
// Si después en producción cambiamos la frase del protocolo, ajustar acá.
function needsLogin(text: string | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes("necesito que te loguees") ||
    lower.includes("necesito que te logues") ||
    lower.includes("inicia sesi") ||
    lower.includes("please log in")
  );
}

// Stream mínimo: imprime tool calls y previews de mensajes assistant para
// que se vea progreso en vivo. No bloqueante de wait().
async function streamRun(run: Run, label: string): Promise<void> {
  try {
    for await (const event of run.stream()) {
      if (event.type === "tool_call" && event.status === "running") {
        console.log(`  [${label}] tool: ${event.name}`);
      } else if (event.type === "assistant") {
        for (const block of event.message.content) {
          if (block.type === "text" && block.text.trim()) {
            const preview = block.text.substring(0, 160).replace(/\n+/g, " ");
            const ellipsis = block.text.length > 160 ? " …" : "";
            console.log(`  [${label}] assistant: ${preview}${ellipsis}`);
          }
        }
      } else if (event.type === "status" && event.status === "FINISHED") {
        console.log(`  [${label}] status: FINISHED`);
      }
    }
  } catch (err) {
    console.error(`  [${label}] stream error:`, err);
  }
}

async function waitForEnter(message: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  await rl.question(message);
  rl.close();
}

async function main(): Promise<void> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.error("[spike-conv] Falta CURSOR_API_KEY en .env");
    process.exit(1);
  }
  const modelId = process.env.CURSOR_MODEL_ID || "default";

  console.log("[spike-conv] arrancando Agent.create …");
  console.log(
    `[spike-conv] modelo: ${modelId}, runtime: local, MCP: playwright stdio`
  );

  // Si Agent.create lanza, no entramos al try y no hay nada que dispose.
  // Si lanza después, el finally se encarga.
  let agent: SDKAgent | null = null;

  try {
    agent = await Agent.create({
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

    // ── Turno 1 ─────────────────────────────────────────────────────────────
    console.log("\n[spike-conv] ─── Turno 1: enviando prompt inicial ───");
    const run1 = await agent.send(PROMPT_INICIAL);
    console.log(
      `[spike-conv] run1.id=${run1.id}  agentId=${run1.agentId}`
    );

    // Lanzo el streaming en paralelo con wait() para ver progreso sin bloquear.
    const stream1 = streamRun(run1, "T1");
    const r1 = await run1.wait();
    await stream1;

    console.log(`\n[spike-conv] Turno 1 terminó. status=${r1.status}`);
    console.log("[spike-conv] result.result:");
    console.log(r1.result ?? "(vacío)");

    if (r1.status !== "finished") {
      console.error("[spike-conv] El primer run no terminó OK. Abortando.");
      process.exit(2);
    }

    if (!needsLogin(r1.result)) {
      console.log(
        "\n[spike-conv] El agente NO pidió login (sesión activa o caso terminado). Salgo."
      );
      process.exit(0);
    }

    // ── Pausa para login manual ────────────────────────────────────────────
    console.log("\n[spike-conv] ─── Pausa: el agente pidió login ───");
    console.log(
      "[spike-conv] Ve a la ventana de Chromium que abrió Playwright y completa tu login (MFA incluido)."
    );
    await waitForEnter(
      "[spike-conv] Cuando termines de loguearte, presiona ENTER aquí para continuar… "
    );

    // ── Turno 2: follow-up ─────────────────────────────────────────────────
    console.log("\n[spike-conv] ─── Turno 2: enviando follow-up ───");
    const run2 = await agent.send(FOLLOW_UP);
    console.log(`[spike-conv] run2.id=${run2.id}`);

    const stream2 = streamRun(run2, "T2");
    const r2 = await run2.wait();
    await stream2;

    console.log(`\n[spike-conv] Turno 2 terminó. status=${r2.status}`);
    console.log("[spike-conv] ──────── REPORTE FINAL ────────");
    console.log(r2.result ?? "(vacío)");
    console.log("───────────────────────────────");

    process.exit(r2.status === "finished" ? 0 : 2);
  } catch (err) {
    if (err instanceof CursorAgentError) {
      console.error(
        "[spike-conv] startup failed:",
        err.message,
        "retryable=",
        err.isRetryable
      );
      process.exit(1);
    }
    throw err;
  } finally {
    if (agent) {
      await agent[Symbol.asyncDispose]();
    }
  }
}

main();
