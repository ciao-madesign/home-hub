import { randomUUID } from "node:crypto";
import { getDb } from "../../db/index.js";

export type MachineKind = "local" | "remote";
export type GameStatus = "installed" | "not_installed";

export interface MachineRow {
  id: string;
  name: string;
  kind: MachineKind;
  mac_address: string | null;
  host: string | null;
  port: number | null;
  agent_url: string | null;
  created_at: string;
}

export interface GameRow {
  id: string;
  title: string;
  platform: string;
  cover_path: string | null;
  rom_path: string | null;
  save_path: string | null;
  status: GameStatus;
  execution_machine_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveBackupRow {
  id: string;
  game_id: string;
  backup_path: string;
  created_at: string;
}

export class GamingError extends Error {
  constructor(
    message: string,
    public code: "not_found" | "conflict" = "not_found",
  ) {
    super(message);
  }
}

// --- Machines ----------------------------------------------------------

export function listMachines(): MachineRow[] {
  return getDb().prepare(`SELECT * FROM machines ORDER BY kind ASC, name ASC`).all() as unknown as MachineRow[];
}

export function getMachine(id: string): MachineRow | null {
  const row = getDb().prepare(`SELECT * FROM machines WHERE id = ?`).get(id) as unknown as
    | MachineRow
    | undefined;
  return row ?? null;
}

export function createMachine(
  name: string,
  macAddress: string | null,
  host: string | null,
  port: number | null,
  agentUrl: string | null,
): MachineRow {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO machines (id, name, kind, mac_address, host, port, agent_url)
       VALUES (?, ?, 'remote', ?, ?, ?, ?)`,
    )
    .run(id, name, macAddress, host, port, agentUrl);
  return getMachine(id)!;
}

export function deleteMachine(id: string): void {
  if (id === "local") throw new GamingError("La macchina locale non può essere rimossa", "conflict");
  getDb().prepare(`DELETE FROM machines WHERE id = ?`).run(id);
}

// --- Games ---------------------------------------------------------------

export function listGames(): GameRow[] {
  return getDb().prepare(`SELECT * FROM games ORDER BY title ASC`).all() as unknown as GameRow[];
}

export function getGame(id: string): GameRow | null {
  const row = getDb().prepare(`SELECT * FROM games WHERE id = ?`).get(id) as unknown as
    | GameRow
    | undefined;
  return row ?? null;
}

export function createGame(fields: {
  title: string;
  platform: string;
  romPath: string | null;
  coverPath: string | null;
  savePath: string | null;
  executionMachineId: string | null;
}): GameRow {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO games (id, title, platform, rom_path, cover_path, save_path, execution_machine_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'installed')`,
    )
    .run(
      id,
      fields.title,
      fields.platform,
      fields.romPath,
      fields.coverPath,
      fields.savePath,
      fields.executionMachineId,
    );
  return getGame(id)!;
}

export function updateGame(id: string, fields: Partial<GameRow>): void {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined) as [
    keyof GameRow,
    string | number | null,
  ][];
  if (entries.length === 0) return;
  const setClause = entries.map(([k]) => `${k} = ?`).join(", ");
  const values = entries.map(([, v]) => v);
  getDb()
    .prepare(`UPDATE games SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
    .run(...values, id);
}

export function deleteGame(id: string): void {
  getDb().prepare(`DELETE FROM games WHERE id = ?`).run(id);
}

// --- Save backups --------------------------------------------------------

export function createSaveBackup(gameId: string, backupPath: string): SaveBackupRow {
  const id = randomUUID();
  getDb()
    .prepare(`INSERT INTO save_backups (id, game_id, backup_path) VALUES (?, ?, ?)`)
    .run(id, gameId, backupPath);
  return getDb().prepare(`SELECT * FROM save_backups WHERE id = ?`).get(id) as unknown as SaveBackupRow;
}

export function listSaveBackups(gameId: string): SaveBackupRow[] {
  return getDb()
    .prepare(`SELECT * FROM save_backups WHERE game_id = ? ORDER BY created_at DESC`)
    .all(gameId) as unknown as SaveBackupRow[];
}

// --- DTO -------------------------------------------------------------------

export interface MachineDto {
  id: string;
  name: string;
  kind: MachineKind;
  macAddress: string | null;
  host: string | null;
  port: number | null;
  hasAgent: boolean;
}

export function toMachineDto(row: MachineRow): MachineDto {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    macAddress: row.mac_address,
    host: row.host,
    port: row.port,
    hasAgent: row.agent_url !== null,
  };
}

export interface GameDto {
  id: string;
  title: string;
  platform: string;
  coverPath: string | null;
  status: GameStatus;
  executionMachineId: string | null;
  hasSavePath: boolean;
}

export function toGameDto(row: GameRow): GameDto {
  return {
    id: row.id,
    title: row.title,
    platform: row.platform,
    coverPath: row.cover_path,
    status: row.status,
    executionMachineId: row.execution_machine_id,
    hasSavePath: row.save_path !== null,
  };
}

export interface SaveBackupDto {
  id: string;
  backupPath: string;
  createdAt: string;
}

export function toSaveBackupDto(row: SaveBackupRow): SaveBackupDto {
  return { id: row.id, backupPath: row.backup_path, createdAt: row.created_at };
}
