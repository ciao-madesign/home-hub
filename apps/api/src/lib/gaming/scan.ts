import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
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

export function gamesRoot(): string {
  return path.join(config.dataRoot, "Games");
}

export interface ScanCandidate {
  romPath: string;
  suggestedTitle: string;
  platform: string;
}

/**
 * Importazione automatica con conferma dell'utente (§13): non aggiunge
 * nulla al catalogo da sola, propone solo i file non ancora presenti.
 */
export async function scanForNewGames(): Promise<ScanCandidate[]> {
  const root = gamesRoot();
  await fs.mkdir(root, { recursive: true });
  const known = new Set(listGames().map((g) => g.rom_path).filter((p): p is string => p !== null));

  const candidates: ScanCandidate[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      const platform = EXTENSION_PLATFORM_MAP[ext];
      if (!platform) continue;

      const relPath = path.relative(root, abs).split(path.sep).join("/");
      if (known.has(relPath)) continue;

      candidates.push({
        romPath: relPath,
        suggestedTitle: path.basename(entry.name, ext),
        platform,
      });
    }
  }

  await walk(root);
  return candidates;
}
