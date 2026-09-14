import Bonjour, { type Service } from "bonjour-service";
import { config } from "../../config.js";

let instance: Bonjour | null = null;
let publishedService: Service | null = null;

/**
 * Pubblica l'Hub come `<hostname>.local` via mDNS/DNS-SD (§21). Nessuna
 * dipendenza da avahi-daemon: bonjour-service invia/riceve i pacchetti
 * multicast DNS direttamente da un socket UDP nel processo Node.
 *
 * Se il bind del socket multicast fallisce (rete che lo blocca, sandbox
 * senza supporto multicast) il discovery `.local`/QR resta "non
 * disponibile" ma l'Hub continua a funzionare normalmente (§31) — non è
 * un errore fatale.
 */
export function startMdnsAdvertising(): void {
  if (!config.mdnsEnabled || instance) return;

  try {
    instance = new Bonjour();
    publishedService = instance.publish({
      name: config.mdnsHostname,
      host: `${config.mdnsHostname}.local`,
      type: "http",
      // La Web App (nginx), non la porta interna dell'Hub API: è quella su
      // cui un browser deve atterrare aprendo "<hostname>.local".
      port: config.webPort,
    });
    publishedService.on("error", (err: Error) => {
      console.warn("mDNS: annuncio interrotto:", err.message);
    });
  } catch (err) {
    console.warn("mDNS non disponibile:", (err as Error).message);
    instance = null;
    publishedService = null;
  }
}

export function isMdnsActive(): boolean {
  return publishedService !== null;
}

export function stopMdnsAdvertising(): void {
  instance?.unpublishAll(() => instance?.destroy());
  instance = null;
  publishedService = null;
}
