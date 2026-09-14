import { randomUUID, randomBytes, createHash } from "node:crypto";
import { getDb } from "../db/index.js";
import { config } from "../config.js";

export type SessionOrigin = "local" | "remote";

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: "admin" | "user";
  password_hash: string | null;
  avatar_color: string;
  created_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  device_id: string | null;
  token_hash: string;
  origin: SessionOrigin;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function upsertDevice(name: string, kind: string, userId: string): string {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM devices WHERE user_id = ? AND name = ?")
    .get(userId, name) as { id: string } | undefined;

  if (existing) {
    db.prepare("UPDATE devices SET last_seen = datetime('now'), kind = ? WHERE id = ?").run(
      kind,
      existing.id,
    );
    return existing.id;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO devices (id, user_id, name, kind) VALUES (?, ?, ?, ?)`,
  ).run(id, userId, name, kind);
  return id;
}

export function createSession(
  userId: string,
  origin: SessionOrigin,
  deviceId: string | null,
): { token: string; session: SessionRow } {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const id = randomUUID();
  const ttlSeconds =
    origin === "local" ? config.sessionTtlLocalSeconds : config.sessionTtlRemoteSeconds;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  db.prepare(
    `INSERT INTO sessions (id, user_id, device_id, token_hash, origin, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, deviceId, tokenHash, origin, expiresAt);

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as unknown as SessionRow;
  return { token, session };
}

export function resolveSession(token: string): { user: UserRow; session: SessionRow } | null {
  const db = getDb();
  const tokenHash = hashToken(token);
  const session = db
    .prepare("SELECT * FROM sessions WHERE token_hash = ?")
    .get(tokenHash) as SessionRow | undefined;

  if (!session) return null;
  if (session.revoked_at) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id) as
    | UserRow
    | undefined;
  if (!user) return null;

  return { user, session };
}

export function revokeSession(sessionId: string): void {
  getDb()
    .prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE id = ?")
    .run(sessionId);
}

export function revokeAllSessionsForUser(userId: string): void {
  getDb()
    .prepare(
      "UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL",
    )
    .run(userId);
}

/** Pulsante di emergenza (§24): revoca subito ogni sessione remota di ogni utente. */
export function revokeAllRemoteSessions(): number {
  const result = getDb()
    .prepare(
      "UPDATE sessions SET revoked_at = datetime('now') WHERE origin = 'remote' AND revoked_at IS NULL",
    )
    .run();
  return Number(result.changes);
}

export interface SessionWithDeviceRow extends SessionRow {
  device_name: string | null;
}

function isActive(session: SessionRow): boolean {
  if (session.revoked_at) return false;
  return new Date(session.expires_at).getTime() >= Date.now();
}

export function listActiveSessionsForUser(userId: string): SessionWithDeviceRow[] {
  const rows = getDb()
    .prepare(
      `SELECT s.*, d.name as device_name FROM sessions s
       LEFT JOIN devices d ON d.id = s.device_id
       WHERE s.user_id = ? ORDER BY s.created_at DESC`,
    )
    .all(userId) as unknown as SessionWithDeviceRow[];
  return rows.filter(isActive);
}

export interface SessionWithUserRow extends SessionWithDeviceRow {
  username: string;
  display_name: string;
}

/** Vista admin (§24): tutte le sessioni attive di tutti gli utenti. */
export function listAllActiveSessions(): SessionWithUserRow[] {
  const rows = getDb()
    .prepare(
      `SELECT s.*, d.name as device_name, u.username, u.display_name FROM sessions s
       LEFT JOIN devices d ON d.id = s.device_id
       JOIN users u ON u.id = s.user_id
       ORDER BY s.created_at DESC`,
    )
    .all() as unknown as SessionWithUserRow[];
  return rows.filter(isActive);
}

export function toSessionDto(row: SessionWithDeviceRow, currentSessionId: string) {
  return {
    id: row.id,
    deviceName: row.device_name,
    origin: row.origin,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    current: row.id === currentSessionId,
  };
}

export function getUserById(id: string): UserRow | null {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row ?? null;
}

/**
 * Recupero password (§25), metodo "procedura locale sull'Hub": chi ha
 * dimenticato la password per l'accesso remoto può sempre accedere in
 * locale (§21, nessuna password richiesta in LAN) e cambiarla da qui, o
 * farsela reimpostare da un admin. Il recupero via e-mail non è
 * implementato (richiederebbe configurare un server SMTP, non ancora
 * deciso con l'utente — vedi proposte aperte in docs/SPECIFICHE.md).
 */
export function setUserPassword(userId: string, passwordHash: string): void {
  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
}

export function publicUser(user: UserRow) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    avatarColor: user.avatar_color,
    hasPassword: user.password_hash !== null,
  };
}
