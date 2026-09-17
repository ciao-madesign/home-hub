import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../../../config.js";
import { generateClientIdentity } from "./crypto.js";

export interface ClientIdentity {
  /** Chiave con cui Sunshine tiene traccia della sessione di pairing (§ "uniqueid") — stabile, non rigenerato ad ogni richiesta come fa Moonlight con `uuid`. */
  uniqueId: string;
  certPem: string;
  privateKeyPem: string;
}

/**
 * Un'unica identità client per l'intero Hub, persistita su disco (mai nel
 * DB, mai esposta in una DTO — stesso principio già seguito per la chiave
 * privata del server VPN, config.vpnConfigDir): lo stesso certificato
 * viene presentato a ogni macchina remota con cui ci si accoppia, ognuna
 * lo registra autonomamente lato Sunshine — non serve un'identità diversa
 * per macchina.
 */
let cached: ClientIdentity | null = null;

export function getClientIdentity(): ClientIdentity {
  if (cached) return cached;

  const file = config.sunshineIdentityPath;
  if (existsSync(file)) {
    cached = JSON.parse(readFileSync(file, "utf8")) as ClientIdentity;
    return cached;
  }

  const { certPem, privateKeyPem } = generateClientIdentity("Home Hub");
  const identity: ClientIdentity = {
    uniqueId: randomBytes(8).toString("hex"),
    certPem,
    privateKeyPem,
  };

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(identity, null, 2), { mode: 0o600 });
  cached = identity;
  return identity;
}
