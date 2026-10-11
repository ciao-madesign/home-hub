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
import { toDownloadDto, type DestinationKind } from "../lib/downloads/store.js";
import { requireAuth } from "../plugins/auth.js";
import { assertSafeRelativePath, UnsafePathError } from "../lib/pathSafety.js";

/** Smistamento automatico (§12): "series" richiede un percorso non vuoto (validato per davvero solo quando il job parte, qui si rifiuta solo l'assenza). */
const destinationFields = {
  destinationKind: z.enum(["downloads", "movie", "series"]).default("downloads"),
  destinationPath: z.string().min(1).optional(),
};

const addUrlBodySchema = z.object({
  kind: z.literal("url"),
  source: z.string().url(),
  ...destinationFields,
});

const addTorrentBodySchema = z.object({
  kind: z.literal("torrent"),
  source: z.string().refine((s) => s.startsWith("magnet:"), "Deve essere un magnet URI"),
  ...destinationFields,
});

/** "series" richiede un percorso valido e non vuoto; valida qui (boundary) invece che al lancio del job, per un errore immediato invece che un job finito subito in "error". */
function resolveDestination(
  destinationKind: DestinationKind,
  destinationPath: string | undefined,
): { destinationKind: DestinationKind; destinationPath: string | null } {
  if (destinationKind !== "series") return { destinationKind, destinationPath: null };
  if (!destinationPath) throw new UnsafePathError('destinationPath obbligatorio per destinationKind "series"');
  assertSafeRelativePath(destinationPath);
  return { destinationKind, destinationPath };
}

function handleDownloadsError(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof DownloadsError) {
    reply.code(404).send({ error: "not_found", message: err.message });
    return true;
  }
  if (err instanceof UnsafePathError) {
    reply.code(400).send({ error: "invalid_body", message: err.message });
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
    try {
      const destination = resolveDestination(parsed.data.destinationKind, parsed.data.destinationPath);
      const row = await enqueue(
        req.auth!.user.id,
        parsed.data.kind,
        parsed.data.source,
        destination.destinationKind,
        destination.destinationPath,
      );
      return { download: toDownloadDto(row) };
    } catch (err) {
      if (handleDownloadsError(err, reply)) return;
      throw err;
    }
  });

  app.post("/api/downloads/upload-torrent", { preHandler: requireAuth }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "invalid_body", message: "File .torrent mancante" });

    const destinationKind = ((file.fields.destinationKind as { value?: string } | undefined)?.value ??
      "downloads") as DestinationKind;
    const destinationPathInput = (file.fields.destinationPath as { value?: string } | undefined)?.value;

    let destination: { destinationKind: DestinationKind; destinationPath: string | null };
    try {
      destination = resolveDestination(destinationKind, destinationPathInput);
    } catch (err) {
      if (handleDownloadsError(err, reply)) return;
      throw err;
    }

    const dir = torrentUploadDir();
    await fs.mkdir(dir, { recursive: true });
    const dest = path.join(dir, `${randomUUID()}.torrent`);
    await fs.writeFile(dest, await file.toBuffer());

    const row = await enqueue(
      req.auth!.user.id,
      "torrent",
      dest,
      destination.destinationKind,
      destination.destinationPath,
    );
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
