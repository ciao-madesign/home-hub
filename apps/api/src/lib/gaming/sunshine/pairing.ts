import { randomBytes, randomInt } from "node:crypto";
import {
  aesDecryptEcbNoPadding,
  aesEncryptEcbNoPadding,
  deriveAesKey,
  getCertSignatureBytes,
  sha256,
  sign256,
  verify256,
} from "./crypto.js";
import { getClientIdentity } from "./identity.js";
import { buildQuery, httpGet, httpsGet, sunshineHttpsPort, SunshineError } from "./transport.js";
import { extractXmlTag } from "./xml.js";

/**
 * Pairing GameStream con un host Sunshine reale (§10, proposta aperta
 * chiusa — vedi docs/SPECIFICHE.md): 5 fasi verificate leggendo il
 * sorgente reale di Sunshine (`nvhttp.cpp`) e dei client Moonlight
 * ufficiali (moonlight-qt/moonlight-android), non documentazione di
 * terze parti. Fasi 1-4 su HTTP semplice (porta GameStream, es. 47989),
 * fase 5 su HTTPS (porta base-5, es. 47984) con il certificato client
 * appena registrato — è la vera prova che il pairing è stato accettato.
 */

const PHASE1_TIMEOUT_MS = 5 * 60 * 1000 + 10_000; // Sunshine tiene la sessione aperta fino a 5 minuti, +margine
const DEFAULT_TIMEOUT_MS = 8000;
// Una volta raggiunto uno stato finale (paired/wrong_pin/failed) la
// sessione non serve più oltre a far leggere l'esito da un ultimo poll
// del frontend — rimossa dopo una breve finestra invece di restare in
// memoria per sempre (`machines.sunshine_server_cert` nel DB resta
// comunque la fonte di verità del pairing riuscito).
const SESSION_RETENTION_MS = 30_000;

export type PairingStatus = "waiting_for_pin" | "verifying" | "paired" | "wrong_pin" | "failed";

export interface PairingSession {
  machineId: string;
  pin: string;
  status: PairingStatus;
  errorMessage: string | null;
}

const sessions = new Map<string, PairingSession>();

export function getPairingSession(machineId: string): PairingSession | null {
  return sessions.get(machineId) ?? null;
}

/** Da chiamare quando una macchina viene rimossa (routes/gaming.ts) — evita una sessione orfana per un machineId che non esiste più. */
export function removePairingSession(machineId: string): void {
  sessions.delete(machineId);
}

function scheduleSessionCleanup(machineId: string): void {
  setTimeout(() => sessions.delete(machineId), SESSION_RETENTION_MS).unref();
}

/**
 * Avvia il pairing e ritorna subito il PIN da mostrare all'utente — che lo
 * digita nella Web UI di Sunshine sulla macchina remota (porta 47990),
 * MAI in questo Hub. Il resto del flusso prosegue in background (la fase
 * 1 blocca fino a 5 minuti): il chiamante interroga `getPairingSession`
 * per sapere quando è finita.
 */
export function beginPairing(
  machineId: string,
  host: string,
  httpPort: number,
  onPaired: (serverCertPem: string) => void,
): { pin: string } {
  const pin = String(randomInt(0, 10_000)).padStart(4, "0");
  const session: PairingSession = { machineId, pin, status: "waiting_for_pin", errorMessage: null };
  sessions.set(machineId, session);

  runPairing(session, host, httpPort)
    .then((serverCertPem) => {
      session.status = "paired";
      onPaired(serverCertPem);
    })
    .catch((err) => {
      if (session.status !== "wrong_pin") session.status = "failed";
      session.errorMessage = err instanceof Error ? err.message : String(err);
    })
    .finally(() => scheduleSessionCleanup(machineId));

  return { pin };
}

