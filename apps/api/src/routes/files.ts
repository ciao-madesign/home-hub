import fsSync from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createFolder,
  deletePermanentDirect,
  deletePermanentlyFromTrash,
  findDuplicates,
  FilesError,
  listDirectory,
  listTrash,
  moveEntry,
  moveToTrash,
  renameEntry,
  resolveExistingPath,
  restoreFromTrash,
  saveUpload,
  searchByName,
} from "../lib/files.js";
import { requireAuth } from "../plugins/auth.js";

const scopeSchema = z.enum(["shared", "private"]);

function handleFilesError(err: unknown, reply: import("fastify").FastifyReply): boolean {
  if (err instanceof FilesError) {
    const status = err.code === "not_found" ? 404 : err.code === "conflict" ? 409 : 400;
    reply.code(status).send({ error: err.code, message: err.message });
    return true;
  }
  return false;
}

/**
 * File Manager proprietario (§11). Opera direttamente sul filesystem sotto
 * Files/{shared,private/<userId>}, mai esposto al frontend: solo l'API vi
 * accede (§2/§14).
 */
export async function filesRoutes(app: FastifyInstance) {
  app.get("/api/files", { preHandler: requireAuth }, async (req, reply) => {
    const query = z
      .object({ scope: scopeSchema, path: z.string().default("") })
      .safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_query" });

    try {
      const entries = await listDirectory(query.data.scope, req.auth!.user.id, query.data.path);
      return { entries };
    } catch (err) {
      if (handleFilesError(err, reply)) return;
      throw err;
    }
  });

  app.post("/api/files/folders", { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({ scope: scopeSchema, path: z.string().default(""), name: z.string().min(1) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });

    try {
      await createFolder(body.data.scope, req.auth!.user.id, body.data.path, body.data.name);
      return { ok: true };
    } catch (err) {
      if (handleFilesError(err, reply)) return;
      throw err;
    }
  });

  app.post("/api/files/rename", { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({ scope: scopeSchema, path: z.string().min(1), newName: z.string().min(1) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });

    try {
      await renameEntry(body.data.scope, req.auth!.user.id, body.data.path, body.data.newName);
      return { ok: true };
    } catch (err) {
      if (handleFilesError(err, reply)) return;
      throw err;
    }
  });

  app.post("/api/files/move", { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({
        scope: scopeSchema,
        path: z.string().min(1),
        destScope: scopeSchema,
        destPath: z.string().default(""),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });

    try {
      await moveEntry(
        body.data.scope,
        req.auth!.user.id,
        body.data.path,
        body.data.destScope,
        body.data.destPath,
      );
      return { ok: true };
    } catch (err) {
      if (handleFilesError(err, reply)) return;
      throw err;
    }
  });

  app.delete("/api/files", { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({ scope: scopeSchema, path: z.string().min(1), permanent: z.boolean().default(false) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });

    try {
      if (body.data.permanent) {
        await deletePermanentDirect(body.data.scope, req.auth!.user.id, body.data.path);
      } else {
        await moveToTrash(body.data.scope, req.auth!.user.id, body.data.path);
      }
      return { ok: true };
    } catch (err) {
      if (handleFilesError(err, reply)) return;
      throw err;
    }
  });

  app.get("/api/files/download", { preHandler: requireAuth }, async (req, reply) => {
    const query = z.object({ scope: scopeSchema, path: z.string().min(1) }).safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_query" });

    try {
      const abs = resolveExistingPath(query.data.scope, req.auth!.user.id, query.data.path);
      const stat = await fsSync.promises.stat(abs);
      if (stat.isDirectory()) return reply.code(400).send({ error: "invalid_path" });

      const name = path.basename(abs);
      reply.header("Content-Disposition", `attachment; filename="${name.replace(/"/g, "")}"`);
      reply.header("Content-Length", stat.size);
      return reply.send(fsSync.createReadStream(abs));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return reply.code(404).send({ error: "not_found" });
      }
      if (handleFilesError(err, reply)) return;
      throw err;
    }
  });

  app.post("/api/files/upload", { preHandler: requireAuth }, async (req, reply) => {
    const parts = req.parts();
    let scope: "shared" | "private" | null = null;
    let uploadPath = "";
    let uploaded = 0;

    for await (const part of parts) {
      if (part.type === "field") {
        if (part.fieldname === "scope") scope = part.value as "shared" | "private";
        if (part.fieldname === "path") uploadPath = String(part.value);
      } else if (part.type === "file") {
        if (!scope) return reply.code(400).send({ error: "invalid_body", message: "scope mancante" });
        try {
          await saveUpload(scope, req.auth!.user.id, uploadPath, part.filename, part.file);
          uploaded += 1;
        } catch (err) {
          if (handleFilesError(err, reply)) return;
          throw err;
        }
      }
    }

    return { ok: true, uploaded };
  });

  app.get("/api/files/trash", { preHandler: requireAuth }, async (req) => {
    return { items: await listTrash(req.auth!.user.id) };
  });

  app.post("/api/files/trash/:id/restore", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await restoreFromTrash(req.auth!.user.id, id);
      return { ok: true };
    } catch (err) {
      if (handleFilesError(err, reply)) return;
      throw err;
    }
  });

  app.delete("/api/files/trash/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await deletePermanentlyFromTrash(req.auth!.user.id, id);
      return { ok: true };
    } catch (err) {
      if (handleFilesError(err, reply)) return;
      throw err;
    }
  });

  app.get("/api/files/duplicates", { preHandler: requireAuth }, async (req, reply) => {
    const query = z.object({ scope: scopeSchema }).safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_query" });
    const groups = await findDuplicates(query.data.scope, req.auth!.user.id);
    return { groups };
  });

  app.get("/api/files/search", { preHandler: requireAuth }, async (req, reply) => {
    const query = z.object({ scope: scopeSchema, q: z.string().min(1) }).safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_query" });
    const results = await searchByName(query.data.scope, req.auth!.user.id, query.data.q);
    return { results };
  });
}
