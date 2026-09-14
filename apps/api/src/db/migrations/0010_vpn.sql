-- VPN personale (WireGuard), ultima funzione della Fase 9 (§2 in
-- docs/SPECIFICHE.md, design chiuso con l'utente). Un peer per profilo
-- per utente: "home" (split-tunnel, raggiunge solo l'Hub) e "full"
-- (tunnel completo, esce su Internet con l'IP di casa). La chiave
-- privata del client non è mai vista dall'Hub (generata lato client,
-- nel proprio client WireGuard) — qui è salvata solo la pubblica.
-- Lo stato di handshake/traffico non è persistito: va letto live da
-- `wg show`, cambia continuamente e non ha senso in uno storico.

CREATE TABLE IF NOT EXISTS vpn_peers (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  profile    TEXT NOT NULL CHECK (profile IN ('home', 'full')),
  public_key TEXT NOT NULL UNIQUE,
  address    TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vpn_peers_user ON vpn_peers(user_id);
