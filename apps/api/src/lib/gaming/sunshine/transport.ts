import { randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { config } from "../../../config.js";
import { getClientIdentity } from "./identity.js";

export class SunshineError extends Error {}

/** Query string comune a ogni richiesta GameStream (§ "uniqueid"/"uuid"/"devicename"/"updateState"). */
export function buildQuery(params: Record<string, string>): string {
  return new URLSearchParams({
    uniqueid: getClientIdentity().uniqueId,
    uuid: randomUUID(),
    devicename: "homehub",
    updateState: "1",
    ...params,
  }).toString();
}

/** Porta base GameStream configurata per la macchina, o il default dell'Hub se non impostata. */
export function resolveSunshineBasePort(configuredPort: number | null): number {
  return configuredPort ?? config.sunshineDefaultPort;
}

/** La porta HTTPS di Sunshine è sempre base-5 — convenzione fissa del protocollo, mai un valore indipendente (unica fonte di verità, usata sia dal pairing sia dall'API post-pairing). */
export function sunshineHttpsPort(basePort: number): number {
  return basePort - 5;
}

function collectBody(res: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    res.on("error", reject);
  });
}

/**
 * Fase 1 del pairing (`getservercert`) resta appesa lato Sunshine finché
 * l'utente non inserisce il PIN nella Web UI dell'host (fino a 5 minuti,
 * verificato nel sorgente Sunshine) — un timeout troppo corto la
 * interromperebbe prima che l'utente possa reagire.
 */
export function httpGet(url: string, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      collectBody(res).then(resolve, reject);
    });
    req.on("timeout", () => req.destroy(new SunshineError("Timeout nella richiesta a Sunshine")));
    req.on("error", (err) => reject(new SunshineError(err.message)));
  });
}

export interface TlsCredentials {
  key: string;
  cert: string;
  ca: string; // certificato dell'host Sunshine, pinnato al pairing
}

/**
 * L'API HTTPS di Sunshine richiede un certificato client valido su ogni
 * richiesta (fasi successive al pairing) — il server pinnato in `ca`
 * verifica l'identità dell'host, `checkServerIdentity` viene disattivato
 * perché il certificato che genera Sunshine non ha mai un SAN (solo CN):
 * l'hostname non è verificabile nel modo standard, ma l'identità
 * dell'host resta comunque garantita dal pinning del certificato esatto
 * ottenuto durante il pairing — non un semplice `rejectUnauthorized: false`,
 * che butterebbe via anche quella protezione.
 */
export function httpsGet(url: string, tls: TlsCredentials, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        key: tls.key,
        cert: tls.cert,
        ca: tls.ca,
        checkServerIdentity: () => undefined,
        timeout: timeoutMs,
      },
      (res) => {
        collectBody(res).then(resolve, reject);
      },
    );
    req.on("timeout", () => req.destroy(new SunshineError("Timeout nella richiesta a Sunshine")));
    req.on("error", (err) => reject(new SunshineError(err.message)));
  });
}
