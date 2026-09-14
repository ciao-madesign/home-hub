import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { PassThrough, Transform } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { config } from "../../config.js";
import { getDb } from "../../db/index.js";
import { parseSqliteTimestamp } from "../sqliteDate.js";
import {
  createBackupRun,
  getBackupRun,
  getLatestRun,
  listBackupRuns,
  markStaleRunsInterrupted,
  updateBackupRun,
  type BackupRunRow,
  type BackupTrigger,
} from "./backupStore.js";

export class BackupError extends Error {
  constructor(
    message: string,
    public code: "not_configured" | "already_running" = "not_configured",
  ) {
    super(message);
  }
}

let runningPromise: Promise<BackupRunRow> | null = null;

// --- Manifest: dati personali (§5) -----------------------------------------
// Movies/Series/Music (Jellyfin) sono esclusi deliberatamente: librerie
// multimediali sostituibili, non "dati personali" nel senso della spec —
// vedi decisione in docs/SPECIFICHE.md.

interface ManifestEntry {
  destRelPath: string;
  srcAbsPath: string;
}

async function walk(dir: string, destPrefix: string, entries: ManifestEntry[]): Promise<void> {
  let items: fsSync.Dirent[];
  try {
    items = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // categoria assente sul disco dati: niente da includere, non un errore
  }
  for (const item of items) {
    const abs = path.join(dir, item.name);
    const rel = `${destPrefix}/${item.name}`;
    if (item.isDirectory()) await walk(abs, rel, entries);
    else if (item.isFile()) entries.push({ destRelPath: rel, srcAbsPath: abs });
  }
}

async function buildManifest(): Promise<ManifestEntry[]> {
  const entries: ManifestEntry[] = [];
  await walk(path.join(config.dataRoot, "Files"), "files", entries);
  await walk(path.join(config.dataRoot, "Photos"), "photos", entries);
  await walk(path.join(config.dataRoot, "Games", ".saves"), "games-saves", entries);
  return entries;
}

// --- Copia con limite di banda e verifica di integrità ----------------------

function throttle(maxBytesPerSec: number): Transform | PassThrough {
  if (maxBytesPerSec <= 0) return new PassThrough();
  let windowStart = Date.now();
  let windowBytes = 0;
  return new Transform({
    async transform(chunk: Buffer, _enc, cb) {
      const elapsed = Date.now() - windowStart;
      if (elapsed >= 1000) {
        windowStart = Date.now();
        windowBytes = 0;
      }
      windowBytes += chunk.length;
      if (windowBytes > maxBytesPerSec) {
        await new Promise((r) => setTimeout(r, Math.max(0, 1000 - elapsed)));
        windowStart = Date.now();
        windowBytes = chunk.length;
      }
      cb(null, chunk);
    },
  });
}

