import { getDb } from "../db/index.js";

/** Soglia di completamento (§7): oltre il 90% il contenuto è marcato come guardato. */
const COMPLETION_THRESHOLD = 0.9;

export type ItemType = "movie" | "episode";

export interface PlaybackProgressRow {
  user_id: string;
  item_id: string;
  item_type: ItemType;
  position_ticks: number;
  duration_ticks: number | null;
  completed: number;
  updated_at: string;
}

export function saveProgress(
  userId: string,
  itemId: string,
  itemType: ItemType,
  positionTicks: number,
  durationTicks: number | null,
): void {
  const completed =
    durationTicks && durationTicks > 0 && positionTicks / durationTicks >= COMPLETION_THRESHOLD
      ? 1
      : 0;

  getDb()
    .prepare(
      `INSERT INTO playback_progress (user_id, item_id, item_type, position_ticks, duration_ticks, completed, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (user_id, item_id) DO UPDATE SET
         position_ticks = excluded.position_ticks,
         duration_ticks = excluded.duration_ticks,
         completed = excluded.completed,
         updated_at = datetime('now')`,
    )
    .run(userId, itemId, itemType, positionTicks, durationTicks, completed);
}

export function getProgress(userId: string, itemId: string): PlaybackProgressRow | null {
  const row = getDb()
    .prepare("SELECT * FROM playback_progress WHERE user_id = ? AND item_id = ?")
    .get(userId, itemId) as unknown as PlaybackProgressRow | undefined;
  return row ?? null;
}

/** Elementi in corso (non completati, con progresso > 0), più recenti prima — §17 "Continua a guardare". */
export function listInProgress(userId: string, limit = 12): PlaybackProgressRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM playback_progress
       WHERE user_id = ? AND completed = 0 AND position_ticks > 0
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(userId, limit) as unknown as PlaybackProgressRow[];
}
