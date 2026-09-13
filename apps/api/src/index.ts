import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { config } from "./config.js";
import { getDb } from "./db/index.js";
import { attachAuth } from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.js";
import { systemRoutes } from "./routes/system.js";
import { profilesRoutes } from "./routes/profiles.js";
import { authRoutes } from "./routes/auth.js";
import { moviesRoutes } from "./routes/movies.js";
import { seriesRoutes } from "./routes/series.js";
import { mediaRoutes } from "./routes/media.js";
import { playbackRoutes } from "./routes/playback.js";
import { photosRoutes } from "./routes/photos.js";
import { filesRoutes } from "./routes/files.js";
import { downloadsRoutes } from "./routes/downloads.js";

async function main() {
  // Inizializza il DB e applica le migrazioni prima di accettare richieste.
  getDb();

  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: config.corsOrigins,
  });
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10 GB, coerente con file multimediali di grandi dimensioni
  });

  app.addHook("onRequest", attachAuth);

  await app.register(healthRoutes);
  await app.register(systemRoutes);
  await app.register(profilesRoutes);
  await app.register(authRoutes);
  await app.register(moviesRoutes);
  await app.register(seriesRoutes);
  await app.register(mediaRoutes);
  await app.register(playbackRoutes);
  await app.register(photosRoutes);
  await app.register(filesRoutes);
  await app.register(downloadsRoutes);

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => {
  console.error("Avvio Hub API fallito:", err);
  process.exit(1);
});
