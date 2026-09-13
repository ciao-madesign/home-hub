import { randomUUID } from "node:crypto";
import { getDb } from "../../db/index.js";

export type DownloadKind = "url" | "torrent";
export type DownloadStatus = "queued" | "downloading" | "paused" | "completed" | "error";

export interface DownloadRow {
  id: string;
  user_id: string;
  kind: DownloadKind;
  source: string;
  title: string | null;
  status: DownloadStatus;
  progress_percent: number;
  total_bytes: number | null;
  downloaded_bytes: number | null;
  speed_bytes_per_sec: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** "Download completati non mantenuti in storico permanente" (§12): rimossi dopo una breve finestra. */
const COMPLETED_RETENTION_MS = 5 * 60 * 1000;

export interface DownloadDto {
  id: string;
  kind: DownloadKind;
  source: string;
  title: string | null;
  status: DownloadStatus;
  progressPercent: number;
  totalBytes: number | null;
  downloadedBytes: number | null;
  speedBytesPerSec: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export function toDownloadDto(row: DownloadRow): DownloadDto {
  return {
    id: row.id,
    kind: row.kind,
    source: row.source,
    title: row.title,
    status: row.status,
    progressPercent: row.progress_percent,
    totalBytes: row.total_bytes,
    downloadedBytes: row.downloaded_bytes,
    speedBytesPerSec: row.speed_bytes_per_sec,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export function createDownload(userId: string, kind: DownloadKind, source: string): DownloadRow {
  const id = randomUUID();
  getDb()
    .prepare(`INSERT INTO downloads (id, user_id, kind, source) VALUES (?, ?, ?, ?)`)
    .run(id, userId, kind, source);
  return getDownload(id)!;
}

export function getDownload(id: string): DownloadRow | null {
  const row = getDb().prepare(`SELECT * FROM downloads WHERE id = ?`).get(id) as unknown as
    | DownloadRow
    | undefined;
  return row ?? null;
}

export function updateDownload(id: string, fields: Partial<DownloadRow>): void {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined) as [
    keyof DownloadRow,
    string | number | null,
  ][];
  if (entries.length === 0) return;
  const setClause = entries.map(([k]) => `${k} = ?`).join(", ");
  const values = entries.map(([, v]) => v);
  getDb()
    .prepare(`UPDATE downloads SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
    .run(...values, id);
}

export function deleteDownload(id: string): void {
  getDb().prepare(`DELETE FROM downloads WHERE id = ?`).run(id);
}

function purgeCompleted(): void {
  const cutoff = new Date(Date.now() - COMPLETED_RETENTION_MS).toISOString();
  // datetime(...) su entrambi i lati: updated_at è in formato SQLite
  // ("YYYY-MM-DD HH:MM:SS"), cutoff in ISO8601 — non confrontabili come
  // semplici stringhe senza normalizzarli allo stesso formato.
  getDb()
    .prepare(`DELETE FROM downloads WHERE status = 'completed' AND datetime(updated_at) < datetime(?)`)
    .run(cutoff);
}

export function listDownloads(): DownloadRow[] {
  purgeCompleted();
  return getDb()
    .prepare(`SELECT * FROM downloads ORDER BY created_at ASC`)
    .all() as unknown as DownloadRow[];
}

export function listByStatus(status: DownloadStatus): DownloadRow[] {
  return getDb()
    .prepare(`SELECT * FROM downloads WHERE status = ? ORDER BY created_at ASC`)
    .all(status) as unknown as DownloadRow[];
}

/** Ripristina lo stato dopo un riavvio dell'Hub API: nessun processo/torrent è realmente in corso. */
export function resetStaleDownloadingRows(): void {
  getDb()
    .prepare(`UPDATE downloads SET status = 'queued', updated_at = datetime('now') WHERE status = 'downloading'`)
    .run();
}
