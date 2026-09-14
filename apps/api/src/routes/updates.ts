import type { FastifyInstance, FastifyReply } from "fastify";
import { applyUpdate, checkForUpdates, UpdateError } from "../lib/updates.js";
import { requireAdmin } from "../plugins/auth.js";

function handleUpdateError(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof UpdateError) {
    const status = err.code === "not_available" ? 503 : 409;
    reply.code(status).send({ error: err.code, message: err.message });
    return true;
  }
  return false;
}

/** Aggiornamenti dell'Hub autorizzati dalla Web App (§33), riservati agli admin. */
export async function updatesRoutes(app: FastifyInstance) {
  app.get("/api/updates/status", { preHandler: requireAdmin }, async () => {
    return checkForUpdates();
  });

  app.post("/api/updates/apply", { preHandler: requireAdmin }, async (req, reply) => {
    try {
      return await applyUpdate();
    } catch (err) {
      if (handleUpdateError(err, reply)) return;
      throw err;
    }
  });
}
