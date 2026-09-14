import { config } from "../../config.js";
import { getSetting, setSetting } from "../setup.js";

const LAST_STATUS_KEY = "ddns_last_status";
const LAST_UPDATED_AT_KEY = "ddns_last_updated_at";

export interface DdnsStatus {
  configured: boolean;
  domain: string | null;
  lastStatus: "ok" | "error" | null;
  lastUpdatedAt: string | null;
}

export function isDdnsConfigured(): boolean {
  return config.ddnsDomain !== null && config.ddnsToken !== null;
}

export function getDdnsStatus(): DdnsStatus {
  return {
    configured: isDdnsConfigured(),
    domain: config.ddnsDomain,
    lastStatus: (getSetting(LAST_STATUS_KEY) as "ok" | "error" | null) ?? null,
    lastUpdatedAt: getSetting(LAST_UPDATED_AT_KEY),
  };
}

/**
 * Aggiorna il record DDNS con l'IP pubblico corrente (§23). Nessun IP
 * passato esplicitamente: DuckDNS lo rileva dalla richiesta stessa, che è
 * il comportamento voluto (l'Hub non deve determinare da sé il proprio IP
 * pubblico, spesso non banale dietro NAT).
 */
export async function updateDdns(): Promise<void> {
  if (!isDdnsConfigured()) return;

  const url = `${config.ddnsBaseUrl}/update?domains=${encodeURIComponent(config.ddnsDomain!)}&token=${encodeURIComponent(config.ddnsToken!)}&ip=`;
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const body = (await res.text()).trim();

    setSetting(LAST_STATUS_KEY, res.ok && body.toUpperCase().startsWith("OK") ? "ok" : "error");
    setSetting(LAST_UPDATED_AT_KEY, now);
  } catch {
    setSetting(LAST_STATUS_KEY, "error");
    setSetting(LAST_UPDATED_AT_KEY, now);
  }
}

/** Scheduler "lazy" (stesso pattern di backup/purge): nessun cron reale. */
export function bootstrapDdnsUpdater(): void {
  if (!isDdnsConfigured()) return;
  updateDdns().catch(() => {});
  setInterval(() => updateDdns().catch(() => {}), config.ddnsIntervalMinutes * 60 * 1000).unref();
}
