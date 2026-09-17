import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { z } from "zod";
import { config } from "../config.js";
import { getEpisode, getMovie } from "../lib/jellyfin.js";
import { getProgress } from "../lib/playback.js";
import { createSession, revokeSession, upsertDevice } from "../lib/sessions.js";
import * as tvPlayer from "../lib/tvPlayer/session.js";
import { TvPlayerError } from "../lib/tvPlayer/session.js";
import { handleServiceError } from "../lib/serviceError.js";
import { requireAuth } from "../plugins/auth.js";

const TICKS_PER_SECOND = 10_000_000;

const playBodySchema = z.object({
  itemId: z.string().min(1),
  itemType: z.enum(["movie", "episode"]),
});

const controlBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("stop") }),
  z.object({ action: z.literal("seek"), seconds: z.number().nonnegative() }),
  z.object({ action: z.literal("volume"), volume: z.number().min(0).max(100) }),
  z.object({ action: z.literal("audio-track"), track: z.number().int() }),
  z.object({ action: z.literal("subtitle-track"), track: z.number().int().nullable() }),
]);

/**
 * Riproduzione su TV non Smart (fuori roadmap, richiesta esplicita
 * dell'utente — vedi docs/SPECIFICHE.md): il Wyse riproduce davvero
 * (mpv, lib/tvPlayer/), gli altri dispositivi fanno solo da telecomando.
 * `/play` avvia mpv sullo stesso endpoint `/api/media/:id/stream` già
 * usato da VideoPlayer.tsx (mai reinventare l'integrazione Jellyfin),
 * raggiunto in loopback. mpv riceve una sessione Hub dedicata appena
 * creata, MAI il token personale dell'utente che ha avviato la
 * riproduzione: quel token finirebbe in chiaro nell'argv del processo
 * mpv (leggibile da chiunque sulla macchina con `ps`/`/proc/<pid>/
 * cmdline` per tutta la durata della riproduzione, anche ore) e la sua
 * scadenza seguirebbe la sessione del browser di chi ha premuto play,
 * non la riproduzione stessa — un logout o un token scaduto a metà
 * film interromperebbe la TV per tutti. La sessione dedicata ha invece
 * lifecycle proprio: revocata da `lib/tvPlayer/session.ts` non appena
 * la riproduzione finisce, qualunque sia la causa.
 */
export async function tvPlayerRoutes(app: FastifyInstance) {
  app.post("/api/tv/play", { preHandler: requireAuth }, async (req, reply) => {
    const body = playBodySchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
    }
    const { itemId, itemType } = body.data;
    const userId = req.auth!.user.id;

    let internal: ReturnType<typeof createSession> | null = null;
    try {
      const item = itemType === "movie" ? await getMovie(itemId) : await getEpisode(itemId);
      if (!item) return reply.code(404).send({ error: "not_found" });

      const progress = getProgress(userId, itemId);
      const resumeSeconds =
        progress && !progress.completed ? progress.position_ticks / TICKS_PER_SECOND : 0;

      const deviceId = upsertDevice("Riproduzione TV", "tv", userId);
      internal = createSession(userId, "local", deviceId);

      const streamParams = new URLSearchParams({ token: internal.token });
      if (item.mediaSourceId) streamParams.set("mediaSourceId", item.mediaSourceId);
      const streamUrl = `http://127.0.0.1:${config.port}/api/media/${encodeURIComponent(itemId)}/stream?${streamParams}`;

      const status = await tvPlayer.start({
        itemId,
        itemType,
        title: item.title,
        streamUrl,
        resumeSeconds,
        durationSeconds: item.runtimeTicks ? item.runtimeTicks / TICKS_PER_SECOND : null,
        startedByUserId: userId,
        internalSessionId: internal.session.id,
      });
      return { session: status };
    } catch (err) {
      if (internal) revokeSession(internal.session.id); // start() fallito: non lasciare una sessione orfana
      if (handleServiceError(err, "jellyfin", reply)) return;
      if (err instanceof TvPlayerError) {
        return reply.code(503).send({ error: "service_unavailable", service: "mpv", message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/tv/control", { preHandler: requireAuth }, async (req, reply) => {
    const body = controlBodySchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
    }

    try {
      switch (body.data.action) {
        case "pause":
          await tvPlayer.pause();
          break;
        case "resume":
          await tvPlayer.resume();
          break;
        case "stop":
          await tvPlayer.stop();
          break;
        case "seek":
          await tvPlayer.seek(body.data.seconds);
          break;
        case "volume":
          await tvPlayer.setVolume(body.data.volume);
          break;
        case "audio-track":
          await tvPlayer.setAudioTrack(body.data.track);
          break;
        case "subtitle-track":
          await tvPlayer.setSubtitleTrack(body.data.track);
          break;
      }
      return { session: tvPlayer.getStatus() };
    } catch (err) {
      if (err instanceof TvPlayerError) return reply.code(409).send({ error: "no_active_session", message: err.message });
      throw err;
    }
  });

  app.get("/api/tv/status", { preHandler: requireAuth }, async () => {
    return { session: tvPlayer.getStatus() };
  });

  // WebSocket per lo stato in tempo reale (posizione/pausa) verso i
  // dispositivi di controllo — stesso protocollo di auth via ?token= già
  // usato da /api/screenshare/ws (il WebSocket nativo del browser non può
  // impostare header).
  app.get("/api/tv/ws", { preHandler: requireAuth, websocket: true }, (socket: WebSocket) => {
    tvPlayer.subscribe(socket);
  });
}
