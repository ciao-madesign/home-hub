import path from "node:path";
import { walkAcrossDisks } from "../storage/library.js";
import { listGames } from "./store.js";

/** Estensione file → piattaforma, usata per la scansione delle cartelle monitorate (§10/§13). */
const EXTENSION_PLATFORM_MAP: Record<string, string> = {
  ".nes": "nes",
  ".sfc": "snes",
  ".smc": "snes",
  ".md": "genesis",
  ".gen": "genesis",
  ".gba": "gba",
};

export interface ScanCandidate {
  romPath: string;
  suggestedTitle: string;
  platform: string;
}

/**
 * Importazione automatica con conferma dell'utente (§13): non aggiunge
 * nulla al catalogo da sola, propone solo i file non ancora presenti.
 * Libreria virtuale multi-disco (§4): la cartella "Games" viene cercata
 * su tutti i dischi dati configurati (`lib/storage/library.ts`), non
 * solo su quello primario — `rom_path` resta un percorso relativo
 * portabile, indipendente da quale disco lo ospita fisicamente (risolto
 * al bisogno, stesso principio del File Manager).
 */
export async function scanForNewGames(): Promise<ScanCandidate[]> {
  const known = new Set(listGames().map((g) => g.rom_path).filter((p): p is string => p !== null));
  const candidates: ScanCandidate[] = [];

  const entries = await walkAcrossDisks("Games");
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const ext = path.extname(entry.relPath).toLowerCase();
    const platform = EXTENSION_PLATFORM_MAP[ext];
    if (!platform) continue;
    if (known.has(entry.relPath)) continue;

    candidates.push({
      romPath: entry.relPath,
      suggestedTitle: path.basename(entry.relPath, ext),
      platform,
    });
  }

  return candidates;
}
