import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";
import { logSystemEvent } from "./systemEvents.js";

const execFileAsync = promisify(execFile);

export class PowerError extends Error {}

/**
 * Spegnimento sicuro (§34: "Pulsante: shutdown Linux sicuro", "Spegnimento:
 * manuale, Web App o pulsante fisico"). L'Hub API gira come utente non
 * root (§26): serve un permesso sudo mirato solo a questo comando, non un
 * sudo generico — vedi README "Deploy".
 */
export async function shutdownHost(): Promise<void> {
  const args = JSON.parse(config.shutdownArgsJson) as string[];
  logSystemEvent("info", "power", "Spegnimento richiesto dalla Web App.");
  try {
    await execFileAsync(config.shutdownCommand, args);
  } catch (err) {
    throw new PowerError(`Spegnimento non riuscito: ${(err as Error).message}`);
  }
}
