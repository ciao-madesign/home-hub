import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import type { WebSocket } from "ws";
import { config } from "../../config.js";
import { saveProgress, type ItemType } from "../playback.js";
import { revokeSession } from "../sessions.js";
import { MpvIpcClient } from "./mpvIpc.js";

export class TvPlayerError extends Error {}

const PROGRESS_SAVE_INTERVAL_MS = 10000; // stesso ordine di grandezza del report dal browser (VideoPlayer.tsx)

const TIME_POS_OBSERVER_ID = 1;
const PAUSE_OBSERVER_ID = 2;
const DURATION_OBSERVER_ID = 3;
const TRACK_LIST_OBSERVER_ID = 4;

export interface TvTrackInfo {
  id: number;
  label: string;
}

export interface TvSessionStatus {
  itemId: string;
  itemType: ItemType;
  title: string;
  status: "playing" | "paused" | "stopped";
  positionSeconds: number;
  durationSeconds: number | null;
  volume: number;
  audioTrack: number | null;
  subtitleTrack: number | null;
  audioTracks: TvTrackInfo[];
  subtitleTracks: TvTrackInfo[];
  startedByUserId: string;
  startedAt: string;
}

interface MpvTrackListEntry {
  id: number;
  type: string; // "audio" | "sub" | "video"
  title?: string;
  lang?: string;
  selected?: boolean;
}

/**
 * mpv seleziona le tracce native del contenitore (direct play, §"A
 * differenza del browser..." sotto) — non serve passare da Jellyfin come
 * per VideoPlayer.tsx. La UI ha bisogno di etichette vere (non solo
 * indici), quindi si osserva l'intera `track-list` invece di limitarsi a
 * `aid`/`sid`: mpv la ri-emette ad ogni cambio, "selected" indica quella
 * corrente — unica fonte di verità, niente stato duplicato lato Hub.
 */
function applyTrackList(status: TvSessionStatus, entries: MpvTrackListEntry[]): void {
  const label = (t: MpvTrackListEntry) => t.title ?? t.lang ?? `Traccia ${t.id}`;
  status.audioTracks = entries.filter((t) => t.type === "audio").map((t) => ({ id: t.id, label: label(t) }));
  status.subtitleTracks = entries.filter((t) => t.type === "sub").map((t) => ({ id: t.id, label: label(t) }));
  status.audioTrack = entries.find((t) => t.type === "audio" && t.selected)?.id ?? null;
  status.subtitleTrack = entries.find((t) => t.type === "sub" && t.selected)?.id ?? null;
}

interface Session {
  process: ChildProcess;
  ipc: MpvIpcClient;
  status: TvSessionStatus;
  subscribers: Set<WebSocket>;
  progressInterval: ReturnType<typeof setInterval>;
  /** Sessione Hub dedicata (mai il token personale del browser che ha avviato la
   *  riproduzione, vedi start()) — revocata qui alla fine, qualunque sia la causa. */
  internalSessionId: string;
}

/**
 * Un solo slot di riproduzione (una TV, il Wyse collegato via HDMI — §
 * "Riproduzione su TV non Smart" in docs/SPECIFICHE.md): avviarne una
 * nuova sostituisce quella corrente, stesso principio già seguito per la
 * Condivisione schermo (un host = una sessione).
 *
 * Stato solo in memoria, mai nel DB: il processo mpv non sopravvive a un
 * riavvio dell'Hub API comunque (stesso principio di
 * screenshare/session.ts e degli `activeHandles` di Download/Gaming).
 */
let current: Session | null = null;

/**
 * `start()`/`stop()` toccano `current` attraverso più `await` (avvio
 * processo, connessione IPC): a differenza dei precedenti nel progetto
 * (screenshare/gaming/downloads, che reclamano il proprio slot in un solo
 * tick sincrono), qui due chiamate concorrenti potrebbero altrimenti
 * intrecciarsi e litigarsi lo stesso socket IPC (path fisso, una sola
 * TV). Questa coda serializza ogni operazione sul slot.
 */
let operationQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function socketPath(): string {
  return config.tvMpvSocketPath;
}

