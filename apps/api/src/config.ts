import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function envOptional(name: string): string | null {
  return process.env[name] ?? null;
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
  jellyfinUrl: process.env.HUB_JELLYFIN_URL ?? null, // usato solo per l'health probe in §30
  immichUrl: process.env.HUB_IMMICH_URL ?? null,

  // Client Jellyfin (Fase 5 — Film/Serie, §7). L'API key si crea da
  // Jellyfin: Dashboard → API Keys.
  jellyfinBaseUrl: process.env.HUB_JELLYFIN_BASE_URL ?? null,
  jellyfinApiKey: process.env.HUB_JELLYFIN_API_KEY ?? null,

  // Client Immich (Fase 5 — Foto/Video personali, §8). L'API key si crea
  // da Immich: Account Settings → API Keys.
  immichBaseUrl: process.env.HUB_IMMICH_BASE_URL ?? null,
  immichApiKey: process.env.HUB_IMMICH_API_KEY ?? null,

  // Durata sessione (secondi) — §24: "sessione persistente, durata fissa breve"
  sessionTtlLocalSeconds: Number(env("HUB_SESSION_TTL_LOCAL", String(60 * 60 * 24 * 30))),
  sessionTtlRemoteSeconds: Number(env("HUB_SESSION_TTL_REMOTE", String(60 * 60 * 12))),

  // Download Manager (§12). yt-dlp per i download "normali" da URL (vedi
  // docs/EXTERNAL_TOOLS.md), WebTorrent (libreria embedded) per i torrent.
  ytdlpPath: env("HUB_YTDLP_PATH", "yt-dlp"),
  downloadMaxConcurrent: Number(env("HUB_DOWNLOAD_MAX_CONCURRENT", "2")),
  // Priorità minima rispetto a streaming/backup (§32): limite di banda
  // globale sempre applicato. 0 = nessun limite.
  downloadMaxRateKbps: Number(env("HUB_DOWNLOAD_MAX_RATE_KBPS", "8000")),

  // Gaming (§10). Timeout del probe di stato di un PC remoto (ms) e
  // mappa piattaforma → comando emulatore, sovrascrivibile per adattarla
  // agli emulatori realmente installati sull'hardware di destinazione.
  machineProbeTimeoutMs: Number(env("HUB_MACHINE_PROBE_TIMEOUT_MS", "2000")),
  emulatorMapJson: process.env.HUB_EMULATOR_MAP_JSON ?? null,

  // Storage e Backup (§4/§5/§29). Nessun default per HUB_BACKUP_ROOT: senza
  // un secondo disco configurato il backup resta "non disponibile" (l'Hub
  // continua a funzionare con un avviso, §5) — coerente con la spec, che
  // descrive il disco di backup come "non acquistato/configurato
  // inizialmente, previsto come espansione".
  backupRoot: envOptional("HUB_BACKUP_ROOT"),
  backupIntervalHours: Number(env("HUB_BACKUP_INTERVAL_HOURS", "24")),
  // Priorità minima rispetto allo streaming, media rispetto ai download
  // (§32): stessa semplificazione già adottata per il Download Manager
  // (limite statico configurabile, non ancora legato dinamicamente
  // all'attività di streaming in corso — vedi proposte aperte in
  // docs/SPECIFICHE.md). 0 = nessun limite.
  backupMaxRateKbps: Number(env("HUB_BACKUP_MAX_RATE_KBPS", "0")),
  // Età massima (ore) oltre la quale un backup non è più considerato
  // "recente e valido" ai fini della guardia per operazioni rischiose (§5).
  backupRecentMaxAgeHours: Number(env("HUB_BACKUP_RECENT_MAX_AGE_HOURS", "48")),

  // SMART (§29): richiede smartctl (smartmontools) e, per risalire dal
  // mount point al device, findmnt — entrambi tipicamente assenti in
  // ambienti di sviluppo/container: degrado esplicito a "non disponibile"
  // quando mancano, mai un errore fatale (coerente con §31).
  smartctlPath: env("HUB_SMARTCTL_PATH", "smartctl"),
  findmntPath: env("HUB_FINDMNT_PATH", "findmnt"),

  // Dischi aggiuntivi da monitorare oltre a dataRoot/backupRoot (§29),
  // come JSON: [{"id":"...","label":"...","path":"..."}]
  extraDisksJson: process.env.HUB_EXTRA_DISKS_JSON ?? null,

  // Percorsi delle configurazioni Hub/Docker incluse nel backup (§5:
  // "configurazioni Hub, configurazioni Docker"). Calcolati dalla posizione
  // di questo modulo, non dalla cwd, per restare corretti sia in sviluppo
  // (tsx da apps/api) sia in produzione (systemd, WorkingDirectory=apps/api).
  hubConfigPaths: {
    apiEnv: path.join(here, "..", ".env"),
    infraEnv: path.join(here, "..", "..", "..", "infra", ".env"),
    dockerCompose: path.join(here, "..", "..", "..", "infra", "docker-compose.yml"),
    systemdUnit: path.join(here, "..", "..", "..", "infra", "systemd", "home-hub-api.service"),
  },
};
