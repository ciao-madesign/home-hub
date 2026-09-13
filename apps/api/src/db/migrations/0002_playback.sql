-- Stato di riproduzione per utente (§7): "salvataggio automatico del punto
-- di visione", "Home → Continua a guardare", marcatura come guardato al
-- raggiungimento della soglia finale.
--
-- Tenuto nel DB Hub (non in Jellyfin) perché è l'API centrale, non il
-- backend multimediale, a possedere lo stato utente (§2/§14).

CREATE TABLE IF NOT EXISTS playback_progress (
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id         TEXT NOT NULL,   -- id Jellyfin (Movie o Episode)
  item_type       TEXT NOT NULL CHECK (item_type IN ('movie', 'episode')),
  position_ticks  INTEGER NOT NULL DEFAULT 0,
  duration_ticks  INTEGER,
  completed       INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_playback_user_updated
  ON playback_progress(user_id, updated_at DESC);
