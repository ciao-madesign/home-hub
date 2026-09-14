import os from "node:os";
import { config } from "../../config.js";
import { isMdnsActive } from "./mdns.js";

export interface LocalNetworkInfo {
  ips: string[];
  /** Porta della Web App (nginx), non quella interna dell'Hub API. */
  webPort: number;
  mdnsHostname: string | null;
  mdnsUrl: string | null;
  /** URL "migliore" da proporre per QR/discovery (mDNS se attivo, altrimenti il primo IP). */
  primaryUrl: string | null;
}

function withPort(host: string): string {
  return config.webPort === 80 ? `http://${host}` : `http://${host}:${config.webPort}`;
}

/** IP e URL locali per il discovery (§21: "IP disponibile nelle impostazioni tecniche"). */
export function getLocalNetworkInfo(): LocalNetworkInfo {
  const ips: string[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) ips.push(addr.address);
    }
  }

  const mdnsActive = isMdnsActive();
  const mdnsHostname = mdnsActive ? config.mdnsHostname : null;
  const mdnsUrl = mdnsActive ? withPort(`${config.mdnsHostname}.local`) : null;
  const primaryUrl = mdnsUrl ?? (ips.length > 0 ? withPort(ips[0]) : null);

  return { ips, webPort: config.webPort, mdnsHostname, mdnsUrl, primaryUrl };
}
