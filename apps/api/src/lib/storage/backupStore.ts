import { randomUUID } from "node:crypto";
import { getDb } from "../../db/index.js";

export type BackupTrigger = "auto" | "manual";
export type BackupStatus = "running" | "completed" | "completed_with_errors" | "interrupted" | "failed";

export interface BackupRunRow {
  id: string;
  trigger: BackupTrigger;
  status: BackupStatus;
  started_at: string;
  finished_at: string | null;
  files_total: number;
  files_copied: number;
  files_skipped: number;
  files_failed: number;
  bytes_copied: number;
  error_message: string | null;
}

export function createBackupRun(trigger: BackupTrigger): BackupRunRow {
  const id = randomUUID();
  getDb().prepare(`INSERT INTO backup_runs (id, trigger, status) VALUES (?, ?, 'running')`).run(id, trigger);
  return getBackupRun(id)!;
}

export function getBackupRun(id: string): BackupRunRow | null {
  const row = getDb().prepare(`SELECT * FROM backup_runs WHERE id = ?`).get(id) as unknown as
    | BackupRunRow
    | undefined;
  return row ?? null;
}

export function updateBackupRun(id: string, fields: Partial<Omit<BackupRunRow, "id">>): void {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined) as [
    keyof BackupRunRow,
    string | number | null,
  ][];
  if (entries.length === 0) return;
  const setClause = entries.map(([k]) => `${k} = ?`).join(", ");
  const values = entries.map(([, v]) => v);
  getDb()
    .prepare(`UPDATE backup_runs SET ${setClause} WHERE id = ?`)
    .run(...values, id);
}

export function listBackupRuns(limit = 20): BackupRunRow[] {
  return getDb()
    .prepare(`SELECT * FROM backup_runs ORDER BY started_at DESC LIMIT ?`)
    .all(limit) as unknown as BackupRunRow[];
}

export function getLatestRun(): BackupRunRow | null {
  const row = getDb().prepare(`SELECT * FROM backup_runs ORDER BY started_at DESC LIMIT 1`).get() as unknown as
    | BackupRunRow
    | undefined;
  return row ?? null;
}

/**
 * Un run rimasto 'running' dopo un riavvio dell'Hub API indica
 * un'interruzione (crash/perdita di alimentazione, §5), non un run ancora
 * attivo — va marcato esplicitamente prima di avviarne di nuovi.
 */
export function markStaleRunsInterrupted(): void {
  getDb()
    .prepare(
      `UPDATE backup_runs SET status = 'interrupted', finished_at = datetime('now'),
       error_message = COALESCE(error_message, 'Interrotto: Hub riavviato durante il backup')
       WHERE status = 'running'`,
    )
    .run();
}

export interface BackupRunDto {
  id: string;
  trigger: BackupTrigger;
  status: BackupStatus;
  startedAt: string;
  finishedAt: string | null;
  filesTotal: number;
  filesCopied: number;
  filesSkipped: number;
  filesFailed: number;
  bytesCopied: number;
  errorMessage: string | null;
}

export function toBackupRunDto(row: BackupRunRow): BackupRunDto {
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    filesTotal: row.files_total,
    filesCopied: row.files_copied,
    filesSkipped: row.files_skipped,
    filesFailed: row.files_failed,
    bytesCopied: row.bytes_copied,
    errorMessage: row.error_message,
  };
}
