/**
 * Encapsula el ciclo completo de un test_run usando @cursor/sdk + Playwright MCP.
 *
 * Flujo (extraído del spike-conversational.ts y refactorizado para producción):
 *   1. Crear agente conversacional (Agent.create) configurado con Playwright MCP.
 *   2. Mandar el prompt inicial → wait + stream → reporte parcial.
 *   3. Si el reporte parcial pide login: ceder control al worker (status=waiting_login).
 *   4. Cuando el worker señalice continuar (continue_signal=1): mandar follow-up
 *      → wait + stream → reporte final.
 *   5. Cleanup garantizado en finally (Symbol.asyncDispose).
 *
 * Esta capa NO toca BD ni señales; recibe callbacks (onStatusChange, isCancelled,
 * waitForContinue) y los invoca. La lógica de coordinación con SQLite vive en
 * worker.ts. Esto facilita testear esta clase con mocks si en el futuro hace
 * falta.
 */
import { Agent, CursorAgentError } from "@cursor/sdk";
import type { Run, SDKAgent } from "@cursor/sdk";

import { needsLogin } from "./login-detector.js";

const FOLLOW_UP_AFTER_LOGIN =
  "Listo, ya estoy logueado en el navegador. Continúa con el caso desde " +
  "donde te quedaste, siguiendo el mismo protocolo. Cuando termines, " +
  "devuelve el reporte estructurado (STATUS / ACTIONS / EVIDENCE / NOTE).";

export interface AgentRunnerCallbacks {
  /**
   * Invocada cuando el agente entra en estado de espera de login. El worker
   * debe marcar la fila como waiting_login y arrancar a polear continue_signal.
   * Retorna una promesa que resuelve cuando el QA dijo "continúa" (true) o
   * cuando se debe abortar por cancel/timeout (false).
   */
  onLoginRequested(): Promise<{ continue: boolean }>;

  /**
   * Invocada periódicamente durante el wait() para chequear si hay que abortar.
   * Si retorna true, el runner llama run.cancel() y termina con status='cancelled'.
   */
  shouldCancel(): boolean;

  /**
   * Invocada al recibir el agentId del SDK (justo después del primer send).
   * El worker la usa para persistir agent_id en BD.
   */
  onAgentId(agentId: string): void;

  /**
   * Hooks de log para visibilidad. El worker normalmente los enchufa a un logger
   * estructurado; durante desarrollo se enchufan a console.log.
   */
  log(line: string): void;
}

export interface AgentRunnerResult {
  status: "finished" | "error" | "cancelled";
  result: string | null;
  errorMessage: string | null;
}

export interface AgentRunnerInput {
  apiKey: string;
  modelId: string;
  prompt: string;
  /**
   * cwd para el sandbox local del agente. Donde Playwright MCP guarda
   * screenshots y profiles. Recomendable: una carpeta del worker, no el cwd
   * del proceso, para que los .playwright-mcp/ no se mezclen con otros runs.
   */
  cwd: string;
  callbacks: AgentRunnerCallbacks;
}

/**
 * Ejecuta UN test_run completo. Es invocada por el worker DESPUÉS de haber
 * marcado la fila como 'running'. Esta función no toca la BD.
 */
