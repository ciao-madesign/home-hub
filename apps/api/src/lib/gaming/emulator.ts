import { spawn, type ChildProcess } from "node:child_process";
import { config } from "../../config.js";

export class EmulatorError extends Error {}

interface EmulatorConfig {
  command: string;
  args: string[]; // "{rom}" viene sostituito con il percorso assoluto della ROM
}

/**
 * Mappa piattaforma → emulatore. Punta a RetroArch con i core libretro più
 * comuni: sono valori di default plausibili, non verificati contro
 * un'installazione RetroArch reale (nessun emulatore disponibile in questo
 * ambiente di sviluppo — vedi docs/SPECIFICHE.md). Sovrascrivibile per
 * intero via HUB_EMULATOR_MAP_JSON per adattarla all'hardware reale.
 */
const DEFAULT_EMULATOR_MAP: Record<string, EmulatorConfig> = {
  nes: { command: "retroarch", args: ["-L", "/usr/lib/libretro/nestopia_libretro.so", "{rom}"] },
  snes: { command: "retroarch", args: ["-L", "/usr/lib/libretro/snes9x_libretro.so", "{rom}"] },
  genesis: {
    command: "retroarch",
    args: ["-L", "/usr/lib/libretro/genesis_plus_gx_libretro.so", "{rom}"],
  },
  gba: { command: "retroarch", args: ["-L", "/usr/lib/libretro/mgba_libretro.so", "{rom}"] },
};

function getEmulatorMap(): Record<string, EmulatorConfig> {
  if (!config.emulatorMapJson) return DEFAULT_EMULATOR_MAP;
  try {
    return { ...DEFAULT_EMULATOR_MAP, ...JSON.parse(config.emulatorMapJson) };
  } catch {
    return DEFAULT_EMULATOR_MAP;
  }
}

/** Usato dalla selezione automatica della macchina (§10, autoSelect.ts): una piattaforma senza emulatore locale configurato va per forza su una macchina remota. */
export function isPlatformLocallyEmulatable(platform: string): boolean {
  return platform in getEmulatorMap();
}

const runningProcesses = new Map<string, ChildProcess>();

export function isRunning(gameId: string): boolean {
  return runningProcesses.has(gameId);
}

export function listRunning(): string[] {
  return [...runningProcesses.keys()];
}

/** Avvia l'emulatore in locale sull'Hub (§10: "giochi retro → mini-PC/Hub quando compatibili"). */
export function launchLocal(gameId: string, platform: string, romAbsPath: string): void {
  if (runningProcesses.has(gameId)) {
    throw new EmulatorError("Il gioco è già in esecuzione");
  }
  const emulator = getEmulatorMap()[platform];
  if (!emulator) {
    throw new EmulatorError(`Nessun emulatore configurato per la piattaforma "${platform}"`);
  }

  const args = emulator.args.map((arg) => (arg === "{rom}" ? romAbsPath : arg));
  const proc = spawn(emulator.command, args, { stdio: "ignore" });

  runningProcesses.set(gameId, proc);
  const clear = () => runningProcesses.delete(gameId);
  proc.on("exit", clear);
  proc.on("error", clear);
}

export function stopLocal(gameId: string): void {
  const proc = runningProcesses.get(gameId);
  if (!proc) throw new EmulatorError("Il gioco non è in esecuzione");
  proc.kill("SIGTERM");
  runningProcesses.delete(gameId);
}
