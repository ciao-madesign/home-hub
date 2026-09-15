import { useCallback, useEffect, useRef, useState } from "react";
import { api, screenShareWsUrl, type ScreenShareSessionSummary } from "../api/client";
import { useProfile } from "../context/ProfileContext";

/**
 * Condivisione schermo (fuori roadmap, richiesta esplicita dell'utente):
 * l'Hub fa da relay WebRTC (vedi lib/screenshare/ sul backend). Segue lo
 * stesso protocollo di segnalazione lì implementato: chi condivide è
 * l'offerente (ha lui la traccia), chi guarda riceve un'offerta
 * dall'Hub (che inoltra la traccia già ricevuta da chi condivide).
 *
 * `getDisplayMedia` richiede un contesto sicuro (HTTPS) — non funziona
 * sull'accesso LAN in HTTP semplice. Guardare una condivisione altrui
 * invece non ha questo vincolo (nessuna cattura schermo lato chi guarda).
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

function isSecureContextForCapture(): boolean {
  return window.isSecureContext && typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

function HostPanel() {
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setSharing(false);
  }, []);

  useEffect(() => stop, [stop]); // ferma tutto se si lascia la pagina

  async function start() {
    setError(null);
    if (!isSecureContextForCapture()) {
      setError(
        "La condivisione dello schermo richiede una connessione sicura (HTTPS). Sulla LAN in HTTP semplice il browser la blocca — usa l'accesso remoto HTTPS o la VPN.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pcRef.current = pc;
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
      // Basta ascoltare la traccia video: è quella che il browser interrompe
      // quando l'utente ferma la condivisione dal proprio controllo nativo
      // (es. la barra "stai condividendo lo schermo" di Chrome).
      stream.getVideoTracks()[0].onended = () => stop();

      const ws = new WebSocket(screenShareWsUrl("host"));
      wsRef.current = ws;

      pc.onicecandidate = (e) => {
        if (e.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ice", candidate: e.candidate }));
        }
      };

      ws.onopen = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "offer", sdp: offer.sdp }));
      };
      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "answer") {
          await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
        } else if (msg.type === "ice" && msg.candidate) {
          await pc.addIceCandidate(msg.candidate);
        } else if (msg.type === "error") {
          setError(msg.message);
          stop();
        }
      };
      ws.onclose = () => setSharing(false);

      setSharing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Condivisione non riuscita.");
      stop();
    }
  }

  return (
    <div style={cardStyle}>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>
        Condividi il tuo schermo: chi altro è collegato all'Hub può guardarlo in qualsiasi momento, senza che tu
        debba fare altro che tenere aperta questa pagina.
      </p>
      {error && <p style={{ fontSize: 13, color: "var(--status-problem)", margin: "0 0 12px" }}>{error}</p>}

      {sharing && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: "100%", maxWidth: 480, borderRadius: "var(--radius-sm)", marginBottom: 12, display: "block" }}
        />
      )}

      {sharing ? (
        <button onClick={stop} style={dangerButtonStyle}>
          Interrompi condivisione
        </button>
      ) : (
        <button onClick={start} style={buttonStyle}>
          Condividi il mio schermo…
        </button>
      )}
    </div>
  );
}

function ViewerPanel() {
  const { user } = useProfile();
  const [sessions, setSessions] = useState<ScreenShareSessionSummary[] | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const load = useCallback(() => {
    api
      .listScreenShareSessions()
      .then((r) => setSessions(r.sessions))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const closeViewer = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setWatching(null);
  }, []);

  useEffect(() => closeViewer, [closeViewer]);

  function watch(hostUserId: string) {
    setError(null);
    closeViewer();

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pcRef.current = pc;
    pc.ontrack = (event) => {
      if (videoRef.current) videoRef.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
    };

    const ws = new WebSocket(screenShareWsUrl("viewer", hostUserId));
    wsRef.current = ws;

    pc.onicecandidate = (e) => {
      if (e.candidate && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ice", candidate: e.candidate }));
      }
    };
    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "offer") {
        await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", sdp: answer.sdp }));
      } else if (msg.type === "ice" && msg.candidate) {
        await pc.addIceCandidate(msg.candidate);
      } else if (msg.type === "error") {
        setError(msg.message);
        closeViewer();
      }
    };
    ws.onclose = () => setWatching((w) => (w === hostUserId ? null : w));

    setWatching(hostUserId);
  }

  const others = sessions?.filter((s) => s.hostUserId !== user?.id) ?? [];

  return (
    <div style={cardStyle}>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>
        Sessioni disponibili in questo momento — puoi collegarti e scollegarti quando vuoi.
      </p>
      {error && <p style={{ fontSize: 13, color: "var(--status-problem)", margin: "0 0 12px" }}>{error}</p>}

      {others.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--text-faint)" }}>Nessuno sta condividendo lo schermo ora.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: watching ? 12 : 0 }}>
        {others.map((s) => (
          <div
            key={s.hostUserId}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              fontSize: 13,
            }}
          >
            <span>
              {s.hostDisplayName} {s.viewerCount > 0 && <span style={{ color: "var(--text-faint)" }}>· {s.viewerCount} in ascolto</span>}
            </span>
            {watching === s.hostUserId ? (
              <button onClick={closeViewer} style={{ ...dangerButtonStyle, padding: "6px 12px", fontSize: 12 }}>
                Chiudi
              </button>
            ) : (
              <button onClick={() => watch(s.hostUserId)} style={{ ...buttonStyle, padding: "6px 12px", fontSize: 12 }}>
                Guarda
              </button>
            )}
          </div>
        ))}
      </div>

      {watching && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{ width: "100%", borderRadius: "var(--radius-sm)", display: "block", background: "black" }}
        />
      )}
    </div>
  );
}

export function ScreenShare() {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 20px" }}>Condivisione schermo</h1>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Condividi</h2>
      <div style={{ marginBottom: 28 }}>
        <HostPanel />
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Guarda</h2>
      <ViewerPanel />
    </div>
  );
}
