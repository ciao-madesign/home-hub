import fs from "node:fs/promises";
import path from "node:path";
import { assertSafeRelativePath, UnsafePathError } from "../pathSafety.js";
import { absOnDisk, pickWriteDisk, resolveAcrossDisks } from "../storage/library.js";
import { createSaveBackup, getGame, GamingError, toSaveBackupDto, type SaveBackupDto } from "./store.js";

/**
 * Backup centralizzato dei salvataggi (§10: "l'Hub mantiene un backup
 * centralizzato dei salvataggi"): copia il percorso di salvataggio
 * configurato per il gioco in Games/.saves/<gameId>/<timestamp>/.
 * Libreria virtuale multi-disco (§4): l'origine viene cercata su tutti i
 * dischi dati (può stare su uno qualsiasi), la destinazione sceglie il
 * disco con più spazio libero al momento del backup — è contenuto nuovo,
 * stesso principio già seguito dal File Manager.
 */
export async function backupSave(gameId: string): Promise<SaveBackupDto> {
  const game = getGame(gameId);
  if (!game) throw new GamingError("Gioco non trovato");
  if (!game.save_path) {
    throw new GamingError("Nessun percorso di salvataggio configurato per questo gioco", "conflict");
  }

  let segments: string[];
  try {
    segments = assertSafeRelativePath(game.save_path);
  } catch (err) {
    if (err instanceof UnsafePathError) throw new GamingError("Percorso di salvataggio non valido");
    throw err;
  }

  const found = await resolveAcrossDisks("Games", segments);
  if (!found) throw new GamingError("Percorso di salvataggio non trovato sul disco");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destRelative = `${gameId}/${timestamp}`;
  const destDisk = await pickWriteDisk();
  const destAbs = absOnDisk(destDisk, "Games", [".saves", destRelative]);
  await fs.mkdir(path.dirname(destAbs), { recursive: true });
  await fs.cp(found.abs, destAbs, { recursive: true });

  return toSaveBackupDto(createSaveBackup(gameId, destRelative));
}
