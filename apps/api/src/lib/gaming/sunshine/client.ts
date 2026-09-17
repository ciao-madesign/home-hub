import { randomBytes, randomInt } from "node:crypto";
import type { MachineRow } from "../store.js";
import { getClientIdentity } from "./identity.js";
import { buildQuery, httpsGet, resolveSunshineBasePort, sunshineHttpsPort, SunshineError } from "./transport.js";
import { extractApps, extractStatusCode, extractStatusMessage, extractXmlTag, type XmlApp } from "./xml.js";

/**
 * API HTTPS di Sunshine dopo il pairing (§10) — ogni chiamata usa il
 * certificato client dell'Hub e il certificato dell'host pinnato al
 * pairing (mai `rejectUnauthorized: false`, vedi transport.ts).
 *
 * Sunshine risponde sempre con HTTP 200, anche per gli errori — l'esito
 * vero è nell'attributo XML `status_code` (che può anche essere -1, un
 * intero con segno, non un vero codice HTTP: verificato leggendo il
 * sorgente reale di Sunshine, vedi docs/SPECIFICHE.md). Non fidarsi mai
 * dello stato HTTP.
 */

function httpsPortFor(machine: MachineRow): number {
  return sunshineHttpsPort(resolveSunshineBasePort(machine.sunshine_port));
}

function requirePaired(machine: MachineRow): string {
  if (!machine.sunshine_server_cert) {
    throw new SunshineError("Macchina non accoppiata con Sunshine");
  }
  if (!machine.host) {
    throw new SunshineError("Macchina remota senza host configurato");
  }
  return machine.sunshine_server_cert;
}

async function sunshineGet(machine: MachineRow, serverCert: string, pathAndQuery: string): Promise<string> {
  const identity = getClientIdentity();
  return httpsGet(`https://${machine.host}:${httpsPortFor(machine)}${pathAndQuery}`, {
    key: identity.privateKeyPem,
    cert: identity.certPem,
    ca: serverCert,
  });
}

function requireSuccess(xml: string, fallbackMessage: string): void {
  const code = extractStatusCode(xml);
  if (code !== 200) {
    const message = extractStatusMessage(xml) ?? fallbackMessage;
    throw new SunshineError(message);
  }
}

export async function listApps(machine: MachineRow): Promise<XmlApp[]> {
  const serverCert = requirePaired(machine);
  const xml = await sunshineGet(machine, serverCert, `/applist?${buildQuery({})}`);
  return extractApps(xml);
}

export interface SunshineServerInfo {
  /** appid in esecuzione sull'host, null se libero (§ "SUNSHINE_SERVER_BUSY/FREE"). */
  currentGameAppId: string | null;
}

export async function getServerInfo(machine: MachineRow): Promise<SunshineServerInfo> {
  const serverCert = requirePaired(machine);
  const xml = await sunshineGet(machine, serverCert, `/serverinfo?${buildQuery({})}`);
  const currentGame = extractXmlTag(xml, "currentgame");
  return { currentGameAppId: currentGame && currentGame !== "0" ? currentGame : null };
}

/**
 * Avvia davvero l'app sull'host (§10, chiude la proposta aperta) — l'Hub
 * NON diventa un client Moonlight/streaming: lancia solo il processo,
 * senza mai aprire la sessione RTSP che Sunshine prepara di conseguenza
 * (si scarta da sola lato host dopo 10s se nessuno la consuma, verificato
 * nel sorgente — nessun /cancel necessario per quella parte). Chi vuole
 * vedere/giocare apre un client Moonlight reale sul proprio dispositivo,
 * separatamente: quella è la Fase Remote Gaming V2 (Moonlight sul Wyse),
 * fuori scope qui.
 *
 * `sops=0` evita che Sunshine tenti di riconfigurare la risoluzione del
 * display host (irrilevante per noi, potenzialmente sorprendente per chi
 * lo sta usando in locale in quel momento); `corever=1` con una vera
 * chiave AES evita il rifiuto quando l'host richiede la cifratura RTSP
 * obbligatoria, anche se quella chiave non verrà mai usata per davvero.
 */
export async function launchApp(machine: MachineRow, appId: string): Promise<void> {
  const serverCert = requirePaired(machine);
  const rikey = randomBytes(16).toString("hex");
  const rikeyid = String(randomInt(0, 2 ** 31));

  const xml = await sunshineGet(
    machine,
    serverCert,
    `/launch?${buildQuery({
      appid: appId,
      mode: "1920x1080x60",
      sops: "0",
      rikey,
      rikeyid,
      localAudioPlayMode: "0",
      surroundAudioInfo: "196610",
      gcmap: "0",
      hdrMode: "0",
      corever: "1",
    })}`,
  );
  requireSuccess(xml, "Avvio dell'app rifiutato da Sunshine");
}

/** Ferma davvero l'app in esecuzione sull'host (§10) — a differenza di launchApp, questo termina il processo (verificato nel sorgente Sunshine: /cancel non è un no-op di pulizia). */
export async function cancelApp(machine: MachineRow): Promise<void> {
  const serverCert = requirePaired(machine);
  const xml = await sunshineGet(machine, serverCert, `/cancel?${buildQuery({})}`);
  requireSuccess(xml, "Impossibile fermare l'app su Sunshine");
}
