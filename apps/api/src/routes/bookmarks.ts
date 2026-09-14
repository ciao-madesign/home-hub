import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  BookmarkError,
  createBookmark,
  deleteBookmark,
  getBookmark,
  listBookmarks,
  toBookmarkDto,
  updateBookmark,
} from "../lib/bookmarks.js";
import { requireAdmin, requireAuth } from "../plugins/auth.js";

function handleBookmarkError(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof BookmarkError) {
    reply.code(404).send({ error: "not_found", message: err.message });
    return true;
  }
  return false;
}

// Solo http/https: evita di salvare schemi come javascript:/data: in un
// campo che finisce direttamente in un attributo href (§26).
const httpUrl = z
  .string()
  .url()
  .refine((v) => v.startsWith("http://") || v.startsWith("https://"), "Solo URL http/https");

const bookmarkSchema = z.object({
  title: z.string().min(1).max(60),
  url: httpUrl,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#6366f1"),
});

/**
 * Web — collegamenti rapidi (non in SPEC_V1/V2, aggiunta su richiesta
 * esplicita): apre siti esterni nel browser reale del dispositivo (nuova
 * scheda), non incorporati nell'Hub — vedi docs/SPECIFICHE.md.
 */
export async function bookmarksRoutes(app: FastifyInstance) {
  app.get("/api/bookmarks", { preHandler: requireAuth }, async () => {
    return { bookmarks: listBookmarks().map(toBookmarkDto) };
  });

  app.post("/api/bookmarks", { preHandler: requireAdmin }, async (req, reply) => {
    const body = bookmarkSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
    const bookmark = createBookmark(body.data.title, body.data.url, body.data.color);
    return { bookmark: toBookmarkDto(bookmark) };
  });

  app.patch("/api/bookmarks/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = bookmarkSchema.partial().safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
    try {
      updateBookmark(id, body.data);
      return { bookmark: toBookmarkDto(getBookmark(id)!) };
    } catch (err) {
      if (handleBookmarkError(err, reply)) return;
      throw err;
    }
  });

  app.delete("/api/bookmarks/:id", { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params as { id: string };
    deleteBookmark(id);
    return { ok: true };
  });
}
