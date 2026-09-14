import { getMachine, listMachines, type MachineRow } from "./store.js";
import { isPlatformLocallyEmulatable } from "./emulator.js";
import { probeTcp } from "./machineStatus.js";

/**
 * Selezione automatica della macchina di esecuzione (§10, proposta aperta
 * chiusa in docs/SPECIFICHE.md). Si applica solo quando il gioco non ha
 * una macchina assegnata esplicitamente (`executionMachineId` nullo) —
 * un'assegnazione esplicita dell'utente vince sempre, vedi routes/gaming.ts.
 *
 * Euristica: piattaforma emulabile localmente (presente nella mappa
 * emulatori, es. retro console) → macchina locale, nessun bisogno di
 * altro. Piattaforma non emulabile in locale (es. PC/PS3, pensate per
 * girare su un PC remoto via Sunshine/Moonlight, §3) → la prima macchina
 * remota configurata che risulta online al probe TCP; se nessuna
 * risponde, la prima remota configurata comunque (il flusso di lancio
 * esistente la sveglierà via Wake-on-LAN, invariato); se non esiste
 * nessuna macchina remota, resta la locale — comportamento identico a
 * prima di questa funzionalità per chi ha solo una libreria retro.
 */
export async function resolveExecutionMachine(platform: string): Promise<MachineRow> {
  const local = getMachine("local")!;
  if (isPlatformLocallyEmulatable(platform)) return local;

  const remotes = listMachines().filter((m) => m.kind === "remote");
  if (remotes.length === 0) return local;

  for (const machine of remotes) {
    if (machine.host && machine.port && (await probeTcp(machine.host, machine.port))) {
      return machine;
    }
  }
  return remotes[0];
}
