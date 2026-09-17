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
  // Limite ridotto applicato quando c'è una riproduzione Jellyfin attiva
  // O un backup in corso (§32, priorità dinamica — vedi lib/priority.ts).
  // 0 = disattiva la riduzione dinamica, resta sempre downloadMaxRateKbps.
  downloadThrottledRateKbps: Number(env("HUB_DOWNLOAD_THROTTLED_RATE_KBPS", "1000")),

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
  // (§32): limite di banda sempre applicato. 0 = nessun limite.
  backupMaxRateKbps: Number(env("HUB_BACKUP_MAX_RATE_KBPS", "0")),
  // Limite ridotto applicato quando c'è una riproduzione Jellyfin attiva
  // (§32, priorità dinamica — vedi lib/priority.ts). Il backup NON cede
  // priorità ai download (è "media", i download sono "minima"), solo
  // allo streaming. 0 = disattiva la riduzione dinamica.
  backupThrottledRateKbps: Number(env("HUB_BACKUP_THROTTLED_RATE_KBPS", "1000")),
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

  // Rete e setup iniziale (§21/§28). mDNS pubblica <hostname>.local sulla
  // LAN (nessun avahi-daemon richiesto, vedi docs/EXTERNAL_TOOLS.md);
  // disattivabile se la rete di destinazione blocca il multicast.
  mdnsEnabled: env("HUB_MDNS_ENABLED", "true") === "true",
  mdnsHostname: env("HUB_MDNS_HOSTNAME", "home-hub"),
  // Porta su cui è raggiungibile la Web App (nginx, non l'Hub API stessa —
  // stesso valore di HUB_WEB_PORT in infra/.env): è quella che va
  // pubblicizzata via mDNS/QR, non la porta interna dell'Hub API (§21).
  webPort: Number(env("HUB_WEB_PORT", "80")),

  // Wi-Fi (§28): richiede NetworkManager (nmcli) sull'host — tipicamente
  // assente in ambienti di sviluppo/container, degrado esplicito a "non
  // disponibile" quando manca (§31).
  nmcliPath: env("HUB_NMCLI_PATH", "nmcli"),

  // DDNS (§23): provider gratuito di default. DuckDNS scelto per l'API
  // pubblica estremamente semplice (una GET, nessuna libreria di terze
  // parti necessaria) — vedi docs/EXTERNAL_TOOLS.md. baseUrl è
  // sovrascrivibile per puntare a uno stub HTTP nei test.
  ddnsDomain: envOptional("HUB_DDNS_DOMAIN"), // es. "mio-hub" per mio-hub.duckdns.org
  ddnsToken: envOptional("HUB_DDNS_TOKEN"),
  ddnsBaseUrl: env("HUB_DDNS_BASE_URL", "https://www.duckdns.org"),
  ddnsIntervalMinutes: Number(env("HUB_DDNS_INTERVAL_MINUTES", "15")),

  // Stato Internet (§30): endpoint leggero usato solo per verificare la
  // raggiungibilità generica, non un servizio applicativo specifico —
  // stesso tipo di endpoint "generate_204" usato dai sistemi operativi per
  // il controllo di connettività.
  internetCheckUrl: env("HUB_INTERNET_CHECK_URL", "https://www.gstatic.com/generate_204"),
  internetCheckTimeoutMs: Number(env("HUB_INTERNET_CHECK_TIMEOUT_MS", "3000")),

  // Riavvio automatico dei servizi interni (§31): Jellyfin/Immich girano in
  // Docker separati dall'Hub API (che è sull'host, vedi §2/§3) — il
  // riavvio passa quindi da `docker restart <container>`, non da systemd.
  // Richiede che l'utente di sistema dell'Hub API possa parlare col
  // demone Docker (es. gruppo "docker") — degrado esplicito se non può.
  dockerPath: env("HUB_DOCKER_PATH", "docker"),
  jellyfinContainer: env("HUB_JELLYFIN_CONTAINER", "jellyfin"),
  immichContainer: env("HUB_IMMICH_CONTAINER", "immich-server"),
  watchdogIntervalSeconds: Number(env("HUB_WATCHDOG_INTERVAL_SECONDS", "60")),
  watchdogFailuresBeforeRestart: Number(env("HUB_WATCHDOG_FAILURES_BEFORE_RESTART", "3")),
  watchdogMaxRestartAttempts: Number(env("HUB_WATCHDOG_MAX_RESTART_ATTEMPTS", "3")),

  // Priorità di banda dinamica (§32, lib/priority.ts): ogni quanti secondi
  // interrogare Jellyfin /Sessions per sapere se c'è una riproduzione
  // attiva. Un valore basso reagisce prima all'inizio/fine di uno
  // streaming, ma interroga Jellyfin più spesso — 10s è lo stesso ordine
  // di grandezza già usato per il polling dello stato di sistema lato web.
  streamingCheckIntervalSeconds: Number(env("HUB_STREAMING_CHECK_INTERVAL_SECONDS", "10")),

  // Spegnimento sicuro da Web App (§34). L'utente di sistema dell'Hub API
  // (non root, §26) necessita di un permesso sudo mirato — vedi
  // infra/systemd/homehub-shutdown-sudoers e README "Deploy".
  shutdownCommand: env("HUB_SHUTDOWN_COMMAND", "sudo"),
  shutdownArgsJson: env("HUB_SHUTDOWN_ARGS_JSON", JSON.stringify(["/sbin/shutdown", "-h", "now"])),

  // VPN personale (WireGuard) — ultima funzione della Fase 9, la più
  // sensibile costruita finora (accesso di rete generico, non solo alle
  // API dell'Hub). Disattivato di default: richiede `wg`/`wg-quick`,
  // il modulo kernel WireGuard e CAP_NET_ADMIN/CAP_NET_RAW sull'host —
  // nessuno dei tre disponibile in ambienti di sviluppo/container (§31,
  // degrado esplicito a "non disponibile"). Design chiuso con l'utente,
  // vedi docs/SPECIFICHE.md §2.
  vpnEnabled: env("HUB_VPN_ENABLED", "false") === "true",
  wgPath: env("HUB_WG_PATH", "wg"),
  wgQuickPath: env("HUB_WG_QUICK_PATH", "wg-quick"),
  // Nome interfaccia e percorso del file di configurazione wg-quick
  // (il nome file, senza estensione, DEVE combaciare col nome interfaccia:
  // wg-quick lo richiede). Nella stessa cartella viene salvata anche la
  // chiave privata del server (mai quelle dei client, generate lato loro).
  vpnInterface: env("HUB_VPN_INTERFACE", "wg0"),
  vpnConfigDir: env("HUB_VPN_CONFIG_DIR", path.join(here, "..", "data", "vpn")),
  vpnListenPort: Number(env("HUB_VPN_LISTEN_PORT", "51820")),
  // Subnet dedicata al VPN (mai la stessa della LAN di casa): il server
  // prende il primo indirizzo utilizzabile, i peer i successivi in ordine.
  // Assume un /24 (semplificazione consapevole per V1 — coerente con
  // l'uso "personale", pochi peer attesi).
  vpnSubnetCidr: env("HUB_VPN_SUBNET_CIDR", "10.90.0.0/24"),
  // Interfaccia con uscita Internet, per il NAT (necessario solo al
  // profilo "tunnel completo", §2) — da adattare all'hardware reale.
  vpnWanInterface: env("HUB_VPN_WAN_INTERFACE", "eth0"),
  // Indirizzo pubblico da mostrare ai client per l'Endpoint WireGuard.
  // Se non impostato, riusa il dominio DDNS già configurato (§23) quando
  // presente — stesso indirizzo, motivo in più per condividerlo.
  vpnEndpointHost: envOptional("HUB_VPN_ENDPOINT_HOST"),

  // Aggiornamenti Hub autorizzati dalla Web App (§33). Root del
  // repository calcolata dalla posizione di questo modulo (come
  // hubConfigPaths sotto), non dalla cwd, per restare corretta sia in
  // sviluppo sia in produzione (systemd, WorkingDirectory=apps/api).
  repoRoot: path.join(here, "..", "..", ".."),
  gitPath: env("HUB_GIT_PATH", "git"),
  npmPath: env("HUB_NPM_PATH", "npm"),
  updateBranch: env("HUB_UPDATE_BRANCH", "main"),
  // Riavvio dell'Hub API dopo un aggiornamento: stesso principio dello
  // spegnimento (§34) — un permesso sudo mirato a un solo comando fisso
  // (mai influenzabile da questa richiesta), non un sudo generico.
  // Vedi infra/systemd/homehub-update-sudoers e README "Deploy".
  updateRestartCommand: env("HUB_UPDATE_RESTART_COMMAND", "sudo"),
  updateRestartArgsJson: env(
    "HUB_UPDATE_RESTART_ARGS_JSON",
    JSON.stringify(["systemctl", "restart", "home-hub-api"]),
  ),

  // Riproduzione su TV non Smart (fuori roadmap, richiesta esplicita
  // dell'utente — vedi docs/SPECIFICHE.md): mpv gira sul Wyse stesso,
  // pilotato dall'Hub API via il suo IPC JSON su socket Unix
  // (lib/tvPlayer/). Mai esposto al frontend direttamente, come ogni
  // altro backend interno (§2).
  mpvPath: env("HUB_MPV_PATH", "mpv"),
  tvMpvSocketPath: env("HUB_TV_MPV_SOCKET_PATH", path.join(here, "..", "data", "tv-mpv.sock")),
  // Argomenti extra passati a mpv (driver video/audio, tipicamente da
  // adattare all'hardware reale) come array JSON — default pensato per
  // un normale utilizzo desktop a schermo intero.
  tvMpvArgsJson: envOptional("HUB_TV_MPV_ARGS_JSON"),
};
