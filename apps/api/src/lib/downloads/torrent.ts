import fs from "node:fs/promises";
import WebTorrent, { type Torrent } from "webtorrent";
import { config } from "../../config.js";
import type { EngineCallbacks, EngineHandle } from "./types.js";

let sharedClient: WebTorrent | null = null;

/** Un solo client WebTorrent condiviso per l'intero processo Hub API. */
function getClient(): WebTorrent {
  if (!sharedClient) {
    sharedClient = new WebTorrent();
    if (config.downloadMaxRateKbps > 0) {
      // Priorità minima rispetto a streaming/backup (§32): limite di banda globale.
      sharedClient.throttleDownload(config.downloadMaxRateKbps * 1024);
    }
  }
  return sharedClient;
}

/**
 * Priorità di banda dinamica (§32): a differenza di yt-dlp (limite fisso
 * al lancio del processo, non modificabile a caldo — vedi ytdlp.ts),
 * WebTorrent espone `throttleDownload()` come metodo richiamabile in
 * qualunque momento sul client condiviso — verificato che `-1` disattiva
 * davvero il limite (non solo lo azzera). Non forza la creazione del
 * client se non esiste ancora nessun torrent attivo.
 */
export function updateTorrentThrottle(rateKbps: number): void {
  if (!sharedClient) return;
  sharedClient.throttleDownload(rateKbps > 0 ? rateKbps * 1024 : -1);
}

/**
 * Motore torrent (§12) basato sulla libreria WebTorrent, embedded
 * nell'Hub API — nessun servizio esterno separato da orchestrare.
 * Accetta magnet URI o percorso di un file .torrent caricato in precedenza
 * (vedi routes/downloads.ts, che salva il file e passa il percorso qui).
 *
 * `Torrent.pause()` di WebTorrent impedisce solo l'aggiunta di NUOVI peer:
 * i peer già connessi continuano a scambiare dati (verificato — non è una
 * pausa reale). Pausa/ripresa vengono quindi implementate distruggendo il
 * torrent (`destroyStore: false`, i byte scaricati restano su disco) e
 * riaggiungendolo alla ripresa: lo store a chunk su file verifica i pezzi
 * già presenti e riparte da lì, senza riscaricare da capo.
 */
export function startTorrentDownload(
  source: string,
  destDir: string,
  callbacks: EngineCallbacks,
): EngineHandle {
  const client = getClient();
  let torrent: Torrent | null = null;
  let progressTimer: NodeJS.Timeout | null = null;
  let settled = false;

  function finish(error: Error | null): void {
    if (settled) return;
    settled = true;
    if (progressTimer) clearInterval(progressTimer);
    callbacks.onDone(error);
  }

  async function start(): Promise<void> {
    const torrentId = source.startsWith("magnet:") ? source : await fs.readFile(source);

    client.add(torrentId, { path: destDir }, (t: Torrent) => {
      torrent = t;
      callbacks.onTitle(t.name);

      progressTimer = setInterval(() => {
        callbacks.onProgress(t.progress * 100, t.downloaded, t.length, t.downloadSpeed);
      }, 1000);

      t.on("done", () => {
        callbacks.onProgress(100, t.length, t.length, 0);
        finish(null);
      });

      t.on("error", (err: Error | string) => {
        finish(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  start().catch((err) => finish(err instanceof Error ? err : new Error(String(err))));

  return {
    pause() {
      if (progressTimer) clearInterval(progressTimer);
      progressTimer = null;
      if (torrent) {
        torrent.destroy({ destroyStore: false });
        torrent = null;
      }
    },
    resume() {
      if (settled || torrent) return; // già completato/annullato, o già attivo
      start().catch((err) => finish(err instanceof Error ? err : new Error(String(err))));
    },
    cancel() {
      if (torrent) client.remove(torrent, { destroyStore: false }, () => {});
      // Se il torrent non è ancora stato aggiunto (finestra di avvio molto
      // breve) o è stato appena messo in pausa, non c'è nulla da rimuovere
      // dal client: il manager elimina comunque la riga grazie a finish(null).
      finish(null);
    },
  };
}
