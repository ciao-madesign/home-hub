import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";

export type EventLevel = "info" | "critical";

export interface SystemEventRow {
  id: string;
  level: EventLevel;
  category: string;
  message: string;
  created_at: string;
}

export function logSystemEvent(level: EventLevel, category: string, message: string): void {
  getDb()
    .prepare("INSERT INTO system_events (id, level, category, message) VALUES (?, ?, ?, ?)")
    .run(randomUUID(), level, category, message);
}

export function listSystemEvents(limit = 50): SystemEventRow[] {
  return getDb()
    .prepare("SELECT * FROM system_events ORDER BY created_at DESC LIMIT ?")
    .all(limit) as unknown as SystemEventRow[];
}

export interface SystemEventDto {
  id: string;
  level: EventLevel;
  category: string;
  message: string;
  createdAt: string;
}

export function toSystemEventDto(row: SystemEventRow): SystemEventDto {
  return { id: row.id, level: row.level, category: row.category, message: row.message, createdAt: row.created_at };
}
