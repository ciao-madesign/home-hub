import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../../config.js";

const execFileAsync = promisify(execFile);

/**
 * Timeout esplicito (§31, mai bloccare all'infinito): scoperto sul Wyse
 * reale che `smartctl` può restare bloccato a tempo indeterminato (non
 * fallire e basta) durante l'auto-rilevamento del tipo di device su un
 * SSD dietro un bridge USB-SATA — senza timeout la richiesta non
 * risponderebbe mai invece di degradare a "non disponibile".
 */
const SMARTCTL_TIMEOUT_MS = 5000;

export type SmartHealth = "passed" | "failed" | "unknown";

export interface SmartStatus {
  available: boolean;
  health: SmartHealth;
  device: string | null;
}

async function resolveDevice(mountPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(config.findmntPath, ["-no", "SOURCE", "--target", mountPath], {
      timeout: SMARTCTL_TIMEOUT_MS,
    });
    const device = stdout.trim();
    return device.length > 0 ? device : null;
  } catch {
    return null; // findmnt assente o percorso non montato su un device riconoscibile
  }
}

/**
 * Un SSD dietro un bridge USB-SATA (caso comune per il disco dati
 * esterno di questo progetto, vedi docs/SPECIFICHE.md §5) spesso non
 * risponde all'auto-rilevamento di smartctl ma funziona perfettamente
 * con `-d sat` forzato — verificato sul Wyse reale. Si tenta prima
 * l'auto-rilevamento (funziona per dischi collegati direttamente), poi
 * si ripiega su `-d sat` solo se il primo fallisce.
 */
async function runSmartctl(device: string, extraArgs: string[] = []): Promise<string> {
  const { stdout } = await execFileAsync(config.smartctlPath, ["-H", "-j", ...extraArgs, device], {
    timeout: SMARTCTL_TIMEOUT_MS,
  });
  return stdout;
}

/**
 * SMART (§29): richiede smartctl installato e permessi di lettura sul device
 * — spesso non disponibili in ambienti di sviluppo/container. Degrado
 * esplicito a "non disponibile" invece di un errore, coerente con §31.
 */
export async function probeSmart(mountPath: string): Promise<SmartStatus> {
  const device = await resolveDevice(mountPath);
  if (!device) return { available: false, health: "unknown", device: null };

  let stdout: string;
  try {
    stdout = await runSmartctl(device);
  } catch {
    try {
      stdout = await runSmartctl(device, ["-d", "sat"]);
    } catch {
      return { available: false, health: "unknown", device };
    }
  }

  try {
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
