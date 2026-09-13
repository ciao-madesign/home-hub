import type { FastifyInstance } from "fastify";
import { getSystemStatus } from "../lib/system.js";
import { requireAuth } from "../plugins/auth.js";

export async function systemRoutes(app: FastifyInstance) {
  app.get("/api/system/status", { preHandler: requireAuth }, async () => {
    return getSystemStatus();
  });
}
