import type { FastifyInstance } from "fastify";
import { getEpisode, getSeries, listEpisodes, listSeasons, listSeries } from "../lib/jellyfin.js";
import { getProgress } from "../lib/playback.js";
import { handleServiceError } from "../lib/serviceError.js";
import { requireAuth } from "../plugins/auth.js";

export async function seriesRoutes(app: FastifyInstance) {
  app.get("/api/series", { preHandler: requireAuth }, async (_req, reply) => {
    try {
      return { series: await listSeries() };
    } catch (err) {
      if (handleServiceError(err, "jellyfin", reply)) return;
      throw err;
    }
  });

  app.get("/api/series/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const series = await getSeries(id);
      if (!series) return reply.code(404).send({ error: "not_found" });
      const seasons = await listSeasons(id);
      return { series, seasons };
    } catch (err) {
      if (handleServiceError(err, "jellyfin", reply)) return;
      throw err;
    }
  });

  app.get("/api/series/:id/seasons/:seasonId/episodes", { preHandler: requireAuth }, async (req, reply) => {
    const { id, seasonId } = req.params as { id: string; seasonId: string };
    try {
      return { episodes: await listEpisodes(id, seasonId) };
    } catch (err) {
      if (handleServiceError(err, "jellyfin", reply)) return;
      throw err;
    }
  });

  app.get("/api/series/episodes/:episodeId", { preHandler: requireAuth }, async (req, reply) => {
    const { episodeId } = req.params as { episodeId: string };
    try {
      const episode = await getEpisode(episodeId);
      if (!episode) return reply.code(404).send({ error: "not_found" });

      const progress = getProgress(req.auth!.user.id, episodeId);
      return {
        episode,
        resume: progress
          ? { positionTicks: progress.position_ticks, durationTicks: progress.duration_ticks }
          : null,
      };
    } catch (err) {
      if (handleServiceError(err, "jellyfin", reply)) return;
      throw err;
    }
  });
}