async function runPairing(session: PairingSession, host: string, httpPort: number): Promise<string> {
  const identity = getClientIdentity();
  const clientCertSig = getCertSignatureBytes(identity.certPem);

  const salt = randomBytes(16);
  const aesKey = deriveAesKey(salt, session.pin);

  // Fase 1 — getservercert: resta appesa finché l'utente non conferma il PIN sulla Web UI di Sunshine.
  const phase1 = await httpGet(
    `http://${host}:${httpPort}/pair?${buildQuery({
      phrase: "getservercert",
      salt: salt.toString("hex"),
      clientcert: Buffer.from(identity.certPem, "utf8").toString("hex"),
    })}`,
    PHASE1_TIMEOUT_MS,
  );
  session.status = "verifying";
  if (extractXmlTag(phase1, "paired") !== "1") {
    throw new SunshineError("L'host Sunshine ha rifiutato la richiesta di pairing");
  }
  const plaincertHex = extractXmlTag(phase1, "plaincert");
  if (!plaincertHex) {
    throw new SunshineError("Un altro pairing è già in corso su questo host Sunshine");
  }
  const serverCertPem = Buffer.from(plaincertHex, "hex").toString("utf8");
  const serverCertSig = getCertSignatureBytes(serverCertPem);

  // Fase 2 — clientchallenge.
  const clientChallenge = randomBytes(16);
  const phase2 = await httpGet(
    `http://${host}:${httpPort}/pair?${buildQuery({
      clientchallenge: aesEncryptEcbNoPadding(aesKey, clientChallenge).toString("hex"),
    })}`,
    DEFAULT_TIMEOUT_MS,
  );
  if (extractXmlTag(phase2, "paired") !== "1") throw new SunshineError("Fase 2 del pairing fallita");
  const challengeResponseHex = extractXmlTag(phase2, "challengeresponse");
  if (!challengeResponseHex) throw new SunshineError("Risposta della fase 2 incompleta");
  const decoded2 = aesDecryptEcbNoPadding(aesKey, Buffer.from(challengeResponseHex, "hex"));
  const serverResponse = decoded2.subarray(0, 32);
  const serverChallenge = decoded2.subarray(32, 48);

  // Fase 3 — serverchallengeresp.
  const clientSecret = randomBytes(16);
  const clientHash = sha256(serverChallenge, clientCertSig, clientSecret);
  const phase3 = await httpGet(
    `http://${host}:${httpPort}/pair?${buildQuery({
      serverchallengeresp: aesEncryptEcbNoPadding(aesKey, clientHash).toString("hex"),
    })}`,
    DEFAULT_TIMEOUT_MS,
  );
  if (extractXmlTag(phase3, "paired") !== "1") throw new SunshineError("Fase 3 del pairing fallita");
  const pairingSecretHex = extractXmlTag(phase3, "pairingsecret");
  if (!pairingSecretHex) throw new SunshineError("Risposta della fase 3 incompleta");
  const pairingSecret = Buffer.from(pairingSecretHex, "hex");
  const serverSecret = pairingSecret.subarray(0, 16);
  const serverSignature = pairingSecret.subarray(16);

  // Due verifiche indipendenti, entrambe necessarie prima di proseguire:
  if (!verify256(serverCertPem, serverSecret, serverSignature)) {
    throw new SunshineError("Firma dell'host Sunshine non valida — possibile intercettazione");
  }
  const expectedServerResponse = sha256(clientChallenge, serverCertSig, serverSecret);
  if (!expectedServerResponse.equals(serverResponse)) {
    session.status = "wrong_pin";
    throw new SunshineError("PIN errato");
  }

  // Fase 4 — clientpairingsecret.
  const clientPairingSecret = Buffer.concat([clientSecret, sign256(identity.privateKeyPem, clientSecret)]);
  const phase4 = await httpGet(
    `http://${host}:${httpPort}/pair?${buildQuery({
      clientpairingsecret: clientPairingSecret.toString("hex"),
    })}`,
    DEFAULT_TIMEOUT_MS,
  );
  if (extractXmlTag(phase4, "paired") !== "1") throw new SunshineError("Fase 4 del pairing fallita");

  // Fase 5 — pairchallenge su HTTPS: conferma che il certificato client è stato registrato davvero.
  const phase5 = await httpsGet(
    `https://${host}:${sunshineHttpsPort(httpPort)}/pair?${buildQuery({ phrase: "pairchallenge" })}`,
    { key: identity.privateKeyPem, cert: identity.certPem, ca: serverCertPem },
    DEFAULT_TIMEOUT_MS,
  );
  if (extractXmlTag(phase5, "paired") !== "1") {
    throw new SunshineError("Conferma HTTPS del pairing fallita");
  }

  return serverCertPem;
}
