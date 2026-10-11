import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import { startTorrentDownload, updateTorrentThrottle } from "./torrent.js";
import { startYtDlpDownload } from "./ytdlp.js";
import * as store from "./store.js";
import type { DestinationKind, DownloadKind, DownloadRow } from "./store.js";
import type { EngineCallbacks, EngineHandle } from "./types.js";
import { effectiveDownloadRateKbps } from "../priority.js";
import { isBackupRunning } from "../storage/backup.js";
import { absOnDisk, pickWriteDisk } from "../storage/library.js";
import { assertSafeRelativePath } from "../pathSafety.js";

export class DownloadsError extends Error {
  constructor(
    message: string,
    public code: "not_found" = "not_found",
  ) {
    super(message);
  }
}

const activeHandles = new Map<string, EngineHandle>();
/** Id per cui è stata richiesta la cancellazione: alla chiusura del motore la riga va eliminata, non marcata errore. */
const cancelledIds = new Set<string>();

function activeCount(): number {
  return store.listByStatus("downloading").length;
}

/** Avvia il prossimo elemento in coda finché non si raggiunge il numero massimo di download attivi (§12/§32). */
export async function processQueue(): Promise<void> {
  while (activeCount() < config.downloadMaxConcurrent) {
    const [next] = store.listByStatus("queued");
    if (!next) break;
    await startJob(next);
  }
}

/**
 * Smistamento automatico (§12): "movie"/"series" salvano direttamente
 * nella libreria Jellyfin (Media/Movies, Media/Series/<percorso>) invece
 * che in Downloads/ — niente spostamento manuale successivo (vedi
 * docs/GUIDA_USO.md). Media non partecipa alla libreria multi-disco
 * (percorso fisso, coerente col bind-mount singolo di Jellyfin in
 * infra/docker-compose.yml), a differenza di Downloads/ che sceglie il
 * disco con più spazio libero via pickWriteDisk().
 */
async function destinationDir(row: DownloadRow): Promise<string> {
  if (row.destination_kind === "movie") {
    return path.join(config.dataRoot, "Media", "Movies");
  }
  if (row.destination_kind === "series") {
    const segments = assertSafeRelativePath(row.destination_path ?? "");
    return path.join(config.dataRoot, "Media", "Series", ...segments);
  }
  const disk = await pickWriteDisk();
  return absOnDisk(disk, "Downloads", []);
}

/** Libreria virtuale multi-disco (§4): ogni download è contenuto nuovo, sceglie il disco con più spazio libero al momento in cui parte davvero (non alla messa in coda). */
async function startJob(row: DownloadRow): Promise<void> {
  store.updateDownload(row.id, { status: "downloading", error_message: null });

  const callbacks: EngineCallbacks = {
    onTitle(title) {
      store.updateDownload(row.id, { title });
    },
    onProgress(percent, downloadedBytes, totalBytes, speedBytesPerSec) {
      store.updateDownload(row.id, {
        progress_percent: percent,
        downloaded_bytes: downloadedBytes,
        total_bytes: totalBytes,
        speed_bytes_per_sec: speedBytesPerSec,
      });
    },
    onDone(error) {
      activeHandles.delete(row.id);
      if (cancelledIds.delete(row.id)) {
        store.deleteDownload(row.id);
      } else if (error) {
        store.updateDownload(row.id, { status: "error", error_message: error.message });
      } else {
        store.updateDownload(row.id, { status: "completed", progress_percent: 100 });
      }
      processQueue();
    },
  };

  const dir = await destinationDir(row);
  await fs.mkdir(dir, { recursive: true });
  const handle =
    row.kind === "url"
      ? startYtDlpDownload(row.source, dir, callbacks, effectiveDownloadRateKbps(isBackupRunning()))
      : startTorrentDownload(row.source, dir, callbacks);

  activeHandles.set(row.id, handle);
}

export async function enqueue(
  userId: string,
  kind: DownloadKind,
  source: string,
  destinationKind: DestinationKind = "downloads",
  destinationPath: string | null = null,
): Promise<DownloadRow> {
  const row = store.createDownload(userId, kind, source, destinationKind, destinationPath);
  await processQueue();
  return row;
}

export function pauseDownload(id: string): void {
  const row = store.getDownload(id);
  if (!row) throw new DownloadsError("Download non trovato");

  const handle = activeHandles.get(id);
  if (row.status === "downloading" && handle) {
    handle.pause();
    store.updateDownload(id, { status: "paused" });
  } else if (row.status === "queued") {
    store.updateDownload(id, { status: "paused" });
  }
}

export async function resumeDownload(id: string): Promise<void> {
  const row = store.getDownload(id);
  if (!row) throw new DownloadsError("Download non trovato");
  if (row.status !== "paused") return;

  const handle = activeHandles.get(id);
  if (handle) {
    handle.resume();
    store.updateDownload(id, { status: "downloading" });
  } else {
    store.updateDownload(id, { status: "queued" });
    await processQueue();
  }
}

export function cancelDownload(id: string): void {
  const row = store.getDownload(id);
  if (!row) throw new DownloadsError("Download non trovato");

  const handle = activeHandles.get(id);
  if (handle) {
    cancelledIds.add(id);
    handle.cancel();
  } else {
    store.deleteDownload(id);
  }
}

export function listDownloads(): DownloadRow[] {
  return store.listDownloads();
}

export function getDownloadsSummary(): { active: number; errored: number } {
  return store.countDownloadsSummary();
}

/** Da chiamare all'avvio dell'Hub API: nessun processo/torrent sopravvive a un riavvio. */
export async function bootstrapDownloads(): Promise<void> {
  store.resetStaleDownloadingRows();
  await processQueue();
  bootstrapDynamicTorrentThrottle();
}

/**
 * A differenza di yt-dlp (limite deciso una volta sola al lancio del
 * processo, vedi ytdlp.ts), WebTorrent può cambiare limite a caldo:
 * un torrent già in corso quando inizia uno streaming Jellyfin si
 * rallenta davvero, non solo i nuovi download avviati dopo (§32).
 */
function bootstrapDynamicTorrentThrottle(): void {
  const apply = () => updateTorrentThrottle(effectiveDownloadRateKbps(isBackupRunning()));
  apply();
  setInterval(apply, config.streamingCheckIntervalSeconds * 1000).unref();
}
