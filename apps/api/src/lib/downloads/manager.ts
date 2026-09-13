import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import { startTorrentDownload } from "./torrent.js";
import { startYtDlpDownload } from "./ytdlp.js";
import * as store from "./store.js";
import type { DownloadKind, DownloadRow } from "./store.js";
import type { EngineCallbacks, EngineHandle } from "./types.js";

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

function downloadsRoot(): string {
  return path.join(config.dataRoot, "Downloads");
}

async function ensureDownloadsRoot(): Promise<string> {
  const dir = downloadsRoot();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function activeCount(): number {
  return store.listByStatus("downloading").length;
}

/** Avvia il prossimo elemento in coda finché non si raggiunge il numero massimo di download attivi (§12/§32). */
export function processQueue(): void {
  while (activeCount() < config.downloadMaxConcurrent) {
    const [next] = store.listByStatus("queued");
    if (!next) break;
    startJob(next);
  }
}

function startJob(row: DownloadRow): void {
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

  const dir = downloadsRoot();
  const handle =
    row.kind === "url"
      ? startYtDlpDownload(row.source, dir, callbacks)
      : startTorrentDownload(row.source, dir, callbacks);

  activeHandles.set(row.id, handle);
}

export async function enqueue(
  userId: string,
  kind: DownloadKind,
  source: string,
): Promise<DownloadRow> {
  await ensureDownloadsRoot();
  const row = store.createDownload(userId, kind, source);
  processQueue();
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

export function resumeDownload(id: string): void {
  const row = store.getDownload(id);
  if (!row) throw new DownloadsError("Download non trovato");
  if (row.status !== "paused") return;

  const handle = activeHandles.get(id);
  if (handle) {
    handle.resume();
    store.updateDownload(id, { status: "downloading" });
  } else {
    store.updateDownload(id, { status: "queued" });
    processQueue();
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

/** Da chiamare all'avvio dell'Hub API: nessun processo/torrent sopravvive a un riavvio. */
export function bootstrapDownloads(): void {
  store.resetStaleDownloadingRows();
  processQueue();
}
