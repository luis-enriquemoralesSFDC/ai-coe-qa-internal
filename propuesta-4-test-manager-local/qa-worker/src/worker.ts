/**
 * QA Worker — entry point.
 *
 * Loop principal:
 *   while (!shuttingDown) {
 *     row = db.claimNextQueued()
 *     if (!row) { sleep poll; continue }
 *     processOneRun(row)   // ← donde toda la lógica del agente ocurre
 *   }
 *
 * Una sola fila a la vez = un solo Chromium activo. Si en el futuro queremos
 * paralelismo, levantar varios procesos worker (cada uno con su `cwd` distinto).
 *
 * Shutdown limpio:
 *   - SIGINT/SIGTERM → marcamos shuttingDown=true.
 *   - Si hay un run en curso, NO lo abortamos automáticamente: dejamos que
 *     termine (peor caso: el operador hace POST /cancel y lo aborta).
 *   - Cerramos la conexión a SQLite al final.
 */
import "dotenv/config";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runOneTestRun } from "./agent-runner.js";
import { WorkerDb } from "./db.js";
import type { TestRunRow, WorkerConfig } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let shuttingDown = false;

function loadConfig(): WorkerConfig {
  const apiKey = process.env.CURSOR_API_KEY ?? "";
  if (!apiKey) {
    console.error("[qa-worker] FATAL: Falta CURSOR_API_KEY en .env");
    process.exit(1);
  }

  const dbPath = process.env.QA_WORKER_DB_PATH ?? "../backend/qa_manager.db";
  const defaultModelId = process.env.QA_WORKER_MODEL_ID ?? "claude-haiku-4-5";

  const pollIntervalMs = parseInt(process.env.QA_WORKER_POLL_INTERVAL_MS ?? "2000", 10);
  const maxRunMs = parseInt(process.env.QA_WORKER_MAX_RUN_MS ?? "900000", 10);
  const maxLoginWaitMs = parseInt(process.env.QA_WORKER_MAX_LOGIN_WAIT_MS ?? "1800000", 10);

  return {
    cursorApiKey: apiKey,
    dbPath: resolve(__dirname, "..", dbPath),
    defaultModelId,
    pollIntervalMs,
    maxRunMs,
    maxLoginWaitMs,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(line: string): void {
  console.log(`[${ts()}] ${line}`);
}

async function processOneRun(
  row: TestRunRow,
  db: WorkerDb,
  config: WorkerConfig,
): Promise<void> {
  log(`▶ Iniciando run id=${row.id} project=${row.project_id} cases=${row.case_ids}`);
  const runStartedAt = Date.now();

  // cwd dedicado por run para aislar artefactos de Playwright (.playwright-mcp/).
  // El SDK exige que el directorio exista antes de pasarlo, así que lo creamos.
  // Si en el futuro quieres conservar evidencia, puedes leer este folder.
  const runCwd = join(__dirname, "..", "runs", `run-${row.id}`);
  mkdirSync(runCwd, { recursive: true });

  const modelId = row.model_id || config.defaultModelId;

  const result = await runOneTestRun({
    apiKey: config.cursorApiKey,
    modelId,
    prompt: row.prompt,
    cwd: runCwd,
    callbacks: {
      log: (line) => log(`  [run ${row.id}] ${line}`),

      onAgentId: (agentId) => {
        try {
          db.setAgentId(row.id, agentId);
        } catch (err) {
          log(`  [run ${row.id}] WARNING: no pude persistir agent_id: ${(err as Error)?.message}`);
        }
      },

      shouldCancel: () => {
        if (shuttingDown) return false;  // shutdown limpio: dejar terminar
        // Timeout duro por run.
        if (Date.now() - runStartedAt > config.maxRunMs) {
          log(`  [run ${row.id}] Timeout duro alcanzado (${config.maxRunMs}ms).`);
          return true;
        }
        // Cancel solicitado por el QA via POST /api/test-runs/{id}/cancel.
        const fresh = db.getById(row.id);
        return fresh?.cancel_signal === 1;
      },

      onLoginRequested: async () => {
        log(`  [run ${row.id}] ⏸ Pausa: esperando login del QA…`);
        db.setStatus(row.id, "waiting_login");

        const waitStartedAt = Date.now();
        while (true) {
          if (shuttingDown) {
            return { continue: false };
          }
          const fresh = db.getById(row.id);
          if (!fresh) {
            log(`  [run ${row.id}] La fila desapareció. Abortando.`);
            return { continue: false };
          }
          if (fresh.cancel_signal === 1) {
            log(`  [run ${row.id}] Cancel signal recibido durante waiting_login.`);
            return { continue: false };
          }
          if (fresh.continue_signal === 1) {
            log(`  [run ${row.id}] ▶ Continue signal recibido. Reanudando.`);
            db.consumeContinueSignal(row.id);
            db.setStatus(row.id, "running");
            return { continue: true };
          }
          if (Date.now() - waitStartedAt > config.maxLoginWaitMs) {
            log(`  [run ${row.id}] ⏰ Timeout de espera de login (${config.maxLoginWaitMs}ms).`);
            return { continue: false };
          }
          await sleep(config.pollIntervalMs);
        }
      },
    },
  });

  // Persistir resultado final.
  if (result.status === "finished") {
    db.finishOk(row.id, result.result ?? "(sin reporte)");
    log(`✅ run id=${row.id} finished`);
  } else if (result.status === "cancelled") {
    db.finishError(row.id, {
      status: "cancelled",
      errorMessage: result.errorMessage ?? "cancelled",
      partialResult: result.result,
    });
    log(`🚫 run id=${row.id} cancelled`);
  } else {
    db.finishError(row.id, {
      status: "error",
      errorMessage: result.errorMessage ?? "unknown error",
      partialResult: result.result,
    });
    log(`❌ run id=${row.id} error: ${result.errorMessage}`);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  log("─".repeat(70));
  log(`qa-worker arrancando`);
  log(`  db          : ${config.dbPath}`);
  log(`  model       : ${config.defaultModelId}`);
  log(`  poll        : ${config.pollIntervalMs}ms`);
  log(`  max run     : ${config.maxRunMs}ms (${(config.maxRunMs / 60_000).toFixed(0)} min)`);
  log(`  max login   : ${config.maxLoginWaitMs}ms (${(config.maxLoginWaitMs / 60_000).toFixed(0)} min)`);
  log("─".repeat(70));

  const db = new WorkerDb(config.dbPath);

  process.on("SIGINT", () => {
    log("📥 SIGINT recibido. Terminando después del run actual…");
    shuttingDown = true;
  });
  process.on("SIGTERM", () => {
    log("📥 SIGTERM recibido. Terminando después del run actual…");
    shuttingDown = true;
  });

  while (!shuttingDown) {
    let row: TestRunRow | null = null;
    try {
      row = db.claimNextQueued();
    } catch (err) {
      log(`[loop] error en claimNextQueued: ${(err as Error)?.message}`);
      await sleep(config.pollIntervalMs * 5);
      continue;
    }

    if (!row) {
      await sleep(config.pollIntervalMs);
      continue;
    }

    try {
      await processOneRun(row, db, config);
    } catch (err) {
      // Defensa: cualquier excepción no manejada en processOneRun NO debe matar
      // el worker. Marcamos la fila en error y seguimos con la siguiente.
      log(`[loop] excepción no manejada en run ${row.id}: ${(err as Error)?.message}`);
      try {
        db.finishError(row.id, {
          status: "error",
          errorMessage: `Worker exception: ${(err as Error)?.message ?? String(err)}`,
        });
      } catch (persistErr) {
        log(`[loop] además, falló persistir el error: ${(persistErr as Error)?.message}`);
      }
    }
  }

  log("👋 Cerrando worker.");
  db.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("[qa-worker] FATAL:", err);
  process.exit(1);
});
