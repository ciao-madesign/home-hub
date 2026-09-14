import type { FastifyInstance } from "fastify";
import { getSetting, HUB_NAME_KEY } from "../lib/setup.js";
import { requireAuth } from "../plugins/auth.js";

const DEFAULT_HUB_NAME = "Home Hub";

/** Impostazioni generali post-setup (§28, step 5 del wizard). */
export async function settingsRoutes(app: FastifyInstance) {
  app.get("/api/settings/hub-name", { preHandler: requireAuth }, async () => {
    return { hubName: getSetting(HUB_NAME_KEY) ?? DEFAULT_HUB_NAME };
  });
}
