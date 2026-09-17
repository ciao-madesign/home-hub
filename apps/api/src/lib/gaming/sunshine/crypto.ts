import crypto from "node:crypto";
import forge from "node-forge";

/**
 * Primitive crittografiche del protocollo di pairing GameStream/Sunshine
 * (verificate contro il sorgente reale di Sunshine, non documentazione di
 * terze parti — vedi docs/SPECIFICHE.md per i riferimenti):
 * AES-128-ECB SENZA padding, chiave derivata da SHA-256(salt‖PIN)
 * troncato a 16 byte, firme RSA-SHA256 sui secret scambiati. `node-forge`
 * serve solo per generare/leggere il certificato X.509 (Node core non ha
 * un builder di certificati, solo un parser in sola lettura) — stesso
 * principio già seguito per `werift`/WebTorrent: libreria pura
 * TypeScript, nessuna compilazione nativa.
 */

export function aesEncryptEcbNoPadding(key: Buffer, data: Buffer): Buffer {
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

export function aesDecryptEcbNoPadding(key: Buffer, data: Buffer): Buffer {
  const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function sha256(...parts: Buffer[]): Buffer {
  const hash = crypto.createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest();
}

/** Chiave AES-128 derivata da salt+PIN (§ "SHA-256 del salt concatenato al PIN, troncato a 16 byte"). */
export function deriveAesKey(salt: Buffer, pin: string): Buffer {
  return sha256(salt, Buffer.from(pin, "ascii")).subarray(0, 16);
}

export function sign256(privateKeyPem: string, data: Buffer): Buffer {
  const signer = crypto.createSign("sha256");
  signer.update(data);
  signer.end();
  return signer.sign(privateKeyPem);
}

export function verify256(certPem: string, data: Buffer, signature: Buffer): boolean {
  const verifier = crypto.createVerify("sha256");
  verifier.update(data);
  verifier.end();
  try {
    return verifier.verify(certPem, signature);
  } catch {
    return false; // certificato/firma malformati: non valido, non un errore fatale
  }
}

/**
 * Byte grezzi della firma ASN.1 del certificato (il campo BIT STRING
 * `signatureValue` della SEQUENCE X.509, non un hash/digest) — il
 * protocollo di pairing la usa come "prova di identità" del certificato
 * dentro l'hash scambiato nelle fasi 2/3. `node-forge` la espone già
 * come stringa binaria (un char = un byte), da qui la conversione con
 * `Buffer.from(str, "binary")`.
 */
export function getCertSignatureBytes(certPem: string): Buffer {
  const cert = forge.pki.certificateFromPem(certPem);
  return Buffer.from(cert.signature, "binary");
}

export interface GeneratedIdentity {
  certPem: string;
  privateKeyPem: string;
}

/** Certificato client self-signed, RSA-2048/SHA-256 — stessa forma di quello generato da Moonlight (CN unico, nessuna estensione, validità 20 anni: Sunshine accetta esplicitamente certificati "scaduti", vedi pairing.ts). */
export function generateClientIdentity(commonName: string): GeneratedIdentity {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "00";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 20);
  const attrs = [{ name: "commonName", value: commonName }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    certPem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}
