import { assertSafeRelativePath } from "../pathSafety.js";
import { resolveAcrossDisks } from "../storage/library.js";
import { launchLocal, stopLocal } from "./emulator.js";
import { probeTcp } from "./machineStatus.js";
import { cancelApp, launchApp } from "./sunshine/client.js";
import { GamingError, type GameRow, type MachineRow } from "./store.js";
import { sendWakeOnLan } from "./wol.js";

/**
 * Decide COME avviare/fermare un gioco — locale, remoto con avvio reale
 * via Sunshine (§10, macchina accoppiata + app associata), o remoto col
 * solo risveglio/verifica di prima. Un solo posto per questa decisione
 * (in precedenza duplicata tra le route di avvio e arresto), stesso
 * principio già seguito dagli altri moduli di questa fase (`autoSelect.ts`
 * per la scelta della macchina, `wol.ts`, `machineStatus.ts`).
 */

export interface LaunchResult {
  mode: "local" | "remote";
  started?: boolean;
  machineOnline?: boolean;
  wolSent?: boolean;
  launched?: boolean;
  machineId: string;
  machineName: string;
}

export async function launchGame(machine: MachineRow, game: GameRow): Promise<LaunchResult> {
  if (machine.kind === "local") {
    if (!game.rom_path) {
      throw new GamingError("Nessuna ROM configurata per questo gioco", "conflict");
    }
    const found = await resolveAcrossDisks("Games", assertSafeRelativePath(game.rom_path));
    if (!found) throw new GamingError("ROM non trovata su nessun disco", "conflict");
    launchLocal(game.id, game.platform, found.abs);
    return { mode: "local", started: true, machineId: machine.id, machineName: machine.name };
  }

  if (!machine.host || !machine.port) {
    throw new GamingError("Macchina remota non configurata (host/porta mancanti)", "conflict");
  }

  const machineOnline = await probeTcp(machine.host, machine.port);
  if (machineOnline) {
    let launched = false;
    if (machine.sunshine_server_cert && game.sunshine_app_id) {
      await launchApp(machine, game.sunshine_app_id);
      launched = true;
    }
    return { mode: "remote", machineOnline, wolSent: false, launched, machineId: machine.id, machineName: machine.name };
  }

  if (!machine.mac_address) {
    throw new GamingError("MAC address mancante: impossibile inviare Wake-on-LAN", "conflict");
  }
  await sendWakeOnLan(machine.mac_address);
  return { mode: "remote", machineOnline: false, wolSent: true, launched: false, machineId: machine.id, machineName: machine.name };
}

/** Un gioco avviato per davvero su Sunshine si ferma fermando l'app sull'host — `stopLocal` riguarda solo l'emulatore locale. */
export async function stopGame(gameId: string, machine: MachineRow | null): Promise<void> {
  if (machine?.kind === "remote" && machine.sunshine_server_cert) {
    await cancelApp(machine);
  } else {
    stopLocal(gameId);
  }
}
