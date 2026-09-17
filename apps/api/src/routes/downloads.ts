import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import {
  bootstrapDownloads,
  cancelDownload,
  DownloadsError,
  enqueue,
  listDownloads,
  pauseDownload,
  resumeDownload,
} from "../lib/downloads/manager.js";
import { toDownloadDto } from "../lib/downloads/store.js";
import { requireAuth } from "../plugins/auth.js";

const addUrlBodySchema = z.object({
  kind: z.literal("url"),
  source: z.string().url(),
});

const addTorrentBodySchema = z.object({
  kind: z.literal("torrent"),
  source: z.string().refine((s) => s.startsWith("magnet:"), "Deve essere un magnet URI"),
});

function handleDownloadsError(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof DownloadsError) {
    reply.code(404).send({ error: "not_found", message: err.message });
    return true;
  }
  return false;
}

function torrentUploadDir(): string {
  return path.join(config.dataRoot, "Downloads", ".torrents");
}

/**
 * Download Manager (§12): coda unica per download "normali" (yt-dlp) e
 * torrent (WebTorrent), priorità minima rispetto a streaming/backup (§32),
 * nessuno storico permanente per i completati.
 */
export async function downloadsRoutes(app: FastifyInstance) {
  bootstrapDownloads();

  app.get("/api/downloads", { preHandler: requireAuth }, async () => {
    return { downloads: listDownloads().map(toDownloadDto) };
  });

  app.post("/api/downloads", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = z.discriminatedUnion("kind", [addUrlBodySchema, addTorrentBodySchema]).safeParse(
      req.body,
    );
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const row = await enqueue(req.auth!.user.id, parsed.data.kind, parsed.data.source);
    return { download: toDownloadDto(row) };
  });

  app.post("/api/downloads/upload-torrent", { preHandler: requireAuth }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "invalid_body", message: "File .torrent mancante" });

    const dir = torrentUploadDir();
    await fs.mkdir(dir, { recursive: true });
    const dest = path.join(dir, `${randomUUID()}.torrent`);
    await fs.writeFile(dest, await file.toBuffer());

    const row = await enqueue(req.auth!.user.id, "torrent", dest);
    return { download: toDownloadDto(row) };
  });

  app.post("/api/downloads/:id/pause", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      pauseDownload(id);
      return { ok: true };
    } catch (err) {
      if (handleDownloadsError(err, reply)) return;
      throw err;
    }
  });

  app.post("/api/downloads/:id/resume", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await resumeDownload(id);
      return { ok: true };
    } catch (err) {
      if (handleDownloadsError(err, reply)) return;
      throw err;
    }
  });

  app.delete("/api/downloads/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      cancelDownload(id);
      return { ok: true };
    } catch (err) {
      if (handleDownloadsError(err, reply)) return;
      throw err;
    }
  });
}
