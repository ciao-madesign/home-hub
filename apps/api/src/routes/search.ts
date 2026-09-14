import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isJellyfinConfigured, searchMoviesAndSeries } from "../lib/jellyfin.js";
import { listGames } from "../lib/gaming/store.js";
import { searchByName } from "../lib/files.js";
import { requireAuth } from "../plugins/auth.js";

export interface SearchResultItem {
  type: "movie" | "series" | "game" | "file";
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
}

const querySchema = z.object({ q: z.string().trim().min(1).max(120) });

/**
 * Ricerca globale unificata (§16): un'unica barra interroga in parallelo
 * ogni sezione "searchable" (vedi nav.ts). Ogni fonte è indipendente: se
 * Jellyfin non è raggiungibile la ricerca continua comunque sulle altre
 * (§31, nessun errore fatale) — semplicemente quella fonte non contribuisce
 * risultati. Foto/Musica non ancora incluse: Immich richiederebbe la
 * ricerca "smart" (machine learning, disattivata di default per
 * l'hardware iniziale, §3) o un match per nome file poco utile in
 * pratica; Musica è ancora uno stub — vedi docs/SPECIFICHE.md.
 */
export async function searchRoutes(app: FastifyInstance) {
  app.get("/api/search", { preHandler: requireAuth }, async (req, reply) => {
    const query = querySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_query" });
    const { q } = query.data;
    const userId = req.auth!.user.id;
    const needle = q.toLowerCase();

    const [media, games, sharedFiles, privateFiles] = await Promise.all([
      isJellyfinConfigured()
        ? searchMoviesAndSeries(q).catch(() => [])
        : Promise.resolve([]),
      listGames(),
      searchByName("shared", userId, q).catch(() => []),
      searchByName("private", userId, q).catch(() => []),
    ]);

    const results: SearchResultItem[] = [];

    for (const item of media) {
      results.push({
        type: item.type,
        id: item.id,
        title: item.title,
        subtitle: item.year ? String(item.year) : null,
        url: item.type === "movie" ? `/film/${item.id}` : `/serie/${item.id}`,
      });
    }

    for (const game of games) {
      if (!game.title.toLowerCase().includes(needle)) continue;
      results.push({ type: "game", id: game.id, title: game.title, subtitle: game.platform, url: "/giochi" });
    }

    for (const file of [...sharedFiles, ...privateFiles]) {
      results.push({
        type: "file",
        id: file.path,
        title: file.name,
        subtitle: file.isDirectory ? "Cartella" : file.path,
        url: "/file",
      });
    }

    return { results };
  });
}
