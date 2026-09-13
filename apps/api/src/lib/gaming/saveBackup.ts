import fs from "node:fs/promises";
import path from "node:path";
import { assertSafeRelativePath, UnsafePathError } from "../pathSafety.js";
import { createSaveBackup, getGame, GamingError, toSaveBackupDto, type SaveBackupDto } from "./store.js";
import { gamesRoot } from "./scan.js";

/**
 * Backup centralizzato dei salvataggi (§10: "l'Hub mantiene un backup
 * centralizzato dei salvataggi"): copia il percorso di salvataggio
 * configurato per il gioco in Games/.saves/<gameId>/<timestamp>/.
 */
export async function backupSave(gameId: string): Promise<SaveBackupDto> {
  const game = getGame(gameId);
  if (!game) throw new GamingError("Gioco non trovato");
  if (!game.save_path) {
    throw new GamingError("Nessun percorso di salvataggio configurato per questo gioco", "conflict");
  }

  const root = gamesRoot();
  let sourceAbs: string;
  try {
    sourceAbs = path.join(root, ...assertSafeRelativePath(game.save_path));
  } catch (err) {
    if (err instanceof UnsafePathError) throw new GamingError("Percorso di salvataggio non valido");
    throw err;
  }

  const stat = await fs.stat(sourceAbs).catch(() => null);
  if (!stat) throw new GamingError("Percorso di salvataggio non trovato sul disco");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destRelative = `${gameId}/${timestamp}`;
  const destAbs = path.join(root, ".saves", destRelative);
  await fs.mkdir(path.dirname(destAbs), { recursive: true });
  await fs.cp(sourceAbs, destAbs, { recursive: true });

  return toSaveBackupDto(createSaveBackup(gameId, destRelative));
}
