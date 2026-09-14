import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { listDisks } from "../lib/storage/disks.js";
import {
  BackupError,
  getLatestRun,
  hasRecentValidBackup,
  isBackupRunning,
  listBackupRuns,
  restoreFromBackup,
  runBackup,
} from "../lib/storage/backup.js";
import { toBackupRunDto } from "../lib/storage/backupStore.js";
import { config } from "../config.js";
import { requireAdmin, requireAuth } from "../plugins/auth.js";

function handleBackupError(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof BackupError) {
    reply.code(err.code === "already_running" ? 409 : 503).send({ error: err.code, message: err.message });
    return true;
  }
  return false;
}

/**
 * Storage e Backup (§4/§5/§29): visibilità dischi + SMART, backup
 * automatico/manuale con priorità/limite di banda, ripristino da disco di
 * backup. La libreria virtuale multi-disco con distribuzione automatica dei
 * nuovi file (§4) non è implementata — vedi docs/SPECIFICHE.md.
 */
export async function storageRoutes(app: FastifyInstance) {
  app.get("/api/storage/disks", { preHandler: requireAuth }, async () => {
    return { disks: await listDisks() };
  });

  app.get("/api/backup/status", { preHandler: requireAuth }, async () => {
    const latest = getLatestRun();
    return {
      configured: config.backupRoot !== null,
      running: isBackupRunning(),
      hasRecentValidBackup: hasRecentValidBackup(),
      latestRun: latest ? toBackupRunDto(latest) : null,
    };
  });

  app.get("/api/backup/runs", { preHandler: requireAuth }, async (req) => {
    const query = z.object({ limit: z.coerce.number().int().positive().max(100).default(20) }).parse(req.query);
    return { runs: listBackupRuns(query.limit).map(toBackupRunDto) };
  });

  // "Backup Now" (§5): riservato agli admin, come le altre operazioni che
  // toccano l'intero sistema (§20).
  app.post("/api/backup/run", { preHandler: requireAdmin }, async (_req, reply) => {
    try {
      const run = await runBackup("manual");
      return { run: toBackupRunDto(run) };
    } catch (err) {
      if (handleBackupError(err, reply)) return;
      throw err;
    }
  });

  app.post("/api/backup/restore", { preHandler: requireAdmin }, async (req, reply) => {
    const body = z.object({ confirm: z.literal(true) }).safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({
        error: "confirmation_required",
        message: "Operazione distruttiva: richiede { confirm: true } nel corpo della richiesta",
      });
    }
    try {
      const summary = await restoreFromBackup();
      return {
        summary,
        // Il database SQLite live resta aperto dal processo Hub API in
        // esecuzione: il file ripristinato viene scritto su disco ma non è
        // effettivo finché il servizio non viene riavviato (§35).
        note: "Riavviare l'Hub API per rendere effettivo il database ripristinato.",
      };
    } catch (err) {
      if (handleBackupError(err, reply)) return;
      throw err;
    }
  });
}
