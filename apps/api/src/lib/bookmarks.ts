import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";

export class BookmarkError extends Error {}

export interface BookmarkRow {
  id: string;
  title: string;
  url: string;
  color: string;
  created_at: string;
}

export function listBookmarks(): BookmarkRow[] {
  return getDb().prepare(`SELECT * FROM bookmarks ORDER BY title ASC`).all() as unknown as BookmarkRow[];
}

export function getBookmark(id: string): BookmarkRow | null {
  const row = getDb().prepare(`SELECT * FROM bookmarks WHERE id = ?`).get(id) as unknown as
    | BookmarkRow
    | undefined;
  return row ?? null;
}

export function createBookmark(title: string, url: string, color: string): BookmarkRow {
  const id = randomUUID();
  getDb().prepare(`INSERT INTO bookmarks (id, title, url, color) VALUES (?, ?, ?, ?)`).run(id, title, url, color);
  return getBookmark(id)!;
}

export function updateBookmark(id: string, fields: Partial<Pick<BookmarkRow, "title" | "url" | "color">>): void {
  if (!getBookmark(id)) throw new BookmarkError("Collegamento non trovato");
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined) as [string, string][];
  if (entries.length === 0) return;
  const setClause = entries.map(([k]) => `${k} = ?`).join(", ");
  const values = entries.map(([, v]) => v);
  getDb()
    .prepare(`UPDATE bookmarks SET ${setClause} WHERE id = ?`)
    .run(...values, id);
}

export function deleteBookmark(id: string): void {
  getDb().prepare(`DELETE FROM bookmarks WHERE id = ?`).run(id);
}

export interface BookmarkDto {
  id: string;
  title: string;
  url: string;
  color: string;
}

export function toBookmarkDto(row: BookmarkRow): BookmarkDto {
  return { id: row.id, title: row.title, url: row.url, color: row.color };
}
