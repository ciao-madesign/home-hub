import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: Number(env("HUB_API_PORT", "4000")),
  host: env("HUB_API_HOST", "0.0.0.0"),

  // Percorso del file SQLite (dati Hub: utenti, sessioni, config, ecc.)
  dbPath: env("HUB_DB_PATH", path.join(here, "..", "data", "hub.sqlite")),

  // Radice della libreria dati (struttura descritta in docs/SPEC_V1.md §4)
  dataRoot: env("HUB_DATA_ROOT", path.join(here, "..", "..", "..", "infra", "data")),

  // Soglia di spazio libero critico sui dischi dati (in % — vedi §4/§30)
  diskCriticalFreePercent: Number(env("HUB_DISK_CRITICAL_FREE_PERCENT", "10")),

  // Origini consentite per il frontend in sviluppo
  corsOrigins: env("HUB_CORS_ORIGINS", "http://localhost:5173").split(","),

  // Backend multimediali (opzionali in scaffold: se non raggiungibili, la
  // sezione resta visibile ma "non disponibile", come da §31)
  jellyfinUrl: process.env.HUB_JELLYFIN_URL ?? null,
  immichUrl: process.env.HUB_IMMICH_URL ?? null,

  // Durata sessione (secondi) — §24: "sessione persistente, durata fissa breve"
  sessionTtlLocalSeconds: Number(env("HUB_SESSION_TTL_LOCAL", String(60 * 60 * 24 * 30))),
  sessionTtlRemoteSeconds: Number(env("HUB_SESSION_TTL_REMOTE", String(60 * 60 * 12))),
};