function extraMpvArgs(): string[] {
  if (!config.tvMpvArgsJson) return ["--fullscreen"];
  try {
    const parsed = JSON.parse(config.tvMpvArgsJson);
    if (Array.isArray(parsed) && parsed.every((a) => typeof a === "string")) return parsed;
  } catch {
    /* args invalidi, ignorati */
  }
  return ["--fullscreen"];
}

function broadcast(status: TvSessionStatus, subscribers: Set<WebSocket>): void {
  const payload = JSON.stringify({ type: "status", ...status });
  for (const socket of subscribers) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

function persistProgress(status: TvSessionStatus): void {
  const { itemId, itemType, positionSeconds, durationSeconds, startedByUserId } = status;
  if (positionSeconds <= 0) return;
  saveProgress(
    startedByUserId,
    itemId,
    itemType,
    Math.round(positionSeconds * 10_000_000), // TICKS_PER_SECOND, coerente con client.ts
    durationSeconds ? Math.round(durationSeconds * 10_000_000) : null,
  );
}

/** Cleanup comune a ogni via d'uscita di una sessione (stop esplicito, mpv
 *  che crolla, connessione IPC mai riuscita) — un solo posto che libera
 *  davvero tutto, invece di doverlo ricordare in ogni call site. */
function cleanup(session: Session): void {
  clearInterval(session.progressInterval);
  persistProgress(session.status);
  revokeSession(session.internalSessionId);
  session.ipc.close();
}

export function getStatus(): TvSessionStatus | null {
  return current?.status ?? null;
}

export function subscribe(socket: WebSocket): void {
  if (!current) {
    socket.close();
    return;
  }
  current.subscribers.add(socket);
  socket.send(JSON.stringify({ type: "status", ...current.status }));
  socket.on("close", () => current?.subscribers.delete(socket));
}

export interface StartOptions {
  itemId: string;
  itemType: ItemType;
  title: string;
  streamUrl: string;
  resumeSeconds: number;
  durationSeconds: number | null;
  startedByUserId: string;
  /** Id della sessione Hub dedicata creata dalla route per autenticare la
   *  richiesta di mpv verso /api/media (mai il token personale dell'utente
   *  che ha avviato la riproduzione, vedi routes/tvPlayer.ts). */
  internalSessionId: string;
}

/**
 * Avvia mpv sull'URL di streaming — lo stesso endpoint `/api/media/:id/
 * stream` già usato dal player nel browser (§2: mai reinventare
 * l'integrazione Jellyfin), raggiunto in loopback dato che mpv gira sullo
 * stesso host dell'Hub API. A differenza del browser, mpv seleziona le
 * tracce audio/sottotitoli nativamente da direct play — non serve chiedere
 * a Jellyfin di remuxare via AudioStreamIndex come per VideoPlayer.tsx.
 */
export function start(options: StartOptions): Promise<TvSessionStatus> {
  return enqueue(() => doStart(options));
}

async function doStart(options: StartOptions): Promise<TvSessionStatus> {
  if (current) await doStop();

  const dir = path.dirname(socketPath());
  mkdirSync(dir, { recursive: true });
  if (existsSync(socketPath())) unlinkSync(socketPath());

  const args = [
    ...extraMpvArgs(),
    `--input-ipc-server=${socketPath()}`,
    "--idle=yes",
    "--no-terminal",
    "--really-quiet",
    ...(options.resumeSeconds > 0 ? [`--start=${Math.floor(options.resumeSeconds)}`] : []),
    options.streamUrl,
  ];

  const proc = spawn(config.mpvPath, args, { stdio: "ignore" });

  const status: TvSessionStatus = {
    itemId: options.itemId,
    itemType: options.itemType,
    title: options.title,
    status: "playing",
    positionSeconds: options.resumeSeconds,
    durationSeconds: options.durationSeconds,
    volume: 100,
    audioTrack: null,
    subtitleTrack: null,
    audioTracks: [],
    subtitleTracks: [],
    startedByUserId: options.startedByUserId,
    startedAt: new Date().toISOString(),
  };

  const ipc = new MpvIpcClient();

  const session: Session = {
    process: proc,
    ipc,
    status,
    subscribers: new Set<WebSocket>(),
    internalSessionId: options.internalSessionId,
    progressInterval: setInterval(() => persistProgress(session.status), PROGRESS_SAVE_INTERVAL_MS),
  };
  current = session;

  // Stesso handler per "exit" ed "error": mpv che non parte affatto (comando
  // assente) o che crolla a riproduzione avviata devono liberare le stesse
  // risorse (in precedenza "error" non lo faceva, lasciando l'intervallo di
  // progresso a girare per sempre su una sessione morta).
  const handleTermination = () => {
    if (current !== session) return; // già sostituita/fermata altrove
    cleanup(session);
    session.status.status = "stopped";
    broadcast(session.status, session.subscribers);
    for (const socket of session.subscribers) socket.close();
    current = null;
  };
  proc.on("exit", handleTermination);
  proc.on("error", handleTermination);

  try {
    await ipc.connect(socketPath());
  } catch (err) {
    // current === session ancora qui: cleanup() esplicito invece di
    // aspettare l'evento "exit" del kill, che arriverebbe più tardi e
    // lascerebbe nel frattempo l'intervallo di progresso attivo.
    cleanup(session);
    current = null;
    proc.kill("SIGTERM");
    throw new TvPlayerError(`Impossibile connettersi a mpv: ${(err as Error).message}`);
  }

  ipc.on("property-change", (msg: { id: number; name: string; data: unknown }) => {
    if (current !== session) return;
    if (msg.id === TIME_POS_OBSERVER_ID && typeof msg.data === "number") {
      session.status.positionSeconds = msg.data;
    } else if (msg.id === PAUSE_OBSERVER_ID && typeof msg.data === "boolean") {
      session.status.status = msg.data ? "paused" : "playing";
    } else if (msg.id === DURATION_OBSERVER_ID && typeof msg.data === "number") {
      session.status.durationSeconds = msg.data;
    } else if (msg.id === TRACK_LIST_OBSERVER_ID && Array.isArray(msg.data)) {
      applyTrackList(session.status, msg.data as MpvTrackListEntry[]);
    }
    broadcast(session.status, session.subscribers);
  });

  await Promise.all([
    ipc.observeProperty(TIME_POS_OBSERVER_ID, "time-pos"),
    ipc.observeProperty(PAUSE_OBSERVER_ID, "pause"),
    ipc.observeProperty(DURATION_OBSERVER_ID, "duration"),
    ipc.observeProperty(TRACK_LIST_OBSERVER_ID, "track-list"),
  ]);

  return status;
}

function requireCurrent(): Session {
  if (!current) throw new TvPlayerError("Nessuna riproduzione attiva sulla TV");
  return current;
}

export async function pause(): Promise<void> {
  await requireCurrent().ipc.setProperty("pause", true);
}

export async function resume(): Promise<void> {
  await requireCurrent().ipc.setProperty("pause", false);
}

export async function seek(seconds: number): Promise<void> {
  await requireCurrent().ipc.command(["seek", seconds, "absolute"]);
}

export async function setVolume(volume: number): Promise<void> {
  const session = requireCurrent();
  const clamped = Math.max(0, Math.min(100, volume));
  await session.ipc.setProperty("volume", clamped);
  session.status.volume = clamped;
  broadcast(session.status, session.subscribers);
}

// audioTrack/subtitleTrack si aggiornano da soli: mpv ri-emette l'intera
// track-list (osservata in start()) non appena la selezione cambia,
// applyTrackList() sincronizza lo stato — nessuna assegnazione manuale qui.
export async function setAudioTrack(track: number): Promise<void> {
  await requireCurrent().ipc.setProperty("aid", track);
}

/** `track = null` disattiva i sottotitoli ("sid" a "no" in mpv). */
export async function setSubtitleTrack(track: number | null): Promise<void> {
  await requireCurrent().ipc.setProperty("sid", track ?? "no");
}

export function stop(): Promise<void> {
  return enqueue(doStop);
}

async function doStop(): Promise<void> {
  if (!current) return;
  const session = current;
  current = null; // impedisce a handleTermination di rifare cleanup/broadcast
  cleanup(session);
  for (const socket of session.subscribers) socket.close();
  session.process.kill("SIGTERM");
}
