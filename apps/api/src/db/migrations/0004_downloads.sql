-- Download Manager (§12): coda unica per download "normali" (yt-dlp) e
-- torrent (WebTorrent), stato non mantenuto come storico permanente —
-- le voci completate vengono rimosse (vedi lib/downloads/manager.ts).

CREATE TABLE IF NOT EXISTS downloads (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind                 TEXT NOT NULL CHECK (kind IN ('url', 'torrent')),
  source               TEXT NOT NULL,   -- URL oppure magnet URI / percorso file .torrent
  title                TEXT,            -- valorizzato appena noto (nome file, titolo torrent)
  status               TEXT NOT NULL DEFAULT 'queued'
                         CHECK (status IN ('queued', 'downloading', 'paused', 'completed', 'error')),
  progress_percent     REAL NOT NULL DEFAULT 0,
  total_bytes          INTEGER,
  downloaded_bytes     INTEGER,
  speed_bytes_per_sec  INTEGER,
  error_message        TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
