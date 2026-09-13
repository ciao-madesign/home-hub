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

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDaysLeft(expiresAt: string): string {
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "in scadenza";
  return days === 1 ? "1 giorno rimasto" : `${days} giorni rimasti`;
}
