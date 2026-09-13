import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { config } from "../config.js";
import { getDb } from "../db/index.js";
import { parseSqliteTimestamp } from "./sqliteDate.js";
import { assertSafeRelativePath, UnsafePathError } from "./pathSafety.js";

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

function filesRoot(): string {
  return path.join(config.dataRoot, "Files");
}
function sharedRoot(): string {
  return path.join(filesRoot(), "shared");
}
function privateRoot(userId: string): string {
  return path.join(filesRoot(), "private", userId);
}
function trashRoot(userId: string): string {
  return path.join(filesRoot(), ".trash", userId);
}

function scopeRoot(scope: Scope, userId: string): string {
  return scope === "shared" ? sharedRoot() : privateRoot(userId);
}

function resolveInRoot(root: string, relPath: string): string {
  try {
    return path.join(root, ...assertSafeRelativePath(relPath));
  } catch (err) {
    if (err instanceof UnsafePathError) throw new FilesError("Percorso non valido");
    throw err;
  }
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
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
  const root = scopeRoot(scope, userId);
  await ensureDir(root);
  const dir = resolveInRoot(root, relPath);

  let entries: fsSync.Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const result: FileEntry[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue; // nasconde .trash e file nascosti
    const stat = await fs.stat(path.join(dir, entry.name));
    result.push({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      size: entry.isDirectory() ? null : stat.size,
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
  const parent = resolveInRoot(scopeRoot(scope, userId), relPath);
  await ensureDir(parent);
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
  const source = resolveInRoot(scopeRoot(scope, userId), relPath);
  const dest = path.join(path.dirname(source), newName);
  try {
    await fs.rename(source, dest);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new FilesError("Elemento non trovato", "not_found");
    if (code === "ENOTEMPTY" || code === "EEXIST") {
      throw new FilesError("Esiste già un elemento con questo nome", "conflict");
    }
    throw err;
  }
}

/** Spostare tra scope shared/private è anche il modo per cambiare la privacy di un contenuto (§11/§20). */
export async function moveEntry(
  scope: Scope,
  userId: string,
  relPath: string,
  destScope: Scope,
  destRelPath: string,
): Promise<void> {
  const source = resolveInRoot(scopeRoot(scope, userId), relPath);
  const destDir = resolveInRoot(scopeRoot(destScope, userId), destRelPath);
  await ensureDir(destDir);
  const dest = path.join(destDir, path.basename(source));
  try {
    await fs.rename(source, dest);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new FilesError("Elemento non trovato", "not_found");
    if (code === "EEXIST" || code === "ENOTEMPTY") {
      throw new FilesError("Esiste già un elemento con questo nome nella destinazione", "conflict");
    }
    throw err;
  }
}

export function resolveExistingPath(scope: Scope, userId: string, relPath: string): string {
  return resolveInRoot(scopeRoot(scope, userId), relPath);
}

export async function saveUpload(
  scope: Scope,
  userId: string,
  relPath: string,
  fileName: string,
  stream: NodeJS.ReadableStream,
): Promise<void> {
  if (!fileName || /[/\\]/.test(fileName)) throw new FilesError("Nome file non valido");
  const dir = resolveInRoot(scopeRoot(scope, userId), relPath);
  await ensureDir(dir);
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
  trashed_at: string;
}

export async function moveToTrash(scope: Scope, userId: string, relPath: string): Promise<void> {
  const source = resolveInRoot(scopeRoot(scope, userId), relPath);
  const stat = await fs.stat(source).catch(() => null);
  if (!stat) throw new FilesError("Elemento non trovato", "not_found");

  const id = randomUUID();
  const dir = trashRoot(userId);
  await ensureDir(dir);
  const trashName = `${id}__${path.basename(source)}`;
  await fs.rename(source, path.join(dir, trashName));

  getDb()
    .prepare(
      `INSERT INTO trash_items (id, user_id, scope, original_path, name, is_directory, trash_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, userId, scope, relPath, path.basename(source), stat.isDirectory() ? 1 : 0, trashName);
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
    await fs.rm(path.join(trashRoot(userId), item.trash_path), { recursive: true, force: true });
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
  const destDir = path.dirname(resolveInRoot(scopeRoot(row.scope, userId), row.original_path));
  await ensureDir(destDir);

  let dest = path.join(destDir, row.name);
  if (fsSync.existsSync(dest)) {
    const parsed = path.parse(row.name);
    dest = path.join(destDir, `${parsed.name} (ripristinato)${parsed.ext}`);
  }

  await fs.rename(path.join(trashRoot(userId), row.trash_path), dest);
  getDb().prepare(`DELETE FROM trash_items WHERE id = ?`).run(trashId);
}

export async function deletePermanentlyFromTrash(userId: string, trashId: string): Promise<void> {
  const row = getTrashRow(userId, trashId);
  await fs.rm(path.join(trashRoot(userId), row.trash_path), { recursive: true, force: true });
  getDb().prepare(`DELETE FROM trash_items WHERE id = ?`).run(trashId);
}

/** Eliminazione definitiva immediata, senza passare dal cestino — richiede conferma aggiuntiva lato client (§11). */
export async function deletePermanentDirect(
  scope: Scope,
  userId: string,
  relPath: string,
): Promise<void> {
  const target = resolveInRoot(scopeRoot(scope, userId), relPath);
  await fs.rm(target, { recursive: true, force: true });
}

// --- Duplicati (§11: rilevamento automatico, nessuna eliminazione automatica) ----

async function hashFile(absPath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of fsSync.createReadStream(absPath)) hash.update(chunk);
  return hash.digest("hex");
}

interface WalkedFile {
  relPath: string;
  abs: string;
  size: number;
  modifiedAt: string;
}

async function walkFiles(dir: string, root: string, out: WalkedFile[]): Promise<void> {
  let entries: fsSync.Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(abs, root, out);
    } else {
      const stat = await fs.stat(abs);
      out.push({
        relPath: path.relative(root, abs),
        abs,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }
  }
}

export interface DuplicateGroup {
  hash: string;
  size: number;
  files: { path: string; modifiedAt: string }[];
}

export async function findDuplicates(scope: Scope, userId: string): Promise<DuplicateGroup[]> {
  const root = scopeRoot(scope, userId);
  const files: WalkedFile[] = [];
  await walkFiles(root, root, files);

  // Raggruppa prima per dimensione: file di dimensione diversa non sono mai duplicati,
  // evita di calcolare l'hash su tutta la libreria.
  const bySize = new Map<number, WalkedFile[]>();
  for (const f of files) {
    if (!bySize.has(f.size)) bySize.set(f.size, []);
    bySize.get(f.size)!.push(f);
  }

  const groups: DuplicateGroup[] = [];
  for (const candidates of bySize.values()) {
    if (candidates.length < 2) continue;
    const byHash = new Map<string, WalkedFile[]>();
    for (const f of candidates) {
      const hash = await hashFile(f.abs);
      if (!byHash.has(hash)) byHash.set(hash, []);
      byHash.get(hash)!.push(f);
    }
    for (const [hash, group] of byHash) {
      if (group.length < 2) continue;
      groups.push({
        hash,
        size: group[0].size,
        files: group.map((g) => ({ path: g.relPath, modifiedAt: g.modifiedAt })),
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
  const root = scopeRoot(scope, userId);
  const needle = query.toLowerCase();
  const results: SearchResult[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: fsSync.Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      if (entry.name.toLowerCase().includes(needle)) {
        const stat = await fs.stat(abs);
        results.push({
          path: path.relative(root, abs),
          name: entry.name,
          isDirectory: entry.isDirectory(),
          size: entry.isDirectory() ? null : stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      }
      if (entry.isDirectory()) await walk(abs);
    }
  }

  await walk(root);
  return results;
}