export async function runOneTestRun(input: AgentRunnerInput): Promise<AgentRunnerResult> {
  const { apiKey, modelId, prompt, cwd, callbacks } = input;
  let agent: SDKAgent | null = null;

  try {
    callbacks.log(`[runner] Agent.create modelo=${modelId} cwd=${cwd}`);
    agent = await Agent.create({
      apiKey,
      model: { id: modelId },
      local: { cwd },
      mcpServers: {
        playwright: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@playwright/mcp@latest", "--browser=chromium"],
        },
      },
    });

    // ── Turno 1: prompt inicial ──────────────────────────────────────────────
    callbacks.log(`[runner] Enviando prompt inicial (${prompt.length} chars)…`);
    const run1 = await agent.send(prompt);
    callbacks.log(`[runner] run1.id=${run1.id} agentId=${run1.agentId}`);
    callbacks.onAgentId(run1.agentId);

    const r1 = await waitWithCancellation(run1, callbacks);
    if (r1.cancelled) {
      return { status: "cancelled", result: null, errorMessage: "Cancelled by user" };
    }
    if (r1.value.status !== "finished") {
      return {
        status: "error",
        result: r1.value.result ?? null,
        errorMessage: `Run terminó con status=${r1.value.status}`,
      };
    }

    // ── Si NO pide login, es el reporte final del caso ───────────────────────
    if (!needsLogin(r1.value.result ?? "")) {
      callbacks.log("[runner] Caso completado sin requerir login.");
      return {
        status: "finished",
        result: r1.value.result ?? "(sin reporte)",
        errorMessage: null,
      };
    }

    // ── Si pide login, cedemos control al worker hasta que QA confirme ───────
    callbacks.log("[runner] Agente pidió login. Pausando…");
    const loginGate = await callbacks.onLoginRequested();
    if (!loginGate.continue) {
      callbacks.log("[runner] Login wait abortado (cancel o timeout).");
      return {
        status: "cancelled",
        result: r1.value.result ?? null,
        errorMessage: "Cancelled while waiting for login",
      };
    }

    // ── Turno 2: follow-up post-login ────────────────────────────────────────
    callbacks.log("[runner] Enviando follow-up post-login…");
    const run2 = await agent.send(FOLLOW_UP_AFTER_LOGIN);
    callbacks.log(`[runner] run2.id=${run2.id}`);

    const r2 = await waitWithCancellation(run2, callbacks);
    if (r2.cancelled) {
      return { status: "cancelled", result: null, errorMessage: "Cancelled by user" };
    }
    if (r2.value.status !== "finished") {
      return {
        status: "error",
        result: r2.value.result ?? null,
        errorMessage: `Run terminó con status=${r2.value.status}`,
      };
    }

    return {
      status: "finished",
      result: r2.value.result ?? "(sin reporte)",
      errorMessage: null,
    };
  } catch (err) {
    if (err instanceof CursorAgentError) {
      return {
        status: "error",
        result: null,
        errorMessage: `CursorAgentError: ${err.message} (retryable=${err.isRetryable})`,
      };
    }
    return {
      status: "error",
      result: null,
      errorMessage: `Excepción no manejada: ${(err as Error)?.message ?? String(err)}`,
    };
  } finally {
    if (agent) {
      try {
        await agent[Symbol.asyncDispose]();
      } catch (disposeErr) {
        callbacks.log(`[runner] dispose error (ignorado): ${(disposeErr as Error)?.message}`);
      }
    }
  }
}

/**
 * Espera el resultado de un Run mientras lanza el stream de eventos en paralelo
 * (para visibilidad en log) y polea shouldCancel() periódicamente. Si en algún
 * momento shouldCancel() devuelve true, llama run.cancel() y retorna cancelled.
 */
async function waitWithCancellation(
  run: Run,
  callbacks: AgentRunnerCallbacks,
): Promise<{ cancelled: false; value: Awaited<ReturnType<Run["wait"]>> } | { cancelled: true }> {
  // Stream para log en vivo (no afecta el wait).
  const streamPromise = streamRunForLog(run, callbacks);

  // Carrera entre el wait() del agente y un timer que polea shouldCancel.
  // Si shouldCancel se activa, cancelamos el run y resolvemos como cancelled.
  let cancelTimer: ReturnType<typeof setInterval> | null = null;
  let wasCancelled = false;

  const cancelPromise = new Promise<"cancelled">((resolve) => {
    cancelTimer = setInterval(() => {
      if (callbacks.shouldCancel()) {
        wasCancelled = true;
        try {
          run.cancel();
        } catch {
          // ignoramos errores de cancel: el wait() resolverá igual
        }
        resolve("cancelled");
      }
    }, 1000);
  });

  try {
    const winner = await Promise.race([run.wait(), cancelPromise]);
    if (winner === "cancelled") {
      return { cancelled: true };
    }
    // Esperamos al stream para no dejar promesa colgando.
    await streamPromise.catch(() => {});
    return { cancelled: false, value: winner };
  } finally {
    if (cancelTimer) clearInterval(cancelTimer);
    // Si fuimos cancelados, esperamos breve a que el stream termine para no
    // dejar handlers pendientes.
    if (wasCancelled) {
      await streamPromise.catch(() => {});
    }
  }
}

async function streamRunForLog(run: Run, callbacks: AgentRunnerCallbacks): Promise<void> {
  try {
    for await (const event of run.stream()) {
      if (event.type === "tool_call" && event.status === "running") {
        callbacks.log(`  tool: ${event.name}`);
      } else if (event.type === "assistant") {
        for (const block of event.message.content) {
          if (block.type === "text" && block.text.trim()) {
            const preview = block.text.substring(0, 160).replace(/\n+/g, " ");
            const ellipsis = block.text.length > 160 ? " …" : "";
            callbacks.log(`  assistant: ${preview}${ellipsis}`);
          }
        }
      } else if (event.type === "status" && event.status === "FINISHED") {
        callbacks.log(`  status: FINISHED`);
      }
    }
  } catch (err) {
    callbacks.log(`  stream error: ${(err as Error)?.message ?? err}`);
  }
}
