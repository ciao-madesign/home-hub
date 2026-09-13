import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { getDb } from "./db/index.js";
import { attachAuth } from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.js";
import { systemRoutes } from "./routes/system.js";
import { profilesRoutes } from "./routes/profiles.js";
import { authRoutes } from "./routes/auth.js";

async function main() {
  // Inizializza il DB e applica le migrazioni prima di accettare richieste.
  getDb();

  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: config.corsOrigins,
  });

  app.addHook("onRequest", attachAuth);

  await app.register(healthRoutes);
  await app.register(systemRoutes);
  await app.register(profilesRoutes);
  await app.register(authRoutes);

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => {
  console.error("Avvio Hub API fallito:", err);
  process.exit(1);
});
