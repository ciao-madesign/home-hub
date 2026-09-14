-- Notifiche di sistema (§30: "solo eventi critici") — riavvii automatici
-- dei servizi interni esauriti (§31), e altri eventi che meritano
-- attenzione dell'utente ma non sono già visibili altrove (es. backup_runs).

CREATE TABLE IF NOT EXISTS system_events (
  id         TEXT PRIMARY KEY,
  level      TEXT NOT NULL CHECK (level IN ('info', 'critical')),
  category   TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events(created_at DESC);
