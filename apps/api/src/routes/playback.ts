import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getItemsByIds, JellyfinError, type MediaSummary } from "../lib/jellyfin.js";
import { listInProgress, saveProgress } from "../lib/playback.js";
import { requireAuth } from "../plugins/auth.js";

const progressBodySchema = z.object({
  itemType: z.enum(["movie", "episode"]),
  positionTicks: z.number().int().nonnegative(),
  durationTicks: z.number().int().positive().nullable().optional(),
});

export async function playbackRoutes(app: FastifyInstance) {
  app.post("/api/playback/:itemId/progress", { preHandler: requireAuth }, async (req, reply) => {
    const { itemId } = req.params as { itemId: string };
    const body = progressBodySchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
    }

    saveProgress(
      req.auth!.user.id,
      itemId,
      body.data.itemType,
      body.data.positionTicks,
      body.data.durationTicks ?? null,
    );
    return { ok: true };
  });

  // §17: widget "Continua a guardare" in Home.
  app.get("/api/continue-watching", { preHandler: requireAuth }, async (req) => {
    const rows = listInProgress(req.auth!.user.id);
    if (rows.length === 0) return { items: [] };

    let metadata = new Map<string, MediaSummary>();
    let metadataAvailable = true;
    try {
      metadata = await getItemsByIds(rows.map((r) => r.item_id));
    } catch (err) {
      if (!(err instanceof JellyfinError)) throw err;
      metadataAvailable = false;
    }

    return {
      items: rows.map((row) => {
        const meta = metadata.get(row.item_id);
        return {
          itemId: row.item_id,
          itemType: row.item_type,
          positionTicks: row.position_ticks,
          durationTicks: row.duration_ticks,
          title: meta?.title ?? null,
          metadataAvailable,
        };
      }),
    };
  });
}
