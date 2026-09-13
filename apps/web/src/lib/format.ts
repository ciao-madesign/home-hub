import { TICKS_PER_SECOND } from "../api/client";

export function formatRuntime(ticks: number | null): string | null {
  if (!ticks) return null;
  const totalMinutes = Math.round(ticks / TICKS_PER_SECOND / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function formatProgressPercent(positionTicks: number, durationTicks: number | null): number {
  if (!durationTicks || durationTicks <= 0) return 0;
  return Math.min(100, Math.round((positionTicks / durationTicks) * 100));
}
