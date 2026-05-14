// Tipos compartidos entre worker, db, y agent-runner.
// Mantén en sync con backend/app/models.py::TestRun y schemas.py::TestRunStatus.

export type TestRunStatus =
  | "queued"
  | "running"
  | "waiting_login"
  | "finished"
  | "error"
  | "cancelled";

/**
 * Forma de fila tal como better-sqlite3 la devuelve. Los booleanos vienen como
 * 0/1 (no true/false) porque SQLite no tiene tipo bool real.
 */
export interface TestRunRow {
  id: number;
  user_id: number;
  project_id: number;
  case_ids: string;          // JSON serializado (lista de int) — parseamos al usar
  env: string;
  base_url: string;
  model_id: string;
  prompt: string;
  status: TestRunStatus;
  continue_signal: 0 | 1;
  cancel_signal: 0 | 1;
  agent_id: string | null;
  result: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

/** Configuración leída de .env al boot. */
export interface WorkerConfig {
  cursorApiKey: string;
  dbPath: string;
  defaultModelId: string;
  pollIntervalMs: number;
  maxRunMs: number;
  maxLoginWaitMs: number;
}
