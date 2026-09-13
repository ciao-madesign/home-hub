import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAlbum, immichProxyFetch, ImmichError, listAlbums, searchTimeline } from "../lib/immich.js";
import { handleServiceError } from "../lib/serviceError.js";
import { requireAuth } from "../plugins/auth.js";

const timelineQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  type: z.enum(["all", "image", "video"]).default("all"),
});

const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "cache-control",
];

/**
 * Integrazione Immich (§8): come per Jellyfin, il frontend non conosce
 * Immich — parla solo con questi endpoint dell'Hub API.
 */
export async function photosRoutes(app: FastifyInstance) {
  app.get("/api/photos/timeline", { preHandler: requireAuth }, async (req, reply) => {
    const query = timelineQuerySchema.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
    }
    try {
      return await searchTimeline(query.data.page, query.data.type);
    } catch (err) {
      if (handleServiceError(err, "immich", reply)) return;
      throw err;
    }
  });

  app.get("/api/photos/albums", { preHandler: requireAuth }, async (_req, reply) => {
    try {
      return { albums: await listAlbums() };
    } catch (err) {
      if (handleServiceError(err, "immich", reply)) return;
      throw err;
    }
  });

  app.get("/api/photos/albums/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const album = await getAlbum(id);
      if (!album) return reply.code(404).send({ error: "not_found" });
      return { album };
    } catch (err) {
      if (handleServiceError(err, "immich", reply)) return;
      throw err;
    }
  });

  app.get("/api/photos/assets/:id/thumbnail", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const upstream = await immichProxyFetch(
        `/api/assets/${encodeURIComponent(id)}/thumbnail?size=preview`,
      );
      if (!upstream.ok) return reply.code(upstream.status === 404 ? 404 : 502).send();

      reply.code(200);
      for (const header of FORWARDED_RESPONSE_HEADERS) {
        const value = upstream.headers.get(header);
        if (value) reply.header(header, value);
      }
      reply.header("cache-control", "public, max-age=86400");
      if (!upstream.body) return reply.send();
      return reply.send(Readable.fromWeb(upstream.body as never));
    } catch (err) {
      if (err instanceof ImmichError) {
        return reply.code(503).send({ error: "service_unavailable", service: "immich" });
      }
      throw err;
    }
  });

  app.get("/api/photos/assets/:id/original", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const upstream = await immichProxyFetch(
        `/api/assets/${encodeURIComponent(id)}/original`,
        req.headers.range ? { range: req.headers.range } : undefined,
      );
      if (!upstream.ok) return reply.code(upstream.status === 404 ? 404 : 502).send();

      reply.code(upstream.status);
      for (const header of FORWARDED_RESPONSE_HEADERS) {
        const value = upstream.headers.get(header);
        if (value) reply.header(header, value);
      }
      if (!upstream.body) return reply.send();
      return reply.send(Readable.fromWeb(upstream.body as never));
    } catch (err) {
      if (err instanceof ImmichError) {
        return reply.code(503).send({ error: "service_unavailable", service: "immich" });
      }
      throw err;
    }
  });
}
