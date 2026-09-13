/**
 * SQLite's `datetime('now')` produces "YYYY-MM-DD HH:MM:SS" in UTC, senza
 * indicazione di fuso. `new Date(...)` di JS interpreta quel formato come
 * ora locale (non UTC) su Node — su un host non-UTC il risultato sarebbe
 * sbagliato. Questa funzione forza l'interpretazione UTC.
 */
export function parseSqliteTimestamp(value: string): Date {
  return new Date(`${value.replace(" ", "T")}Z`);
}