async function hashFile(p: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of fsSync.createReadStream(p)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

type CopyOutcome = "copied" | "skipped_unchanged" | "skipped_race" | "failed";

/** Conteggio ricorrente di esiti di copia (backup e ripristino): evita di ripetere lo stesso if/else in ogni loop. */
interface CopyTally {
  copied: number;
  skipped: number;
  failed: number;
  bytes: number;
}

function newTally(): CopyTally {
  return { copied: 0, skipped: 0, failed: 0, bytes: 0 };
}

function tally(t: CopyTally, result: { outcome: CopyOutcome; bytes: number }): void {
  if (result.outcome === "copied") {
    t.copied += 1;
    t.bytes += result.bytes;
  } else if (result.outcome === "failed") {
    t.failed += 1;
  } else {
    t.skipped += 1;
  }
}

/**
 * Copia src -> dest con limite di banda (§32), verifica di integrità
 * post-scrittura (§5: "verificata durante la creazione") e scrittura
 * atomica via file temporaneo + rename (mai un dest parzialmente scritto in
 * caso di crash a metà copia — base della ripresa incrementale). Usata sia
 * per il backup (src=dati, dest=backupRoot) sia per il ripristino
 * (src=backupRoot, dest=dati).
 *
 * Se il file sorgente cambia mentre viene copiato, la copia viene scartata
 * (dest resta quello del run precedente, o assente): il file rientrerà nel
 * prossimo run, mai in quello già in corso (§5).
 */
async function copyVerified(src: string, dest: string, maxBytesPerSec: number): Promise<{
  outcome: CopyOutcome;
  bytes: number;
}> {
  let srcStatBefore: fsSync.Stats;
  try {
    srcStatBefore = await fs.stat(src);
  } catch {
    return { outcome: "failed", bytes: 0 }; // sparito prima di poterlo leggere
  }

  try {
    const destStat = await fs.stat(dest);
    const sameMtime = Math.abs(destStat.mtimeMs - srcStatBefore.mtimeMs) < 1000;
    if (destStat.size === srcStatBefore.size && sameMtime) {
      return { outcome: "skipped_unchanged", bytes: 0 };
    }
  } catch {
    // dest assente: va copiato
  }

  const tmpDest = `${dest}.part`;
  try {
    await fs.mkdir(path.dirname(tmpDest), { recursive: true });
    const srcHash = createHash("sha256");
    const tap = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        srcHash.update(chunk);
        cb(null, chunk);
      },
    });
    await pipeline(fsSync.createReadStream(src), tap, throttle(maxBytesPerSec), fsSync.createWriteStream(tmpDest));

    const srcStatAfter = await fs.stat(src);
    if (srcStatAfter.mtimeMs !== srcStatBefore.mtimeMs || srcStatAfter.size !== srcStatBefore.size) {
      await fs.rm(tmpDest, { force: true });
      return { outcome: "skipped_race", bytes: 0 };
    }

    const destHash = await hashFile(tmpDest);
    if (destHash !== srcHash.digest("hex")) {
      await fs.rm(tmpDest, { force: true });
      return { outcome: "failed", bytes: 0 };
    }

    await fs.rename(tmpDest, dest);
    await fs.utimes(dest, srcStatBefore.atime, srcStatBefore.mtime);
    const stat = await fs.stat(dest);
    return { outcome: "copied", bytes: stat.size };
  } catch {
    await fs.rm(tmpDest, { force: true }).catch(() => {});
    return { outcome: "failed", bytes: 0 };
  }
}

// --- Database e configurazione Hub/Docker (§5) -------------------------------

async function backupDatabase(backupRoot: string): Promise<{ outcome: CopyOutcome; bytes: number }> {
  const dest = path.join(backupRoot, "hub", "hub.sqlite");
  const tmpDest = `${dest}.part`;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.rm(tmpDest, { force: true }).catch(() => {});

  // VACUUM INTO produce uno snapshot consistente del DB live, senza doverlo
  // fermare — verificato empiricamente su node:sqlite (parametro bindato
  // supportato). Verifica ulteriore con PRAGMA quick_check sul file risultante.
  try {
    getDb().prepare("VACUUM INTO ?").run(tmpDest);
  } catch (err) {
    await fs.rm(tmpDest, { force: true }).catch(() => {});
    throw new Error(`Backup del database fallito (VACUUM INTO): ${(err as Error).message}`);
  }

  const check = new DatabaseSync(tmpDest, { readOnly: true });
  let quickCheck: string;
  try {
    quickCheck = (check.prepare("PRAGMA quick_check").get() as { quick_check: string }).quick_check;
  } finally {
    check.close();
  }
  if (quickCheck !== "ok") {
    await fs.rm(tmpDest, { force: true }).catch(() => {});
    throw new Error(`Verifica integrità del database di backup fallita: ${quickCheck}`);
  }

  await fs.rename(tmpDest, dest);
  const stat = await fs.stat(dest);
  return { outcome: "copied", bytes: stat.size };
}

