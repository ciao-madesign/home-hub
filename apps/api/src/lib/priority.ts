import { config } from "../config.js";
import { isJellyfinConfigured, isStreamingActive } from "./jellyfin.js";

/**
 * Priorità di banda dinamica (§32): streaming > backup > download. Un poll
 * periodico (lazy, stesso pattern già in uso per watchdog/DDNS) tiene in
 * cache se c'è una riproduzione Jellyfin attiva, così Download Manager e
 * Backup possono decidere il proprio limite di banda senza fare una
 * chiamata di rete a Jellyfin ad ogni chunk copiato/scaricato. Mai un
 * errore fatale (§31): se Jellyfin non è configurato o non risponde, si
 * assume "nessuno streaming in corso" (i download/il backup restano al
 * limite pieno, comportamento identico a prima di questa funzionalità).
 */
let cachedStreamingActive = false;

async function refreshStreamingCache(): Promise<void> {
  if (!isJellyfinConfigured()) {
    cachedStreamingActive = false;
    return;
  }
  try {
    cachedStreamingActive = await isStreamingActive();
  } catch {
    cachedStreamingActive = false;
  }
}

export function bootstrapPriorityMonitor(): void {
  refreshStreamingCache().catch(() => {});
  setInterval(() => refreshStreamingCache().catch(() => {}), config.streamingCheckIntervalSeconds * 1000).unref();
}

export function isStreamingActiveCached(): boolean {
  return cachedStreamingActive;
}

/**
 * Priorità minima (§32): i download cedono banda sia allo streaming sia
 * a un backup in corso — `backupRunning` è passato dal chiamante invece
 * di importarlo da storage/backup.ts per evitare una dipendenza
 * circolare (backup.ts stesso dipende da questo modulo per il proprio
 * limite dinamico, vedi `effectiveBackupRateKbps`).
 */
export function effectiveDownloadRateKbps(backupRunning: boolean): number {
  if (config.downloadThrottledRateKbps <= 0) return config.downloadMaxRateKbps;
  return cachedStreamingActive || backupRunning ? config.downloadThrottledRateKbps : config.downloadMaxRateKbps;
}

/** Priorità media (§32): il backup cede banda solo allo streaming, mai ai download. */
export function effectiveBackupRateKbps(): number {
  if (config.backupThrottledRateKbps <= 0) return config.backupMaxRateKbps;
  return cachedStreamingActive ? config.backupThrottledRateKbps : config.backupMaxRateKbps;
}
