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
