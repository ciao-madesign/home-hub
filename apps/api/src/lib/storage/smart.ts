import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../../config.js";

const execFileAsync = promisify(execFile);

export type SmartHealth = "passed" | "failed" | "unknown";

export interface SmartStatus {
  available: boolean;
  health: SmartHealth;
  device: string | null;
}

async function resolveDevice(mountPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(config.findmntPath, ["-no", "SOURCE", "--target", mountPath]);
    const device = stdout.trim();
    return device.length > 0 ? device : null;
  } catch {
    return null; // findmnt assente o percorso non montato su un device riconoscibile
  }
}

/**
 * SMART (§29): richiede smartctl installato e permessi di lettura sul device
 * — spesso non disponibili in ambienti di sviluppo/container. Degrado
 * esplicito a "non disponibile" invece di un errore, coerente con §31.
 */
export async function probeSmart(mountPath: string): Promise<SmartStatus> {
  const device = await resolveDevice(mountPath);
  if (!device) return { available: false, health: "unknown", device: null };

  try {
    const { stdout } = await execFileAsync(config.smartctlPath, ["-H", "-j", device]);
    const report = JSON.parse(stdout) as { smart_status?: { passed?: boolean } };
    const passed = report.smart_status?.passed;
    return {
      available: true,
      health: passed === true ? "passed" : passed === false ? "failed" : "unknown",
      device,
    };
  } catch {
    return { available: false, health: "unknown", device };
  }
}
