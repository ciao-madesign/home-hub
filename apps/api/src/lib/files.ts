import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { getDb } from "../db/index.js";
import { parseSqliteTimestamp } from "./sqliteDate.js";
import { assertSafeRelativePath, UnsafePathError } from "./pathSafety.js";
import {
  absOnDisk,
  getDiskById,
  mergedReaddir,
  pickWriteDisk,
  resolveAcrossDisks,
  walkAcrossDisks,
} from "./storage/library.js";
import type { ConfiguredDisk } from "./storage/disks.js";

export type Scope = "shared" | "private";

export class FilesError extends Error {
  constructor(
    message: string,
    public code: "invalid_path" | "not_found" | "conflict" = "invalid_path",
  ) {
    super(message);
  }
}

/** Durata del cestino (§11): 7 giorni prima della rimozione definitiva. */
const TRASH_RETENTION_DAYS = 7;

/**
 * Percorsi RELATIVI a un disco dati (mai assoluti): la scrittura vera e
 * propria passa da lib/storage/library.ts, che decide su quale dei
 * dischi configurati (§4) un percorso relativo vive fisicamente — questo
 * modulo non assume più un unico disco dati.
 */
function scopeRelRoot(scope: Scope, userId: string): string {
  return scope === "shared" ? "Files/shared" : `Files/private/${userId}`;
}
function trashRelRoot(userId: string): string {
  return `Files/.trash/${userId}`;
}

function safeSegments(relPath: string): string[] {
  try {
    return assertSafeRelativePath(relPath);
  } catch (err) {
    if (err instanceof UnsafePathError) throw new FilesError("Percorso non valido");
    throw err;
  }
}

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  size: number | null;
  modifiedAt: string;
}

