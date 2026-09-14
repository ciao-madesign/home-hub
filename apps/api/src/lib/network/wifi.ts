import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../../config.js";

const execFileAsync = promisify(execFile);

export class WifiError extends Error {}

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
 */
export async function isWifiManagementAvailable(): Promise<boolean> {
  try {
    await execFileAsync(config.nmcliPath, ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export async function getWifiStatus(): Promise<WifiStatus> {
  const available = await isWifiManagementAvailable();
  if (!available) return { available: false, connectedSsid: null };

  try {
    const { stdout } = await execFileAsync(config.nmcliPath, ["-t", "-f", "ACTIVE,SSID", "device", "wifi", "list"]);
    const activeLine = stdout
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("yes:"));
    const connectedSsid = activeLine ? activeLine.slice("yes:".length) : null;
    return { available: true, connectedSsid: connectedSsid || null };
  } catch (err) {
    throw new WifiError(`Lettura stato Wi-Fi fallita: ${(err as Error).message}`);
  }
}

export async function listWifiNetworks(): Promise<WifiNetwork[]> {
  const available = await isWifiManagementAvailable();
  if (!available) return [];

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
    throw new WifiError(`Scansione Wi-Fi fallita: ${(err as Error).message}`);
  }
}

export async function connectWifi(ssid: string, password: string | null): Promise<void> {
  const available = await isWifiManagementAvailable();
  if (!available) throw new WifiError("Gestione Wi-Fi non disponibile (nmcli assente)");

  const args = ["device", "wifi", "connect", ssid];
  if (password) args.push("password", password);

  try {
    await execFileAsync(config.nmcliPath, args);
  } catch (err) {
    throw new WifiError(`Connessione a "${ssid}" fallita: ${(err as Error).message}`);
  }
}
