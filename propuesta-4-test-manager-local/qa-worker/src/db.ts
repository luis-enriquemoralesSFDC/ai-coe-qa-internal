/**
 * Acceso a SQLite con better-sqlite3 (sync API, mucho más simple que sqlite3 async).
 *
 * Diseño:
 * - Una sola conexión por proceso, abierta al inicio en modo WAL.
 * - Statements pre-preparados para las queries hot del loop (claim/refresh/update).
 * - Patrón "claim atómico" en `claimNextQueued`: UPDATE...WHERE...AND status='queued'
 *   garantiza que aunque hubiera dos workers (no debería, pero por defensa), solo
 *   uno se queda con la fila. SQLite hace la transición a "running" en una sola
 *   operación atómica vía rowcount.
 *
 * Compartir la BD con FastAPI: la BD ya está en journal_mode=WAL (forzado al
 * crear el worker), lo cual permite múltiples readers + un writer concurrente.
 * El backend (SQLAlchemy) y este worker no se chocan.
 */
import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { TestRunRow, TestRunStatus } from "./types.js";

export class WorkerDb {
  private db: Database.Database;

  // Statements pre-preparados (se reusan en cada poll → menor overhead).
  private stmtSelectNextQueued: Database.Statement;
  private stmtClaim: Database.Statement;
  private stmtGetById: Database.Statement;
  private stmtUpdateStatus: Database.Statement;
  private stmtUpdateAgentId: Database.Statement;
  private stmtFinishOk: Database.Statement;
  private stmtFinishError: Database.Statement;
  private stmtClearContinueSignal: Database.Statement;

  constructor(dbPath: string) {
    const absPath = resolve(dbPath);
    if (!existsSync(absPath)) {
      throw new Error(
        `[qa-worker/db] No se encontró la BD en ${absPath}. ` +
        `Asegúrate de levantar primero el backend (FastAPI) — él es quien crea la BD.`,
      );
    }

    this.db = new Database(absPath);

    // Defensa: aseguramos WAL aunque el backend ya lo haya seteado. Es idempotente.
    // WAL = múltiples lectores + un escritor sin bloquearse mutuamente.
    this.db.pragma("journal_mode = WAL");
    // synchronous=NORMAL es el sweet spot WAL: durabilidad razonable + velocidad.
    this.db.pragma("synchronous = NORMAL");
    // busy_timeout: si encuentra lock, espera hasta 5s en vez de fallar al instante.
    this.db.pragma("busy_timeout = 5000");

    this.stmtSelectNextQueued = this.db.prepare(`
      SELECT * FROM test_runs
      WHERE status = 'queued'
      ORDER BY created_at ASC
      LIMIT 1
    `);

    // Claim atómico: si la fila ya cambió de status entre el SELECT y el UPDATE
    // (otro worker la tomó), rowcount=0 y el caller sabe que debe reintentar.
    this.stmtClaim = this.db.prepare(`
      UPDATE test_runs
      SET status = 'running',
          started_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'queued'
    `);

    this.stmtGetById = this.db.prepare(`SELECT * FROM test_runs WHERE id = ?`);

    this.stmtUpdateStatus = this.db.prepare(`
      UPDATE test_runs SET status = ? WHERE id = ?
    `);

    this.stmtUpdateAgentId = this.db.prepare(`
      UPDATE test_runs SET agent_id = ? WHERE id = ?
    `);

    this.stmtFinishOk = this.db.prepare(`
      UPDATE test_runs
      SET status = 'finished',
          result = ?,
          finished_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    this.stmtFinishError = this.db.prepare(`
      UPDATE test_runs
      SET status = ?,
          error_message = ?,
          result = COALESCE(?, result),
          finished_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    this.stmtClearContinueSignal = this.db.prepare(`
      UPDATE test_runs SET continue_signal = 0 WHERE id = ?
    `);
  }

  /**
   * Toma la próxima fila queued (FIFO por created_at) y la marca running.
   * Retorna null si no hay nada pendiente o si la perdimos en race.
   */
  claimNextQueued(): TestRunRow | null {
    const row = this.stmtSelectNextQueued.get() as TestRunRow | undefined;
    if (!row) return null;

    const result = this.stmtClaim.run(row.id);
    if (result.changes === 0) {
      // Otro proceso se la quedó (o pasó a otro status). Intentaremos en el próximo poll.
      return null;
    }
    // Devolvemos la fila con el status ya actualizado a 'running' (consistencia).
    return { ...row, status: "running" };
  }

  getById(id: number): TestRunRow | null {
    return (this.stmtGetById.get(id) as TestRunRow | undefined) ?? null;
  }

  setStatus(id: number, status: TestRunStatus): void {
    this.stmtUpdateStatus.run(status, id);
  }

  setAgentId(id: number, agentId: string): void {
    this.stmtUpdateAgentId.run(agentId, id);
  }

  finishOk(id: number, result: string): void {
    this.stmtFinishOk.run(result, id);
  }

  finishError(
    id: number,
    opts: {
      status: "error" | "cancelled";
      errorMessage: string;
      partialResult?: string | null;
    },
  ): void {
    // partialResult opcional: cuando un run se cancela tras turno 1 (login
    // timeout, etc.) tenemos el reporte parcial del agente. Guardarlo permite
    // al QA ver qué hizo antes de abortar, en lugar de perderlo.
    this.stmtFinishError.run(
      opts.status,
      opts.errorMessage,
      opts.partialResult ?? null,
      id,
    );
  }

  /**
   * Consume la señal de continuar (la setea a 0 después de leerla). Idempotente:
   * si ya estaba en 0 no pasa nada.
   */
  consumeContinueSignal(id: number): void {
    this.stmtClearContinueSignal.run(id);
  }

  close(): void {
    this.db.close();
  }
}