async function backupConfigFile(
  srcPath: string,
  destRelPath: string,
  backupRoot: string,
): Promise<{ outcome: CopyOutcome; bytes: number }> {
  const srcExists = await fs
    .access(srcPath)
    .then(() => true)
    .catch(() => false);
  if (!srcExists) return { outcome: "skipped_unchanged", bytes: 0 }; // es. apps/api/.env assente in sviluppo

  return copyVerified(srcPath, path.join(backupRoot, "hub-config", destRelPath), 0);
}

// --- Orchestrazione del run --------------------------------------------------

async function executeBackup(trigger: BackupTrigger): Promise<BackupRunRow> {
  if (!config.backupRoot) {
    throw new BackupError("Nessun disco di backup configurato (HUB_BACKUP_ROOT)", "not_configured");
  }

  const backupRoot = config.backupRoot;
  await fs.mkdir(backupRoot, { recursive: true });

  const run = createBackupRun(trigger);
  const t = newTally();

  const configFiles: [string, string][] = [
    [config.hubConfigPaths.apiEnv, "api.env"],
    [config.hubConfigPaths.infraEnv, "infra.env"],
    [config.hubConfigPaths.dockerCompose, "docker-compose.yml"],
    [config.hubConfigPaths.systemdUnit, "home-hub-api.service"],
  ];

  try {
    const manifest = await buildManifest();
    const filesTotal = manifest.length + 1 /* db */ + configFiles.length;
    updateBackupRun(run.id, { files_total: filesTotal });

    for (const entry of manifest) {
      const dest = path.join(backupRoot, entry.destRelPath);
      tally(t, await copyVerified(entry.srcAbsPath, dest, config.backupMaxRateKbps * 1024));
    }

    try {
      tally(t, await backupDatabase(backupRoot));
    } catch {
      t.failed += 1;
    }

    for (const [srcPath, destRelPath] of configFiles) {
      tally(t, await backupConfigFile(srcPath, destRelPath, backupRoot));
    }

    const status = t.failed > 0 ? "completed_with_errors" : "completed";
    updateBackupRun(run.id, {
      status,
      finished_at: new Date().toISOString().replace("T", " ").slice(0, 19),
      files_copied: t.copied,
      files_skipped: t.skipped,
      files_failed: t.failed,
      bytes_copied: t.bytes,
    });
  } catch (err) {
    updateBackupRun(run.id, {
      status: "failed",
      finished_at: new Date().toISOString().replace("T", " ").slice(0, 19),
      files_copied: t.copied,
      files_skipped: t.skipped,
      files_failed: t.failed,
      bytes_copied: t.bytes,
      error_message: (err as Error).message,
    });
  }

  return getBackupRun(run.id)!;
}

/**
 * "Backup Now" (§5): parte immediatamente, un solo run alla volta (un
 * secondo trigger mentre uno è in corso restituisce lo stesso run invece di
 * accodarne un altro).
 */
export function runBackup(trigger: BackupTrigger): Promise<BackupRunRow> {
  if (runningPromise) return runningPromise;
  runningPromise = executeBackup(trigger).finally(() => {
    runningPromise = null;
  });
  return runningPromise;
}

export function isBackupRunning(): boolean {
  return runningPromise !== null;
}

export { listBackupRuns, getLatestRun };

// --- Ripristino (§35: "Recovery nuovo hardware") -----------------------------
//
// Copre il passo "3. ripristino automatico" dopo il collegamento del disco
// di backup su hardware nuovo/sostituito. L'installazione base, il wizard
// guidato e la ricreazione della configurazione Hub/Docker (le
// hub-config/*.env/.yml copiate nel backup servono da riferimento, non
// vengono riscritte automaticamente su file live di sistema) restano fuori
// da questa funzione — vedi docs/SPECIFICHE.md, limitazioni note.

export interface RestoreSummary {
  filesTotal: number;
  filesRestored: number;
  filesSkipped: number;
  filesFailed: number;
  databaseRestored: boolean;
}