export async function listDirectory(
  scope: Scope,
  userId: string,
  relPath: string,
): Promise<FileEntry[]> {
  const root = scopeRelRoot(scope, userId);
  const segments = safeSegments(relPath);
  const merged = await mergedReaddir(root, segments);

  const result: FileEntry[] = [];
  for (const { name, dirent, disk } of merged) {
    if (name.startsWith(".")) continue; // nasconde .trash e file nascosti
    const stat = await fs.stat(absOnDisk(disk, root, [...segments, name]));
    result.push({
      name,
      isDirectory: dirent.isDirectory(),
      size: dirent.isDirectory() ? null : stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  }
  result.sort((a, b) =>
    a.isDirectory !== b.isDirectory ? (a.isDirectory ? -1 : 1) : a.name.localeCompare(b.name),
  );
  return result;
}

export async function createFolder(
  scope: Scope,
  userId: string,
  relPath: string,
  name: string,
): Promise<void> {
  if (!name || /[/\\]/.test(name)) throw new FilesError("Nome cartella non valido");
  const root = scopeRelRoot(scope, userId);
  const segments = safeSegments(relPath);

  // Verificato su TUTTI i dischi (non solo quello che riceverà la
  // scrittura, §4): evita di creare due cartelle omonime sparse su
  // dischi diversi quando l'utente chiede esplicitamente una cartella.
  if (await resolveAcrossDisks(root, [...segments, name])) {
    throw new FilesError("Esiste già un elemento con questo nome", "conflict");
  }

  const disk = await pickWriteDisk();
  const parent = absOnDisk(disk, root, segments);
  await fs.mkdir(parent, { recursive: true });
  try {
    await fs.mkdir(path.join(parent, name));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new FilesError("Esiste già un elemento con questo nome", "conflict");
    }
    throw err;
  }
}

export async function renameEntry(
  scope: Scope,
  userId: string,
  relPath: string,
  newName: string,
): Promise<void> {
  if (!newName || /[/\\]/.test(newName)) throw new FilesError("Nome non valido");
  const root = scopeRelRoot(scope, userId);
  const found = await resolveAcrossDisks(root, safeSegments(relPath));
  if (!found) throw new FilesError("Elemento non trovato", "not_found");

  const dest = path.join(path.dirname(found.abs), newName);
  try {
    await fs.rename(found.abs, dest);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new FilesError("Elemento non trovato", "not_found");
    if (code === "ENOTEMPTY" || code === "EEXIST") {
      throw new FilesError("Esiste già un elemento con questo nome", "conflict");
    }
    throw err;
  }
}

/**
 * Spostare tra scope shared/private è anche il modo per cambiare la privacy
 * di un contenuto (§11/§20). Resta sempre sul disco fisico dove già si
 * trova (§4 riguarda la scelta del disco per i NUOVI file, non i move):
 * un semplice rename, mai una copia cross-disco.
 */
export async function moveEntry(
  scope: Scope,
  userId: string,
  relPath: string,
  destScope: Scope,
  destRelPath: string,
): Promise<void> {
  const srcRoot = scopeRelRoot(scope, userId);
  const found = await resolveAcrossDisks(srcRoot, safeSegments(relPath));
  if (!found) throw new FilesError("Elemento non trovato", "not_found");

  const destRoot = scopeRelRoot(destScope, userId);
  const destDir = absOnDisk(found.disk, destRoot, safeSegments(destRelPath));
  await fs.mkdir(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(found.abs));
  try {
    await fs.rename(found.abs, dest);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new FilesError("Elemento non trovato", "not_found");
    if (code === "EEXIST" || code === "ENOTEMPTY") {
      throw new FilesError("Esiste già un elemento con questo nome nella destinazione", "conflict");
    }
    throw err;
  }
}

export async function resolveExistingPath(scope: Scope, userId: string, relPath: string): Promise<string> {
  const found = await resolveAcrossDisks(scopeRelRoot(scope, userId), safeSegments(relPath));
  if (!found) throw new FilesError("Elemento non trovato", "not_found");
  return found.abs;
}

export async function saveUpload(
  scope: Scope,
  userId: string,
  relPath: string,
  fileName: string,
  stream: NodeJS.ReadableStream,
): Promise<void> {
  if (!fileName || /[/\\]/.test(fileName)) throw new FilesError("Nome file non valido");
  const root = scopeRelRoot(scope, userId);
  const segments = safeSegments(relPath);
  const disk = await pickWriteDisk();
  const dir = absOnDisk(disk, root, segments);
  await fs.mkdir(dir, { recursive: true });
  // Formato originale mantenuto, nessuna compressione (§11).
  await pipeline(stream, fsSync.createWriteStream(path.join(dir, fileName)));
}

// --- Cestino (§11) ----------------------------------------------------------

interface TrashRow {
  id: string;
  user_id: string;
  scope: Scope;
  original_path: string;
  name: string;
  is_directory: number;
  trash_path: string;
  disk_id: string;
  trashed_at: string;
}

export async function moveToTrash(scope: Scope, userId: string, relPath: string): Promise<void> {
  const root = scopeRelRoot(scope, userId);
  const found = await resolveAcrossDisks(root, safeSegments(relPath));
  if (!found) throw new FilesError("Elemento non trovato", "not_found");
  const stat = await fs.stat(found.abs);

  const id = randomUUID();
  const trashName = `${id}__${path.basename(found.abs)}`;
  // Stesso disco di origine (§4): un rename dentro lo stesso filesystem è
  // istantaneo, spostare nel cestino su un disco diverso richiederebbe una
  // copia completa solo per un'operazione pensata per essere reversibile.
  const trashDir = absOnDisk(found.disk, trashRelRoot(userId), []);
  await fs.mkdir(trashDir, { recursive: true });
  await fs.rename(found.abs, path.join(trashDir, trashName));

  getDb()
    .prepare(
      `INSERT INTO trash_items (id, user_id, scope, original_path, name, is_directory, trash_path, disk_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, userId, scope, relPath, path.basename(found.abs), stat.isDirectory() ? 1 : 0, trashName, found.disk.id);
}

function trashRow(userId: string, row: TrashRow): { disk: ConfiguredDisk; abs: string } {
  const disk = getDiskById(row.disk_id);
  if (!disk) throw new FilesError("Disco del cestino non più configurato", "not_found");
  return { disk, abs: absOnDisk(disk, trashRelRoot(userId), [row.trash_path]) };
}

export async function purgeExpiredTrash(userId: string): Promise<void> {
  const db = getDb();
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86_400_000).toISOString();
  // datetime(...) normalizza entrambi i lati: trashed_at è in formato
  // SQLite, cutoff in ISO8601 — vedi lib/sqliteDate.ts per il motivo.
  const expired = db
    .prepare(`SELECT * FROM trash_items WHERE user_id = ? AND datetime(trashed_at) < datetime(?)`)
    .all(userId, cutoff) as unknown as TrashRow[];

  for (const item of expired) {
    const { abs } = trashRow(userId, item);
    await fs.rm(abs, { recursive: true, force: true });
    db.prepare(`DELETE FROM trash_items WHERE id = ?`).run(item.id);
  }
}

export interface TrashEntry {
  id: string;
  scope: Scope;
  originalPath: string;
  name: string;
  isDirectory: boolean;
  trashedAt: string;
  expiresAt: string;
}

export async function listTrash(userId: string): Promise<TrashEntry[]> {
  await purgeExpiredTrash(userId);
  const rows = getDb()
    .prepare(`SELECT * FROM trash_items WHERE user_id = ? ORDER BY trashed_at DESC`)
    .all(userId) as unknown as TrashRow[];

  return rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    originalPath: r.original_path,
    name: r.name,
    isDirectory: r.is_directory === 1,
    trashedAt: r.trashed_at,
    expiresAt: new Date(
      parseSqliteTimestamp(r.trashed_at).getTime() + TRASH_RETENTION_DAYS * 86_400_000,
    ).toISOString(),
  }));
}

function getTrashRow(userId: string, trashId: string): TrashRow {
  const row = getDb()
    .prepare(`SELECT * FROM trash_items WHERE id = ? AND user_id = ?`)
    .get(trashId, userId) as unknown as TrashRow | undefined;
  if (!row) throw new FilesError("Elemento non trovato nel cestino", "not_found");
  return row;
}

export async function restoreFromTrash(userId: string, trashId: string): Promise<void> {
  const row = getTrashRow(userId, trashId);
  const { disk, abs: trashAbs } = trashRow(userId, row);
  const destDir = path.dirname(absOnDisk(disk, scopeRelRoot(row.scope, userId), safeSegments(row.original_path)));
  await fs.mkdir(destDir, { recursive: true });

  let dest = path.join(destDir, row.name);
  if (fsSync.existsSync(dest)) {
    const parsed = path.parse(row.name);
    dest = path.join(destDir, `${parsed.name} (ripristinato)${parsed.ext}`);
  }

  await fs.rename(trashAbs, dest);
  getDb().prepare(`DELETE FROM trash_items WHERE id = ?`).run(trashId);
}

export async function deletePermanentlyFromTrash(userId: string, trashId: string): Promise<void> {
  const row = getTrashRow(userId, trashId);
  const { abs } = trashRow(userId, row);
  await fs.rm(abs, { recursive: true, force: true });
  getDb().prepare(`DELETE FROM trash_items WHERE id = ?`).run(trashId);
}

/** Eliminazione definitiva immediata, senza passare dal cestino — richiede conferma aggiuntiva lato client (§11). */
export async function deletePermanentDirect(
  scope: Scope,
  userId: string,
  relPath: string,
): Promise<void> {
  const found = await resolveAcrossDisks(scopeRelRoot(scope, userId), safeSegments(relPath));
  if (!found) return; // già assente: coerente con la force:true di prima (mai un errore per qualcosa già sparito)
  await fs.rm(found.abs, { recursive: true, force: true });
}

// --- Duplicati (§11: rilevamento automatico, nessuna eliminazione automatica) ----

async function hashFile(absPath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of fsSync.createReadStream(absPath)) hash.update(chunk);
  return hash.digest("hex");
}

export interface DuplicateGroup {
  hash: string;
  size: number;
  files: { path: string; modifiedAt: string }[];
}

/** Cerca duplicati anche tra dischi diversi (§4): due copie identiche sparse su due dischi sono comunque un duplicato. */
export async function findDuplicates(scope: Scope, userId: string): Promise<DuplicateGroup[]> {
  const root = scopeRelRoot(scope, userId);
  const walked = (await walkAcrossDisks(root)).filter((f) => !f.isDirectory);
  const files = await Promise.all(walked.map(async (f) => ({ ...f, stat: await fs.stat(f.abs) })));

  // Raggruppa prima per dimensione: file di dimensione diversa non sono mai duplicati,
  // evita di calcolare l'hash su tutta la libreria.
  const bySize = new Map<number, typeof files>();
  for (const f of files) {
    if (!bySize.has(f.stat.size)) bySize.set(f.stat.size, []);
    bySize.get(f.stat.size)!.push(f);
  }

  const groups: DuplicateGroup[] = [];
  for (const candidates of bySize.values()) {
    if (candidates.length < 2) continue;
    const byHash = new Map<string, typeof candidates>();
    for (const f of candidates) {
      const hash = await hashFile(f.abs);
      if (!byHash.has(hash)) byHash.set(hash, []);
      byHash.get(hash)!.push(f);
    }
    for (const [hash, group] of byHash) {
      if (group.length < 2) continue;
      groups.push({
        hash,
        size: group[0].stat.size,
        files: group.map((g) => ({ path: g.relPath, modifiedAt: g.stat.mtime.toISOString() })),
      });
    }
  }
  return groups;
}

// --- Ricerca per nome (§16: "solo per nome, cartella e metadati") -----------

export interface SearchResult {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number | null;
  modifiedAt: string;
}

export async function searchByName(
  scope: Scope,
  userId: string,
  query: string,
): Promise<SearchResult[]> {
  const needle = query.toLowerCase();
  const root = scopeRelRoot(scope, userId);
  const walked = await walkAcrossDisks(root);

  const results: SearchResult[] = [];
  for (const f of walked) {
    if (!path.basename(f.relPath).toLowerCase().includes(needle)) continue;
    const stat = await fs.stat(f.abs);
    results.push({
      path: f.relPath,
      name: path.basename(f.relPath),
      isDirectory: f.isDirectory,
      size: f.isDirectory ? null : stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  }
  return results;
}
