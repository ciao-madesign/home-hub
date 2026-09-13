-- File Manager (§11): cestino con durata 7 giorni e ripristino.
-- Il file fisico viene spostato in Files/.trash/<userId>/<trash_path>;
-- questa riga conserva dove si trovava prima, per poterlo ripristinare.

CREATE TABLE IF NOT EXISTS trash_items (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope          TEXT NOT NULL CHECK (scope IN ('shared', 'private')),
  original_path  TEXT NOT NULL,  -- percorso relativo alla root dello scope, prima dell'eliminazione
  name           TEXT NOT NULL,
  is_directory   INTEGER NOT NULL DEFAULT 0,
  trash_path     TEXT NOT NULL,  -- percorso relativo a Files/.trash/<userId>/ dove risiedono i byte
  trashed_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trash_user_trashed ON trash_items(user_id, trashed_at);
