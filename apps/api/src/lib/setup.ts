import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";
import { config } from "../config.js";
import { hashPassword } from "./password.js";
import { publicUser, type UserRow } from "./sessions.js";

const SETUP_COMPLETED_KEY = "setup_completed";
export const HUB_NAME_KEY = "hub_name";

export class SetupError extends Error {
  constructor(
    message: string,
    public code: "already_completed" | "no_admin" = "already_completed",
  ) {
    super(message);
  }
}

export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

/**
 * Wizard di primo avvio (§28): finché non è completato, un secondo utente
 * sulla LAN potrebbe altrimenti riconfigurare l'Hub da capo — dopo il
 * completamento gli endpoint /api/setup/* si rifiutano sempre (vedi
 * routes/setup.ts), indipendentemente da autenticazione.
 */
export function isSetupCompleted(): boolean {
  return getSetting(SETUP_COMPLETED_KEY) === "true";
}

function assertNotCompleted(): void {
  if (isSetupCompleted()) {
    throw new SetupError("Il setup iniziale è già stato completato", "already_completed");
  }
}

export function createInitialUser(
  username: string,
  displayName: string,
  password: string | null,
  role: "admin" | "user",
) {
  assertNotCompleted();
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO users (id, username, display_name, role, password_hash)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, username, displayName, role, password ? hashPassword(password) : null);
  const user = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as unknown as UserRow;
  return publicUser(user);
}

const LIBRARY_DIRS = [
  "Files/shared",
  "Media/Movies",
  "Media/Series",
  "Photos",
  "Games",
  "Downloads",
];

/** Crea la struttura di cartelle attesa sotto HUB_DATA_ROOT (§4), se mancante. */
export async function initStorageLayout(): Promise<{ created: string[]; alreadyExisted: string[] }> {
  assertNotCompleted();
  const created: string[] = [];
  const alreadyExisted: string[] = [];

  for (const rel of LIBRARY_DIRS) {
    const abs = path.join(config.dataRoot, rel);
    const existed = await fs
      .access(abs)
      .then(() => true)
      .catch(() => false);
    await fs.mkdir(abs, { recursive: true });
    (existed ? alreadyExisted : created).push(rel);
  }

  return { created, alreadyExisted };
}

export function completeSetup(): void {
  assertNotCompleted();
  const adminCount = getDb().prepare("SELECT COUNT(*) as n FROM users WHERE role = 'admin'").get() as {
    n: number;
  };
  if (adminCount.n === 0) {
    throw new SetupError("Serve almeno un utente admin prima di completare il setup", "no_admin");
  }
  setSetting(SETUP_COMPLETED_KEY, "true");
}
