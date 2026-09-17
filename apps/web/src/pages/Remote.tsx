import { useEffect, useRef, useState } from "react";
import { api, tvWsUrl, type TvSessionStatus } from "../api/client";

/**
 * Telecomando per la Riproduzione su TV non Smart (fuori roadmap,
 * richiesta esplicita dell'utente — vedi docs/SPECIFICHE.md): questa
 * pagina non riproduce mai nulla, è solo il dispositivo di controllo.
 * La riproduzione vera avviene su mpv, sul Wyse collegato via HDMI (§
 * lib/tvPlayer/session.ts sul backend). Lo stato arriva via WebSocket
 * (stesso protocollo di auth ?token= di Condivisione schermo).
 */

const cardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
};

const buttonStyle: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: "var(--radius-sm)",
  border: "none",
  background: "var(--accent)",
  color: "white",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "transparent",
  border: "1px solid var(--status-problem)",
  color: "var(--status-problem)",
};

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Remote() {
  const [session, setSession] = useState<TvSessionStatus | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // Durante il trascinamento della barra di avanzamento non si deve
  // sovrascrivere il valore con gli aggiornamenti in arrivo dal WebSocket.
  const [seekPreview, setSeekPreview] = useState<number | null>(null);

  useEffect(() => {
    api
      .tvStatus()
      .then((r) => setSession(r.session))
      .catch(() => setSession(null));

    const ws = new WebSocket(tvWsUrl());
    wsRef.current = ws;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "status") setSession(msg);
    };
    ws.onclose = () => {
      // La sessione è finita (o non ce n'era una): niente WebSocket da riaprire qui,
      // il prossimo /tv/play ne apre uno nuovo quando la pagina viene ricaricata.
    };
    return () => ws.close();
  }, []);

  async function control(body: Parameters<typeof api.tvControl>[0]) {
    setError(null);
    try {
      const r = await api.tvControl(body);
      setSession(r.session);
    } catch {
      setError("Comando non riuscito — verifica che la riproduzione sulla TV sia attiva.");
    }
  }

  if (session === undefined) {
    return <p style={{ color: "var(--text-faint)" }}>Caricamento…</p>;
  }

  if (!session || session.status === "stopped") {
    return (
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 20px" }}>Telecomando TV</h1>
        <div style={cardStyle}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-faint)" }}>
            Nessuna riproduzione attiva sulla TV. Apri un film o un episodio e scegli "Riproduci sulla TV".
          </p>
        </div>
      </div>
    );
  }

  const position = seekPreview ?? session.positionSeconds;
  const duration = session.durationSeconds ?? 0;

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 20px" }}>Telecomando TV</h1>

      <div style={cardStyle}>
        <p style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>{session.title}</p>
        {error && <p style={{ fontSize: 13, color: "var(--status-problem)", margin: "0 0 12px" }}>{error}</p>}

        <div style={{ marginBottom: 16 }}>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={1}
            value={position}
            onChange={(e) => setSeekPreview(Number(e.target.value))}
            onMouseUp={(e) => {
              control({ action: "seek", seconds: Number((e.target as HTMLInputElement).value) });
              setSeekPreview(null);
            }}
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-faint)" }}>
            <span>{formatTime(position)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {session.status === "paused" ? (
            <button onClick={() => control({ action: "resume" })} style={buttonStyle}>
              Play
            </button>
          ) : (
            <button onClick={() => control({ action: "pause" })} style={buttonStyle}>
              Pausa
            </button>
          )}
          <button onClick={() => control({ action: "seek", seconds: Math.max(0, position - 10) })} style={buttonStyle}>
            -10s
          </button>
          <button onClick={() => control({ action: "seek", seconds: Math.min(duration, position + 10) })} style={buttonStyle}>
            +10s
          </button>
          <button onClick={() => control({ action: "stop" })} style={dangerButtonStyle}>
            Stop
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
            Volume: {session.volume}
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={session.volume}
            onChange={(e) => control({ action: "volume", volume: Number(e.target.value) })}
            style={{ width: "100%" }}
          />
        </div>

        {session.audioTracks.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Audio:</span>
            <select
              value={session.audioTrack ?? ""}
              onChange={(e) => control({ action: "audio-track", track: Number(e.target.value) })}
              style={{ padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)", fontSize: 13 }}
            >
              {session.audioTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {session.subtitleTracks.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Sottotitoli:</span>
            <select
              value={session.subtitleTrack ?? ""}
              onChange={(e) => control({ action: "subtitle-track", track: e.target.value === "" ? null : Number(e.target.value) })}
              style={{ padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)", fontSize: 13 }}
            >
              <option value="">Nessuno</option>
              {session.subtitleTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
