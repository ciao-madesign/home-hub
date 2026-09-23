import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FastifyReply } from "fastify";
import { config } from "../../config.js";

const execFileAsync = promisify(execFile);

export class WifiError extends Error {}

/** Traduce un WifiError in 503 (§31: backend interno non raggiungibile, mai un errore fatale). Riusato da /api/network/wifi/* e /api/setup/wifi/*. */
export function handleWifiError(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof WifiError) {
    reply.code(503).send({ error: "wifi_unavailable", message: err.message });
    return true;
  }
  return false;
}

export interface WifiNetwork {
  ssid: string;
  signal: number;
  secured: boolean;
}

export interface WifiStatus {
  available: boolean;
  connectedSsid: string | null;
}

/**
 * Gestione Wi-Fi (§28) via NetworkManager (`nmcli`) — tipicamente assente
 * in ambienti di sviluppo/container: ogni funzione degrada esplicitamente
 * a "non disponibile" invece di un errore fatale (§31), non ancora
 * verificato contro hardware Wi-Fi reale in questo ambiente.
 *
 * Nessun comando WPS dedicato: il flusso previsto è premere il pulsante
 * WPS sul router e lasciare che la connessione avvenga lato sistema
 * operativo, poi usare `getWifiStatus` per rilevarla dalla Web App —
 * evita di dipendere da una sintassi nmcli per il WPS non standardizzata
 * e mai verificabile in questo ambiente.
 *
 * Niente pre-check separato con `nmcli --version`: si lancia direttamente
 * il comando reale e si distingue "nmcli assente" (ENOENT, degrado non
 * fatale) da un comando eseguito ma fallito (WifiError) sul suo errore,
 * invece di spendere un processo in più ad ogni chiamata per scoprirlo in
 * anticipo.
 */
function isCommandNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

export async function getWifiStatus(): Promise<WifiStatus> {
  try {
    const { stdout } = await execFileAsync(config.nmcliPath, ["-t", "-f", "ACTIVE,SSID", "device", "wifi", "list"]);
    const activeLine = stdout
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("yes:"));
    const connectedSsid = activeLine ? activeLine.slice("yes:".length) : null;
    return { available: true, connectedSsid: connectedSsid || null };
  } catch (err) {
    if (isCommandNotFound(err)) return { available: false, connectedSsid: null };
    throw new WifiError(`Lettura stato Wi-Fi fallita: ${(err as Error).message}`);
  }
}

export async function listWifiNetworks(): Promise<WifiNetwork[]> {
  try {
    const { stdout } = await execFileAsync(config.nmcliPath, [
      "-t",
      "-f",
      "SSID,SIGNAL,SECURITY",
      "device",
      "wifi",
      "list",
    ]);
    const seen = new Set<string>();
    const networks: WifiNetwork[] = [];
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const [ssid, signal, security] = line.split(":");
      if (!ssid || seen.has(ssid)) continue;
      seen.add(ssid);
      networks.push({ ssid, signal: Number(signal) || 0, secured: security !== "" && security !== "--" });
    }
    return networks.sort((a, b) => b.signal - a.signal);
  } catch (err) {
    if (isCommandNotFound(err)) return [];
    throw new WifiError(`Scansione Wi-Fi fallita: ${(err as Error).message}`);
  }
}

/**
 * A differenza della scansione/stato (permessi di lettura, concessi a
 * qualunque utente da NetworkManager), creare/attivare una connessione
 * richiede privilegi di amministrazione via polkit — "homehub" (utente di
 * sistema senza sessione di login) non li ha di norma: serve il permesso
 * sudo mirato di infra/systemd/homehub-wifi-sudoers (vedi README "Deploy").
 */
export async function connectWifi(ssid: string, password: string | null): Promise<void> {
  const args = ["-n", config.nmcliPath, "device", "wifi", "connect", ssid];
  if (password) args.push("password", password);

  try {
    await execFileAsync("sudo", args);
  } catch (err) {
    if (isCommandNotFound(err)) throw new WifiError("Gestione Wi-Fi non disponibile (nmcli assente)");
    throw new WifiError(`Connessione a "${ssid}" fallita: ${(err as Error).message}`);
  }
}
