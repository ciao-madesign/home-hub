import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { dataDiskCandidates, type ConfiguredDisk } from "./disks.js";

/**
 * Libreria virtuale multi-disco (§4, proposta aperta chiusa in
 * docs/SPECIFICHE.md): usata da File Manager (lib/files.ts, cartella
 * `Files/`), Gaming (lib/gaming/, cartella `Games/`) e Download Manager
 * (lib/downloads/manager.ts, cartella `Downloads/`). Photos non
 * partecipa: Immich gestisce il proprio storage in autonomia (bind-mount
 * Docker separato), l'Hub API non tocca mai quei file direttamente.
 *
 * Funziona come un semplice union filesystem in user space (stesso
 * principio di strumenti come mergerfs, qui reimplementato ad-hoc perché
 * serve solo per queste cartelle): ogni disco con `role: "data"`
 * (dataDiskCandidates(), sempre almeno HUB_DATA_ROOT) ha una propria
 * copia fisica dell'albero (`Files/...`, `Games/...`, `Downloads/...`);
 * le funzioni di lettura qui sotto uniscono il contenuto di tutti i
 * dischi raggiungibili come se fosse un'unica cartella, quelle di
 * scrittura scelgono UN disco (quello con più spazio libero) per il
 * nuovo contenuto. Non c'è redistribuzione dei file già esistenti: la
 * scelta del disco riguarda solo cosa viene creato da questo momento in
 * poi, come da §4.
 */

async function diskFreeBytes(disk: ConfiguredDisk): Promise<number | null> {
  try {
    const stat = await fs.statfs(disk.path);
    return stat.bavail * stat.bsize;
  } catch {
    return null; // disco non montato/non raggiungibile: escluso dalla scelta
  }
}

/** Il disco dati con più spazio libero in questo momento, tra quelli raggiungibili. Sempre almeno "data" (HUB_DATA_ROOT), che non viene mai escluso anche se statfs fallisse (garantisce che scrivere non blocchi mai il File Manager). */
export async function pickWriteDisk(): Promise<ConfiguredDisk> {
  const candidates = dataDiskCandidates();
  const primary = candidates.find((d) => d.id === "data") ?? candidates[0];

  const withFreeSpace = await Promise.all(
    candidates.map(async (disk) => ({ disk, free: await diskFreeBytes(disk) })),
  );
  const reachable = withFreeSpace.filter((d): d is { disk: ConfiguredDisk; free: number } => d.free !== null);
  if (reachable.length === 0) return primary;

  return reachable.reduce((best, cur) => (cur.free > best.free ? cur : best)).disk;
}

/** Trova su quale disco vive `relPath` sotto `relativeRoot` (es. "Files/shared"), provando i dischi in ordine — il primo che esiste vince. */
export async function resolveAcrossDisks(
  relativeRoot: string,
  relSegments: string[],
): Promise<{ disk: ConfiguredDisk; abs: string } | null> {
  for (const disk of dataDiskCandidates()) {
    const abs = path.join(disk.path, relativeRoot, ...relSegments);
    try {
      await fs.stat(abs);
      return { disk, abs };
    } catch {
      // non su questo disco, prova il successivo
    }
  }
  return null;
}

/** Percorso assoluto di `relPath` su un disco specifico (per scritture: il disco lo sceglie il chiamante, es. via pickWriteDisk()). */
export function absOnDisk(disk: ConfiguredDisk, relativeRoot: string, relSegments: string[]): string {
  return path.join(disk.path, relativeRoot, ...relSegments);
}

export interface MergedEntry {
  name: string;
  dirent: fsSync.Dirent;
  disk: ConfiguredDisk;
}

/**
 * Elenco unito della stessa cartella logica su tutti i dischi raggiungibili.
 * In caso di omonimia tra dischi (non dovrebbe capitare: ogni nuovo file
 * sceglie un solo disco alla creazione, ma un utente potrebbe copiare
 * manualmente qualcosa con lo stesso nome su un altro disco) vince il
 * disco con priorità più alta (l'ordine di dataDiskCandidates(), "data"
 * per primo) — caso limite noto, non risolto automaticamente.
 */
export async function mergedReaddir(relativeRoot: string, relSegments: string[]): Promise<MergedEntry[]> {
  const seen = new Map<string, MergedEntry>();
  for (const disk of dataDiskCandidates()) {
    const dir = path.join(disk.path, relativeRoot, ...relSegments);
    let entries: fsSync.Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue; // cartella assente su questo disco: nessun contributo, non un errore
    }
    for (const dirent of entries) {
      if (!seen.has(dirent.name)) seen.set(dirent.name, { name: dirent.name, dirent, disk });
    }
  }
  return [...seen.values()];
}

export interface WalkedAcrossDisks {
  relPath: string; // relativo a relativeRoot, indipendente dal disco fisico
  abs: string;
  disk: ConfiguredDisk;
  isDirectory: boolean;
}

/**
 * Come mergedReaddir ma ricorsivo, per ricerca/duplicati su tutta la
 * libreria. Include anche le cartelle (isDirectory: true) — chi cerca
 * solo file (es. findDuplicates) le filtra da sé.
 */
export async function walkAcrossDisks(relativeRoot: string): Promise<WalkedAcrossDisks[]> {
  const out: WalkedAcrossDisks[] = [];

  async function walk(disk: ConfiguredDisk, dir: string): Promise<void> {
    let entries: fsSync.Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      const isDirectory = entry.isDirectory();
      out.push({ relPath: path.relative(path.join(disk.path, relativeRoot), abs), abs, disk, isDirectory });
      if (isDirectory) await walk(disk, abs);
    }
  }

  for (const disk of dataDiskCandidates()) {
    await walk(disk, path.join(disk.path, relativeRoot));
  }
  return out;
}

export function getDiskById(id: string): ConfiguredDisk | null {
  return dataDiskCandidates().find((d) => d.id === id) ?? null;
}
