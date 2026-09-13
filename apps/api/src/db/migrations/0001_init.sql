-- Schema iniziale Hub Core (V1)
-- Vedi docs/SPEC_V1.md §14 (Database) e Appendice "Gestione utenti e dispositivi":
-- utenti e dispositivi sono entità separate ed estendibili, non limitate a 2 record fissi.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  password_hash TEXT,              -- NULL finché non viene impostata una password (accesso remoto)
  avatar_color  TEXT NOT NULL DEFAULT '#6366f1',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devices (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'unknown', -- browser | tv | mobile | unknown
  first_seen  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   TEXT REFERENCES devices(id) ON DELETE SET NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  origin      TEXT NOT NULL CHECK (origin IN ('local', 'remote')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
