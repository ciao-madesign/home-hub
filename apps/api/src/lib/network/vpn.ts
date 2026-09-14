import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../../config.js";
import { getDb } from "../../db/index.js";
import { getSetting, setSetting } from "../setup.js";
import { isDdnsConfigured } from "./ddns.js";
import { getLocalNetworkInfo } from "./interfaces.js";

const execFileAsync = promisify(execFile);

export class VpnError extends Error {
  constructor(
    message: string,
    public code: "not_configured" | "invalid_key" | "duplicate_key" | "pool_exhausted" = "not_configured",
  ) {
    super(message);
  }
}

export type VpnProfile = "home" | "full";

export interface VpnPeerRow {
  id: string;
  user_id: string;
  label: string;
  profile: VpnProfile;
  public_key: string;
  address: string;
  created_at: string;
}

export interface VpnPeerDto {
  id: string;
  label: string;
  profile: VpnProfile;
  publicKey: string;
  address: string;
  allowedIps: string;
  createdAt: string;
  connected: boolean;
  lastHandshakeAt: string | null;
}

const SERVER_PUBLIC_KEY_SETTING = "vpn_server_public_key";
const SERVER_PUBLIC_KEY_REGEX = /^[A-Za-z0-9+/]{43}=$/;

function serverKeyPath(): string {
  return path.join(config.vpnConfigDir, "server.key");
}

function confPath(): string {
  return path.join(config.vpnConfigDir, `${config.vpnInterface}.conf`);
}

export function isVpnConfigured(): boolean {
  return config.vpnEnabled;
}

function isCommandNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

