import { useEffect, useState } from "react";
import { api, type SystemStatus } from "../api/client";

/** Polling periodico dello stato sistema (§30). */
export function useSystemStatus(intervalMs = 15000) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const data = await api.systemStatus();
        if (!cancelled) {
          setStatus(data);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Impossibile contattare l'Hub API");
      }
    }

    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { status, error };
}
