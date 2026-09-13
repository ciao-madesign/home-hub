-- Gaming (§10): catalogo centralizzato, macchine di esecuzione (locale +
-- PC remoti), backup dei salvataggi.

CREATE TABLE IF NOT EXISTS machines (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('local', 'remote')),
  mac_address  TEXT,             -- per Wake-on-LAN (solo remote)
  host         TEXT,             -- IP/hostname (solo remote)
  port         INTEGER,          -- porta usata per il probe di stato online/offline
  agent_url    TEXT,             -- endpoint opzionale per lo spegnimento remoto sicuro
                                  -- (nessuna credenziale memorizzata lato Hub, §26)
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS games (
  id                    TEXT PRIMARY KEY,
  title                 TEXT NOT NULL,
  platform              TEXT NOT NULL,
  cover_path            TEXT,     -- percorso relativo sotto Games/.covers/
  rom_path              TEXT,     -- percorso del file gioco/rom, relativo a Games/
  save_path             TEXT,     -- percorso file/cartella salvataggio, per il backup
  status                TEXT NOT NULL DEFAULT 'installed'
                          CHECK (status IN ('installed', 'not_installed')),
  execution_machine_id  TEXT REFERENCES machines(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_games_platform ON games(platform);

CREATE TABLE IF NOT EXISTS save_backups (
  id           TEXT PRIMARY KEY,
  game_id      TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  backup_path  TEXT NOT NULL,   -- relativo a Games/.saves/<gameId>/
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_save_backups_game ON save_backups(game_id, created_at DESC);

-- La macchina "locale" (l'Hub stesso) è sempre disponibile e non richiede
-- Wake-on-LAN/probe: viene inserita una sola volta al primo avvio.
INSERT INTO machines (id, name, kind)
SELECT 'local', 'Hub (locale)', 'local'
WHERE NOT EXISTS (SELECT 1 FROM machines WHERE id = 'local');
