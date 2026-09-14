-- Storage e Backup (§4/§5/§29): storico dei run di backup automatico/manuale.
-- I dischi monitorati (§29) non hanno una tabella dedicata: sono derivati
-- dal path di HUB_DATA_ROOT/HUB_BACKUP_ROOT in fase di lettura (lib/storage/disks.ts),
-- coerente con l'approccio "stateless" già usato per lo stato di sistema (§30).

CREATE TABLE IF NOT EXISTS backup_runs (
  id            TEXT PRIMARY KEY,
  trigger       TEXT NOT NULL CHECK (trigger IN ('auto', 'manual')),
  status        TEXT NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'completed', 'completed_with_errors', 'interrupted', 'failed')),
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at   TEXT,
  files_total   INTEGER NOT NULL DEFAULT 0,
  files_copied  INTEGER NOT NULL DEFAULT 0,
  files_skipped INTEGER NOT NULL DEFAULT 0,
  files_failed  INTEGER NOT NULL DEFAULT 0,
  bytes_copied  INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_backup_runs_started ON backup_runs(started_at DESC);
