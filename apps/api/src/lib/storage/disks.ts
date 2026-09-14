import fs from "node:fs/promises";
import { config } from "../../config.js";
import { probeSmart, type SmartStatus } from "./smart.js";

export interface DiskInfo {
  id: string;
  label: string;
  path: string;
  connected: boolean;
  totalBytes: number | null;
  freeBytes: number | null;
  freePercent: number | null;
  critical: boolean;
  smart: SmartStatus | null;
}

interface ConfiguredDisk {
  id: string;
  label: string;
  path: string;
}

function configuredDisks(): ConfiguredDisk[] {
  const disks: ConfiguredDisk[] = [{ id: "data", label: "Disco dati", path: config.dataRoot }];
  if (config.backupRoot) disks.push({ id: "backup", label: "Disco di backup", path: config.backupRoot });

  if (config.extraDisksJson) {
    try {
      const extra = JSON.parse(config.extraDisksJson) as ConfiguredDisk[];
      disks.push(...extra);
    } catch {
      // HUB_EXTRA_DISKS_JSON non valido: ignorato, dati/backup restano comunque visibili
    }
  }

  return disks;
}

/**
 * Rilevamento dischi (§29): visibilità (capacità, spazio libero, stato
 * connesso/non disponibile, SMART) sui mount point configurati. Non
 * implementa la libreria virtuale multi-disco con distribuzione automatica
 * dei nuovi file (§4) — File Manager/Games/Downloads assumono ancora un
 * unico disco dati, vedi docs/SPECIFICHE.md.
 */
export async function listDisks(): Promise<DiskInfo[]> {
  return Promise.all(
    configuredDisks().map(async (d): Promise<DiskInfo> => {
      try {
        const stat = await fs.statfs(d.path);
        const totalBytes = stat.blocks * stat.bsize;
        const freeBytes = stat.bavail * stat.bsize;
        const freePercent = totalBytes > 0 ? (freeBytes / totalBytes) * 100 : null;
        const smart = await probeSmart(d.path);
        return {
          id: d.id,
          label: d.label,
          path: d.path,
          connected: true,
          totalBytes,
          freeBytes,
          freePercent,
          critical: freePercent !== null && freePercent < config.diskCriticalFreePercent,
          smart,
        };
      } catch {
        // Disco scollegato o non montato (§29): contenuti nascosti altrove
        // (File Manager/Games operano solo sul disco dati montato), qui
        // riportato semplicemente come "non disponibile".
        return {
          id: d.id,
          label: d.label,
          path: d.path,
          connected: false,
          totalBytes: null,
          freeBytes: null,
          freePercent: null,
          critical: false,
          smart: null,
        };
      }
    }),
  );
}
