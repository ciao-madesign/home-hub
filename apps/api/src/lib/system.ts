import os from "node:os";
import fs from "node:fs/promises";
import { config } from "../config.js";
import { getLatestRun as getLatestBackupRun } from "./storage/backup.js";
import { listDownloads } from "./downloads/manager.js";

export type SystemLevel = "NORMAL" | "ATTENTION" | "PROBLEM";

export interface ServiceStatus {
  name: string;
  configured: boolean;
  reachable: boolean | null; // null = non verificato (non configurato)
}

export interface SystemStatusReport {
  level: SystemLevel;
  cpu: { loadAvg1m: number; cores: number };
  memory: { totalBytes: number; freeBytes: number; usedPercent: number };
  disk: { totalBytes: number | null; freeBytes: number | null; freePercent: number | null };
  temperatureCelsius: number | null;
  uptimeSeconds: number;
  internet: { reachable: boolean };
  services: ServiceStatus[];
  backup: { configured: boolean; lastStatus: string | null };
  downloads: { active: number; errored: number };
}

async function readCpuTemperature(): Promise<number | null> {
  try {
    const raw = await fs.readFile("/sys/class/thermal/thermal_zone0/temp", "utf8");
    const milliC = Number(raw.trim());
    if (Number.isNaN(milliC)) return null;
    return milliC / 1000;
  } catch {
    return null; // non disponibile (es. ambiente di sviluppo non-Linux/non-Wyse)
  }
}

async function readDiskUsage(): Promise<{
  totalBytes: number | null;
  freeBytes: number | null;
  freePercent: number | null;
}> {
  try {
    // fs.statfs è disponibile su Linux/macOS; su altre piattaforme può non esistere.
    const stat = await fs.statfs(config.dataRoot);
    const totalBytes = stat.blocks * stat.bsize;
    const freeBytes = stat.bavail * stat.bsize;
    const freePercent = totalBytes > 0 ? (freeBytes / totalBytes) * 100 : null;
    return { totalBytes, freeBytes, freePercent };
  } catch {
    return { totalBytes: null, freeBytes: null, freePercent: null };
  }
}

export async function checkService(name: string, url: string | null): Promise<ServiceStatus> {
  if (!url) return { name, configured: false, reachable: null };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return { name, configured: true, reachable: res.ok };
  } catch {
    return { name, configured: true, reachable: false };
  }
}

/** Stato Internet (§30): raggiungibilità generica, non di un servizio specifico. */
async function checkInternet(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.internetCheckTimeoutMs);
    const res = await fetch(config.internetCheckUrl, { signal: controller.signal, method: "HEAD" });
    clearTimeout(timeout);
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

/**
 * Aggrega lo stato del sistema secondo §30: indicatore NORMAL/ATTENTION/PROBLEM
 * basato su CPU, RAM, temperatura, storage, servizi interni, Internet e backup.
 */
export async function getSystemStatus(): Promise<SystemStatusReport> {
  const [temperatureCelsius, disk, jellyfin, immich, internetReachable] = await Promise.all([
    readCpuTemperature(),
    readDiskUsage(),
    checkService("jellyfin", config.jellyfinUrl),
    checkService("immich", config.immichUrl),
    checkInternet(),
  ]);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedPercent = ((totalMem - freeMem) / totalMem) * 100;
  const [loadAvg1m] = os.loadavg();

  const services = [jellyfin, immich];

  const latestBackup = getLatestBackupRun();
  const backup = {
    configured: config.backupRoot !== null,
    lastStatus: latestBackup?.status ?? null,
  };

  const allDownloads = listDownloads();
  const downloads = {
    active: allDownloads.filter((d) => d.status === "downloading" || d.status === "queued").length,
    errored: allDownloads.filter((d) => d.status === "error").length,
  };

  let level: SystemLevel = "NORMAL";

  const diskCritical =
    disk.freePercent !== null && disk.freePercent < config.diskCriticalFreePercent;
  const serviceDown = services.some((s) => s.configured && s.reachable === false);
  const hot = temperatureCelsius !== null && temperatureCelsius >= 80;
  const veryHot = temperatureCelsius !== null && temperatureCelsius >= 90;
  // Un backup non configurato è una scelta legittima (§5: "previsto come
  // espansione"), non un problema — solo un backup configurato che fallisce
  // davvero segnala qualcosa che merita attenzione. L'assenza di Internet è
  // trattata allo stesso modo (§27: l'Hub è pienamente utilizzabile offline,
  // non è "un problema" del sistema) — resta visibile come campo a sé,
  // senza alzare l'indicatore generale.
  const backupFailed = backup.configured && (backup.lastStatus === "failed" || backup.lastStatus === "interrupted");

  if (diskCritical || serviceDown || hot || backupFailed) level = "ATTENTION";
  if (veryHot) level = "PROBLEM";

  return {
    level,
    cpu: { loadAvg1m, cores: os.cpus().length },
    memory: { totalBytes: totalMem, freeBytes: freeMem, usedPercent },
    disk,
    temperatureCelsius,
    uptimeSeconds: os.uptime(),
    internet: { reachable: internetReachable },
    services,
    backup,
    downloads,
  };
}