async function restoreCategory(backupRoot: string, category: string, destDir: string, summary: RestoreSummary) {
  const entries: ManifestEntry[] = [];
  await walk(path.join(backupRoot, category), category, entries);
  summary.filesTotal += entries.length;

  const t = newTally();
  for (const entry of entries) {
    const relInsideCategory = entry.destRelPath.slice(category.length + 1);
    const dest = path.join(destDir, relInsideCategory);
    tally(t, await copyVerified(entry.srcAbsPath, dest, 0));
  }
  summary.filesRestored += t.copied;
  summary.filesSkipped += t.skipped;
  summary.filesFailed += t.failed;
}

/**
 * Ripristina dati personali + database dal disco di backup verso il disco
 * dati corrente. Operazione distruttiva sui file di destinazione già
 * presenti con lo stesso percorso: va invocata solo con conferma esplicita
 * dell'utente (vedi routes/storage.ts).
 */
export async function restoreFromBackup(): Promise<RestoreSummary> {
  if (!config.backupRoot) {
    throw new BackupError("Nessun disco di backup configurato (HUB_BACKUP_ROOT)", "not_configured");
  }
  if (isBackupRunning()) {
    throw new BackupError("Impossibile ripristinare mentre un backup è in corso", "already_running");
  }

  const backupRoot = config.backupRoot;
  const summary: RestoreSummary = { filesTotal: 0, filesRestored: 0, filesSkipped: 0, filesFailed: 0, databaseRestored: false };

  await restoreCategory(backupRoot, "files", path.join(config.dataRoot, "Files"), summary);
  await restoreCategory(backupRoot, "photos", path.join(config.dataRoot, "Photos"), summary);
  await restoreCategory(backupRoot, "games-saves", path.join(config.dataRoot, "Games", ".saves"), summary);

  const dbBackupPath = path.join(backupRoot, "hub", "hub.sqlite");
  const dbBackupExists = await fs
    .access(dbBackupPath)
    .then(() => true)
    .catch(() => false);
  if (dbBackupExists) {
    summary.filesTotal += 1;
    const result = await copyVerified(dbBackupPath, config.dbPath, 0);
    summary.databaseRestored = result.outcome === "copied" || result.outcome === "skipped_unchanged";
    if (!summary.databaseRestored) summary.filesFailed += 1;
    else summary.filesRestored += 1;
  }

  return summary;
}

/**
 * Guardia riutilizzabile per operazioni rischiose (§5: "prima di
 * aggiornamenti importanti, ripristini o modifiche allo storage viene
 * verificata l'esistenza di un backup recente e valido"). Non ancora
 * collegata a operazioni specifiche in V1 (nessuna esiste ancora che lo
 * richieda) — disponibile per usi futuri.
 */
export function hasRecentValidBackup(): boolean {
  const latest = getLatestRun();
  if (!latest) return false;
  if (latest.status !== "completed" && latest.status !== "completed_with_errors") return false;
  if (!latest.finished_at) return false;
  const ageMs = Date.now() - parseSqliteTimestamp(latest.finished_at).getTime();
  return ageMs <= config.backupRecentMaxAgeHours * 60 * 60 * 1000;
}

/**
 * Scheduler "lazy": nessun cron reale (coerente con la scelta già fatta per
 * il cestino/Download Manager), un setInterval controlla periodicamente se
 * è passato abbastanza tempo dall'ultimo backup completato con successo.
 */
export function bootstrapBackupScheduler(): void {
  markStaleRunsInterrupted();

  const checkIntervalMs = 15 * 60 * 1000;
  setInterval(() => {
    if (!config.backupRoot || isBackupRunning()) return;
    const latest = getLatestRun();
    const dueMs = config.backupIntervalHours * 60 * 60 * 1000;
    const due =
      !latest ||
      latest.status === "interrupted" ||
      latest.status === "failed" ||
      (latest.finished_at !== null && Date.now() - parseSqliteTimestamp(latest.finished_at).getTime() >= dueMs);
    if (due) runBackup("auto").catch(() => {});
  }, checkIntervalMs).unref();
}
