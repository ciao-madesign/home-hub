import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "migrations");

let db: DatabaseSync | null = null;

function runMigrations(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    database
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((row) => (row as { name: string }).name),
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    database.exec("BEGIN");
    try {
      database.exec(sql);
      database
        .prepare("INSERT INTO _migrations (name) VALUES (?)")
        .run(file);
      database.exec("COMMIT");
    } catch (err) {
      database.exec("ROLLBACK");
      throw new Error(`Migrazione fallita (${file}): ${(err as Error).message}`);
    }
  }
}

/**
 * Seed minimo per rendere utilizzabile la selezione profilo allo scaffold
 * iniziale. Il wizard di primo avvio (Fase 4/§28) sostituirà questo seed
 * con la creazione utenti guidata.
 */
function seedDefaultUsers(database: DatabaseSync) {
  const count = database.prepare("SELECT COUNT(*) as n FROM users").get() as { n: number };
  if (count.n > 0) return;

  const insert = database.prepare(
    `INSERT INTO users (id, username, display_name, role, avatar_color) VALUES (?, ?, ?, ?, ?)`,
  );
  insert.run(randomUUID(), "owner", "Owner", "admin", "#6366f1");
  insert.run(randomUUID(), "utente", "Utente", "user", "#22c55e");
}

export function getDb(): DatabaseSync {
  if (db) return db;

  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  runMigrations(db);
  seedDefaultUsers(db);

  return db;
}
