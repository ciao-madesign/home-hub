import type { FastifyInstance } from "fastify";
import { getMovie, listMovies } from "../lib/jellyfin.js";
import { getProgress } from "../lib/playback.js";
import { handleServiceError } from "../lib/serviceError.js";
import { requireAuth } from "../plugins/auth.js";

export async function moviesRoutes(app: FastifyInstance) {
  app.get("/api/movies", { preHandler: requireAuth }, async (req, reply) => {
    try {
      return { movies: await listMovies() };
    } catch (err) {
      if (handleServiceError(err, "jellyfin", reply)) return;
      throw err;
    }
  });

  app.get("/api/movies/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const movie = await getMovie(id);
      if (!movie) return reply.code(404).send({ error: "not_found" });

      const progress = getProgress(req.auth!.user.id, id);
      return {
        movie,
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
