import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";
import { checkService } from "./system.js";
import { logSystemEvent } from "./systemEvents.js";

const execFileAsync = promisify(execFile);

interface WatchState {
  consecutiveFailures: number;
  restartAttempts: number;
  escalated: boolean;
}

const state = new Map<string, WatchState>();

function getState(name: string): WatchState {
  let s = state.get(name);
  if (!s) {
    s = { consecutiveFailures: 0, restartAttempts: 0, escalated: false };
    state.set(name, s);
  }
  return s;
}

async function restartContainer(container: string): Promise<boolean> {
  try {
    await execFileAsync(config.dockerPath, ["restart", container]);
    return true;
  } catch (err) {
    logSystemEvent(
      "critical",
      "watchdog",
      `Impossibile riavviare il container "${container}" automaticamente: ${(err as Error).message}`,
    );
    return false;
  }
}

/**
 * Riavvio automatico dei servizi interni (§31): dopo un numero limitato di
 * controlli falliti consecutivi, tenta `docker restart` sul container; dopo
 * un numero limitato di tentativi ancora falliti, segnala un evento
 * critico e smette di riprovare finché il servizio non torna raggiungibile
 * da solo (evita loop di riavvii infiniti su un guasto persistente).
 */
async function watchOne(name: string, url: string | null, container: string): Promise<void> {
  if (!url) return; // servizio non configurato: nulla da monitorare

  const status = await checkService(name, url);
  const s = getState(name);

  if (status.reachable) {
    if (s.consecutiveFailures > 0 || s.escalated) {
      logSystemEvent("info", "watchdog", `${name} è tornato raggiungibile.`);
    }
    s.consecutiveFailures = 0;
    s.restartAttempts = 0;
    s.escalated = false;
    return;
  }

  s.consecutiveFailures += 1;
  if (s.consecutiveFailures < config.watchdogFailuresBeforeRestart) return;
  if (s.escalated) return; // già segnalato: aspetta che qualcuno intervenga o che il servizio si riprenda da solo

  if (s.restartAttempts >= config.watchdogMaxRestartAttempts) {
    s.escalated = true;
    logSystemEvent(
      "critical",
      "watchdog",
      `${name} non risponde dopo ${s.restartAttempts} tentativi di riavvio automatico. Verifica manuale necessaria.`,
    );
    return;
  }

  s.restartAttempts += 1;
  s.consecutiveFailures = 0; // dà al servizio una nuova finestra di osservazione dopo il riavvio
  logSystemEvent("info", "watchdog", `${name} non raggiungibile: tentativo di riavvio ${s.restartAttempts}/${config.watchdogMaxRestartAttempts}.`);
  await restartContainer(container);
}

async function tick(): Promise<void> {
  await Promise.all([
    watchOne("jellyfin", config.jellyfinUrl, config.jellyfinContainer),
    watchOne("immich", config.immichUrl, config.immichContainer),
  ]);
}

export function bootstrapServiceWatchdog(): void {
  setInterval(() => tick().catch(() => {}), config.watchdogIntervalSeconds * 1000).unref();
}
