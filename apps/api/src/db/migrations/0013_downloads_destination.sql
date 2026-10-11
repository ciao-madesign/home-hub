-- Smistamento automatico dei download (richiesta esplicita dell'utente,
-- vedi docs/SPECIFICHE.md): invece di finire sempre in Downloads/ e
-- richiedere uno spostamento manuale (vedi docs/GUIDA_USO.md), un
-- download può scegliere fin dall'inizio di salvare direttamente dentro
-- Media/Movies o Media/Series/<percorso>.

ALTER TABLE downloads ADD COLUMN destination_kind TEXT NOT NULL DEFAULT 'downloads'
  CHECK (destination_kind IN ('downloads', 'movie', 'series'));
ALTER TABLE downloads ADD COLUMN destination_path TEXT;
