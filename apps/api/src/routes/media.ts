import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { jellyfinProxyFetch, JellyfinError } from "../lib/jellyfin.js";
import { requireAuth } from "../plugins/auth.js";

const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "cache-control",
];

/**
 * Proxy binario verso Jellyfin per stream video e immagini: il frontend non
 * deve mai conoscere l'URL o la presenza di Jellyfin (§2). Il Range header
 * viene inoltrato per permettere il seek nel player video.
 */
export async function mediaRoutes(app: FastifyInstance) {
  app.get("/api/media/:itemId/stream", { preHandler: requireAuth }, async (req, reply) => {
    const { itemId } = req.params as { itemId: string };
    const { mediaSourceId, audioStreamIndex } = req.query as {
      mediaSourceId?: string;
      audioStreamIndex?: string;
    };

    // Direct Play (`static=true`, invariato): il contenitore originale viene
    // servito byte per byte, con tutte le tracce audio già multiplexate —
    // nessuna elaborazione lato Jellyfin. Selezionare una traccia diversa
    // da quella di default richiede invece che Jellyfin remuxi/trasmetta
    // solo quella traccia (§7: il browser non può farlo da solo, vedi
    // lib/jellyfin.ts) — va quindi omesso `static` e passato
    // `AudioStreamIndex`, così Jellyfin decide come servirlo.
    const params = audioStreamIndex
      ? { AudioStreamIndex: audioStreamIndex, ...(mediaSourceId ? { mediaSourceId } : {}) }
      : { static: "true", ...(mediaSourceId ? { mediaSourceId } : {}) };

    try {
      const upstream = await jellyfinProxyFetch(
        `/Videos/${encodeURIComponent(itemId)}/stream`,
        params,
        req.headers.range ? { range: req.headers.range } : undefined,
      );

      reply.code(upstream.status);
      for (const header of FORWARDED_RESPONSE_HEADERS) {
        const value = upstream.headers.get(header);
        if (value) reply.header(header, value);
      }
      if (!upstream.body) return reply.send();
      return reply.send(Readable.fromWeb(upstream.body as never));
    } catch (err) {
      if (err instanceof JellyfinError) {
        return reply.code(503).send({ error: "service_unavailable", service: "jellyfin" });
      }
      throw err;
    }
  });

  app.get("/api/media/:itemId/image", { preHandler: requireAuth }, async (req, reply) => {
    const { itemId } = req.params as { itemId: string };

    try {
      const upstream = await jellyfinProxyFetch(`/Items/${encodeURIComponent(itemId)}/Images/Primary`);
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
      if (err instanceof JellyfinError) {
        return reply.code(503).send({ error: "service_unavailable", service: "jellyfin" });
      }
      throw err;
    }
  });
}
