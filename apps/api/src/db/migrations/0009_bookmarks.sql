-- Web — collegamenti rapidi (non in SPEC_V1/V2, aggiunta su richiesta
-- esplicita dell'utente): apertura di siti esterni (es. streaming TV via
-- browser) nel browser reale del dispositivo, non incorporati nell'Hub
-- (la maggior parte dei siti di streaming blocca l'incorporamento via
-- iframe) — vedi docs/SPECIFICHE.md.

CREATE TABLE IF NOT EXISTS bookmarks (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  url        TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#6366f1',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
