import os from "node:os";
import fs from "node:fs/promises";
import { config } from "../config.js";

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
  services: ServiceStatus[];
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

async function checkService(name: string, url: string | null): Promise<ServiceStatus> {
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

/**
 * Aggrega lo stato del sistema secondo §30: indicatore NORMAL/ATTENTION/PROBLEM
 * basato su CPU, RAM, temperatura, storage e servizi interni.
 */
export async function getSystemStatus(): Promise<SystemStatusReport> {
  const [temperatureCelsius, disk, jellyfin, immich] = await Promise.all([
    readCpuTemperature(),
    readDiskUsage(),
    checkService("jellyfin", config.jellyfinUrl),
    checkService("immich", config.immichUrl),
  ]);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedPercent = ((totalMem - freeMem) / totalMem) * 100;
  const [loadAvg1m] = os.loadavg();

  const services = [jellyfin, immich];

  let level: SystemLevel = "NORMAL";

  const diskCritical =
    disk.freePercent !== null && disk.freePercent < config.diskCriticalFreePercent;
  const serviceDown = services.some((s) => s.configured && s.reachable === false);
  const hot = temperatureCelsius !== null && temperatureCelsius >= 80;
  const veryHot = temperatureCelsius !== null && temperatureCelsius >= 90;

  if (diskCritical || serviceDown || hot) level = "ATTENTION";
  if (veryHot) level = "PROBLEM";

  return {
    level,
    cpu: { loadAvg1m, cores: os.cpus().length },
    memory: { totalBytes: totalMem, freeBytes: freeMem, usedPercent },
    disk,
    temperatureCelsius,
    uptimeSeconds: os.uptime(),
    services,
  };
}
