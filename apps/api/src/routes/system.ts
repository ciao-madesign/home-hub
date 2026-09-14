import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSystemStatus } from "../lib/system.js";
import { listSystemEvents, toSystemEventDto } from "../lib/systemEvents.js";
import { PowerError, shutdownHost } from "../lib/power.js";
import { requireAdmin, requireAuth } from "../plugins/auth.js";

export async function systemRoutes(app: FastifyInstance) {
  app.get("/api/system/status", { preHandler: requireAuth }, async () => {
    return getSystemStatus();
  });

  app.get("/api/system/events", { preHandler: requireAuth }, async (req) => {
    const query = z.object({ limit: z.coerce.number().int().positive().max(200).default(50) }).parse(req.query);
    return { events: listSystemEvents(query.limit).map(toSystemEventDto) };
  });

  // Spegnimento sicuro (§34), riservato agli admin.
  app.post("/api/system/shutdown", { preHandler: requireAdmin }, async (req, reply) => {
    const body = z.object({ confirm: z.literal(true) }).safeParse(req.body);
    if (!body.success) {
      return reply
        .code(400)
        .send({ error: "confirmation_required", message: "Richiede { confirm: true } nel corpo della richiesta" });
    }
    try {
      await shutdownHost();
      return { ok: true };
    } catch (err) {
      if (err instanceof PowerError) return reply.code(500).send({ error: "shutdown_failed", message: err.message });
      throw err;
    }
  });
}
