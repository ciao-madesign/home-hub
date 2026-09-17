import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import type { WebSocket } from "ws";
import { config } from "../../config.js";
import { saveProgress, type ItemType } from "../playback.js";
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
 * differenza del browser..." sopra) — non serve passare da Jellyfin come
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
let current:
  | {
      process: ChildProcess;
      ipc: MpvIpcClient;
      status: TvSessionStatus;
      subscribers: Set<WebSocket>;
      progressInterval: ReturnType<typeof setInterval>;
    }
  | null = null;

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
}

/**
 * Avvia mpv sull'URL di streaming — lo stesso endpoint `/api/media/:id/
 * stream` già usato dal player nel browser (§2: mai reinventare
 * l'integrazione Jellyfin), raggiunto in loopback dato che mpv gira sullo
 * stesso host dell'Hub API. A differenza del browser, mpv seleziona le
 * tracce audio/sottotitoli nativamente da direct play — non serve chiedere
 * a Jellyfin di remuxare via AudioStreamIndex come per VideoPlayer.tsx.
 */
export async function start(options: StartOptions): Promise<TvSessionStatus> {
  await stop();

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
  const subscribers = new Set<WebSocket>();

  const session = {
    process: proc,
    ipc,
    status,
    subscribers,
    progressInterval: setInterval(() => persistProgress(session.status), PROGRESS_SAVE_INTERVAL_MS),
  };
  current = session;

  proc.on("exit", () => {
    if (current !== session) return; // già sostituita da una nuova sessione
    clearInterval(session.progressInterval);
    persistProgress(session.status);
    session.status.status = "stopped";
    broadcast(session.status, session.subscribers);
    ipc.close();
    current = null;
  });
  proc.on("error", () => {
    if (current === session) current = null;
  });

  try {
    await ipc.connect(socketPath());
  } catch (err) {
    proc.kill("SIGTERM");
    current = null;
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

async function requireCurrent(): Promise<NonNullable<typeof current>> {
  if (!current) throw new TvPlayerError("Nessuna riproduzione attiva sulla TV");
  return current;
}

export async function pause(): Promise<void> {
  const session = await requireCurrent();
  await session.ipc.setProperty("pause", true);
}

export async function resume(): Promise<void> {
  const session = await requireCurrent();
  await session.ipc.setProperty("pause", false);
}

export async function seek(seconds: number): Promise<void> {
  const session = await requireCurrent();
  await session.ipc.command(["seek", seconds, "absolute"]);
}

export async function setVolume(volume: number): Promise<void> {
  const session = await requireCurrent();
  const clamped = Math.max(0, Math.min(100, volume));
  await session.ipc.setProperty("volume", clamped);
  session.status.volume = clamped;
  broadcast(session.status, session.subscribers);
}

// audioTrack/subtitleTrack si aggiornano da soli: mpv ri-emette l'intera
// track-list (osservata in start()) non appena la selezione cambia,
// applyTrackList() sincronizza lo stato — nessuna assegnazione manuale qui.
export async function setAudioTrack(track: number): Promise<void> {
  const session = await requireCurrent();
  await session.ipc.setProperty("aid", track);
}

/** `track = null` disattiva i sottotitoli ("sid" a "no" in mpv). */
export async function setSubtitleTrack(track: number | null): Promise<void> {
  const session = await requireCurrent();
  await session.ipc.setProperty("sid", track ?? "no");
}

export async function stop(): Promise<void> {
  if (!current) return;
  const session = current;
  current = null; // impedisce all'handler "exit" di rifare persistProgress/broadcast
  clearInterval(session.progressInterval);
  persistProgress(session.status);
  for (const socket of session.subscribers) socket.close();
  session.ipc.close();
  session.process.kill("SIGTERM");
}