// --- Subnet / allocazione indirizzi (assume un /24, §2: semplificazione
// consapevole per un uso personale con pochi peer attesi) -------------------

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function intToIp(n: number): string {
  return [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join(".");
}

function subnetInfo(): { baseInt: number; prefix: number; size: number } {
  const [ip, prefixStr] = config.vpnSubnetCidr.split("/");
  const prefix = Number(prefixStr);
  return { baseInt: ipToInt(ip), prefix, size: 2 ** (32 - prefix) };
}

/** Primo indirizzo utilizzabile della subnet: sempre quello del server. */
function serverAddress(): string {
  const { baseInt } = subnetInfo();
  return intToIp(baseInt + 1);
}

/** Prossimo indirizzo libero per un nuovo peer (il server occupa il primo). */
function allocateAddress(): string {
  const { baseInt, size } = subnetInfo();
  const taken = new Set(
    (getDb().prepare("SELECT address FROM vpn_peers").all() as { address: string }[]).map((r) => r.address),
  );
  for (let offset = 2; offset < size - 1; offset += 1) {
    const candidate = intToIp(baseInt + offset);
    if (!taken.has(candidate)) return candidate;
  }
  throw new VpnError("Nessun indirizzo libero nella subnet VPN configurata", "pool_exhausted");
}

// --- Chiave del server (mai quelle dei client, §2) --------------------------

/**
 * Genera (una sola volta) e mette in cache la coppia di chiavi del server.
 * Sincrono e invocato solo al bootstrap/alla prima creazione di un peer,
 * mai su un percorso richiesto spesso — evita la complessità di collegare
 * lo stdin di un child process asincrono solo per `wg pubkey`.
 */
async function ensureServerKeypair(): Promise<{ privateKey: string; publicKey: string }> {
  await fs.mkdir(config.vpnConfigDir, { recursive: true, mode: 0o700 });

  let privateKey: string;
  try {
    privateKey = (await fs.readFile(serverKeyPath(), "utf8")).trim();
  } catch {
    privateKey = execFileSync(config.wgPath, ["genkey"]).toString().trim();
    await fs.writeFile(serverKeyPath(), `${privateKey}\n`, { mode: 0o600 });
  }

  let publicKey = getSetting(SERVER_PUBLIC_KEY_SETTING);
  if (!publicKey) {
    publicKey = execFileSync(config.wgPath, ["pubkey"], { input: privateKey }).toString().trim();
    setSetting(SERVER_PUBLIC_KEY_SETTING, publicKey);
  }

  return { privateKey, publicKey };
}

// --- File di configurazione wg-quick e applicazione live --------------------

function peerConfBlock(peer: VpnPeerRow): string {
  return [
    `# ${peer.label} (${peer.profile}) — creato ${peer.created_at}`,
    "[Peer]",
    `PublicKey = ${peer.public_key}`,
    `AllowedIPs = ${peer.address}/32`,
    "",
  ].join("\n");
}

/**
 * Isolamento (§2): il tunnel raggiunge solo l'Hub (traffico verso l'host,
 * gestito dalla chain INPUT, sempre permesso) e l'uscita Internet (chain
 * FORWARD verso l'interfaccia WAN, con NAT) — mai il resto della rete di
 * casa. Vale per entrambi i profili: è l'AllowedIPs lato client, non
 * questa regola, a distinguere "solo Hub" da "tunnel completo" — qui è
 * una barriera server-side indipendente da cosa dichiara il client.
 * Assume iptables (anche via lo shim iptables-nft, presente di default
 * sulle distribuzioni Debian/Ubuntu recenti) come backend firewall attivo.
 */
async function writeConfigFile(): Promise<void> {
  const { privateKey } = await ensureServerKeypair();
  const { prefix } = subnetInfo();
  const peers = getDb().prepare("SELECT * FROM vpn_peers ORDER BY created_at ASC").all() as unknown as VpnPeerRow[];

  const iface = config.vpnInterface;
  const wan = config.vpnWanInterface;
  const subnet = config.vpnSubnetCidr;

  const interfaceBlock = [
    "[Interface]",
    `PrivateKey = ${privateKey}`,
    `Address = ${serverAddress()}/${prefix}`,
    `ListenPort = ${config.vpnListenPort}`,
    `PostUp = iptables -A FORWARD -i ${iface} ! -o ${wan} -j DROP; iptables -A FORWARD -i ${iface} -o ${wan} -j ACCEPT; iptables -t nat -A POSTROUTING -o ${wan} -s ${subnet} -j MASQUERADE`,
    `PostDown = iptables -D FORWARD -i ${iface} ! -o ${wan} -j DROP; iptables -D FORWARD -i ${iface} -o ${wan} -j ACCEPT; iptables -t nat -D POSTROUTING -o ${wan} -s ${subnet} -j MASQUERADE`,
    "",
  ].join("\n");

  const content = interfaceBlock + peers.map(peerConfBlock).join("\n");
  await fs.mkdir(config.vpnConfigDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(confPath(), content, { mode: 0o600 });
}

/**
 * Riapplica l'interfaccia (down + up) dopo ogni modifica ai peer: più
 * semplice e prevedibile di un `wg syncconf` a caldo (che richiederebbe
 * un file temporaneo con l'output di `wg-quick strip`), a costo di un
 * brevissimo down/up dell'interfaccia — accettabile per un VPN personale
 * con pochi peer e modifiche rare (stessa filosofia "lazy" già adottata
 * altrove nel progetto, es. purge di cestino/download). Mai un errore
 * fatale: se l'interfaccia non può essere applicata (§31 — tipicamente
 * perché manca il modulo kernel WireGuard, come in questo ambiente di
 * sviluppo), la configurazione resta comunque scritta su disco e i peer
 * gestibili da DB; andrà solo riprovata dopo il deploy su hardware reale.
 */
async function applyConfig(): Promise<void> {
  await writeConfigFile();
  if (isCommandsAvailableCache === false) return;

  try {
    await execFileAsync(config.wgQuickPath, ["down", confPath()]);
  } catch {
    // interfaccia non ancora attiva: normale al primo avvio, ignorato
  }
  try {
    await execFileAsync(config.wgQuickPath, ["up", confPath()]);
  } catch (err) {
    if (isCommandNotFound(err)) isCommandsAvailableCache = false;
    // altrimenti: errore reale (kernel senza supporto WireGuard, permessi
    // insufficienti...) — non fatale, vedi commento sopra.
  }
}

let isCommandsAvailableCache: boolean | null = null;

async function checkCommandsAvailable(): Promise<boolean> {
  if (isCommandsAvailableCache !== null) return isCommandsAvailableCache;
  try {
    await execFileAsync(config.wgPath, ["--version"]);
    isCommandsAvailableCache = true;
  } catch (err) {
    isCommandsAvailableCache = isCommandNotFound(err) ? false : true;
  }
  return isCommandsAvailableCache;
}

// --- Stato live (§31: mai fatale se non disponibile) ------------------------

interface WgDumpPeer {
  publicKey: string;
  latestHandshakeUnix: number;
}

async function readLiveHandshakes(): Promise<Map<string, WgDumpPeer>> {
  const result = new Map<string, WgDumpPeer>();
  try {
    const { stdout } = await execFileAsync(config.wgPath, ["show", config.vpnInterface, "dump"]);
    const lines = stdout.trim().split("\n").slice(1); // prima riga: dati dell'interfaccia stessa
    for (const line of lines) {
      if (!line.trim()) continue;
      const [publicKey, , , , latestHandshake] = line.split("\t");
      result.set(publicKey, { publicKey, latestHandshakeUnix: Number(latestHandshake) || 0 });
    }
  } catch {
    // interfaccia non attiva o wg assente: nessuno stato live, i peer restano visibili da DB
  }
  return result;
}

export interface VpnStatus {
  configured: boolean;
  commandsAvailable: boolean;
  interfaceUp: boolean;
  serverPublicKey: string | null;
  endpointHost: string | null;
  listenPort: number;
  subnetCidr: string;
}

export async function getVpnStatus(): Promise<VpnStatus> {
  if (!isVpnConfigured()) {
    return {
      configured: false,
      commandsAvailable: false,
      interfaceUp: false,
      serverPublicKey: null,
      endpointHost: null,
      listenPort: config.vpnListenPort,
      subnetCidr: config.vpnSubnetCidr,
    };
  }

  const commandsAvailable = await checkCommandsAvailable();
  let interfaceUp = false;
  let serverPublicKey: string | null = null;

  if (commandsAvailable) {
    try {
      ({ publicKey: serverPublicKey } = await ensureServerKeypair());
      await execFileAsync(config.wgPath, ["show", config.vpnInterface]);
      interfaceUp = true;
    } catch {
      interfaceUp = false;
    }
  }

  const endpointHost =
    config.vpnEndpointHost ??
    (isDdnsConfigured() ? `${config.ddnsDomain}.duckdns.org` : null) ??
    fallbackEndpointHost();

  return {
    configured: true,
    commandsAvailable,
    interfaceUp,
    serverPublicKey,
    endpointHost,
    listenPort: config.vpnListenPort,
    subnetCidr: config.vpnSubnetCidr,
  };
}

/** Se non c'è un dominio pubblico configurato, mostra almeno l'IP locale come riferimento (utile per test in LAN). */
function fallbackEndpointHost(): string | null {
  return getLocalNetworkInfo().ips[0] ?? null;
}

// --- Peer (§2: chiave privata sempre e solo lato client) ---------------------

function allowedIpsForProfile(profile: VpnProfile): string {
  if (profile === "full") return "0.0.0.0/0";
  const hubIp = getLocalNetworkInfo().ips[0];
  return hubIp ? `${hubIp}/32` : `${serverAddress()}/32`;
}

function toPeerDto(row: VpnPeerRow, live: Map<string, WgDumpPeer>): VpnPeerDto {
  const liveEntry = live.get(row.public_key);
  const lastHandshakeAt =
    liveEntry && liveEntry.latestHandshakeUnix > 0 ? new Date(liveEntry.latestHandshakeUnix * 1000).toISOString() : null;
  // "Connesso" = handshake negli ultimi 3 minuti (WireGuard rinegozia ogni
  // ~2 minuti quando il tunnel è attivo, stesso criterio usato dai client ufficiali).
  const connected = liveEntry ? Date.now() - liveEntry.latestHandshakeUnix * 1000 < 3 * 60 * 1000 : false;

  return {
    id: row.id,
    label: row.label,
    profile: row.profile,
    publicKey: row.public_key,
    address: row.address,
    allowedIps: allowedIpsForProfile(row.profile),
    createdAt: row.created_at,
    connected,
    lastHandshakeAt,
  };
}

export async function listPeersForUser(userId: string): Promise<VpnPeerDto[]> {
  const rows = getDb()
    .prepare("SELECT * FROM vpn_peers WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as unknown as VpnPeerRow[];
  const live = await readLiveHandshakes();
  return rows.map((r) => toPeerDto(r, live));
}

export interface VpnPeerWithUserDto extends VpnPeerDto {
  username: string;
  displayName: string;
}

export async function listAllPeers(): Promise<VpnPeerWithUserDto[]> {
  const rows = getDb()
    .prepare(
      `SELECT vp.*, u.username, u.display_name FROM vpn_peers vp
       JOIN users u ON u.id = vp.user_id
       ORDER BY vp.created_at DESC`,
    )
    .all() as unknown as (VpnPeerRow & { username: string; display_name: string })[];
  const live = await readLiveHandshakes();
  return rows.map((r) => ({ ...toPeerDto(r, live), username: r.username, displayName: r.display_name }));
}

export async function createPeer(
  userId: string,
  profile: VpnProfile,
  label: string,
  publicKey: string,
): Promise<VpnPeerDto> {
  if (!isVpnConfigured()) throw new VpnError("VPN non configurato (HUB_VPN_ENABLED)", "not_configured");
  if (!SERVER_PUBLIC_KEY_REGEX.test(publicKey)) {
    throw new VpnError("Chiave pubblica non valida: deve essere una chiave WireGuard base64", "invalid_key");
  }

  const address = allocateAddress();
  const id = randomUUID();
  try {
    getDb()
      .prepare(
        `INSERT INTO vpn_peers (id, user_id, label, profile, public_key, address) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, userId, label, profile, publicKey, address);
  } catch (err) {
    if ((err as Error).message.includes("UNIQUE")) {
      throw new VpnError("Questa chiave pubblica è già registrata", "duplicate_key");
    }
    throw err;
  }

  await applyConfig();

  const row = getDb().prepare("SELECT * FROM vpn_peers WHERE id = ?").get(id) as unknown as VpnPeerRow;
  return toPeerDto(row, await readLiveHandshakes());
}

export async function deletePeer(id: string): Promise<void> {
  getDb().prepare("DELETE FROM vpn_peers WHERE id = ?").run(id);
  if (isVpnConfigured()) await applyConfig();
}

export function getPeerOwner(id: string): string | null {
  const row = getDb().prepare("SELECT user_id FROM vpn_peers WHERE id = ?").get(id) as unknown as
    | { user_id: string }
    | undefined;
  return row?.user_id ?? null;
}

/** Da chiamare all'avvio dell'Hub API: scrive/applica la configurazione con i peer già noti. */
export function bootstrapVpn(): void {
  if (!isVpnConfigured()) return;
  applyConfig().catch(() => {
    // non fatale (§31): vedi commento su applyConfig — atteso in ambienti
    // senza supporto kernel WireGuard, da riprovare sul deploy reale.
  });
}
