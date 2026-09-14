-- Libreria virtuale multi-disco per il File Manager (§4, proposta aperta
-- chiusa in docs/SPECIFICHE.md): un elemento nel cestino ora vive su un
-- disco specifico tra quelli configurati (§32 lib/storage/library.ts),
-- non più implicitamente sull'unico disco dati di prima. Default 'data'
-- per le righe già esistenti: sono state create quando esisteva un solo
-- disco dati possibile.

ALTER TABLE trash_items ADD COLUMN disk_id TEXT NOT NULL DEFAULT 'data';
