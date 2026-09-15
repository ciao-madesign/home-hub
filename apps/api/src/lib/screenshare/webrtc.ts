import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { RTCPeerConnection } from "werift";
import * as store from "./session.js";

/**
 * Solo STUN (nessun TURN, §3): sufficiente per la LAN e per chi si
 * collega tramite la VPN dell'Hub (§2, che risolve già il NAT traversal
 * per qualunque protocollo, non solo HTTP) — un collegamento WebRTC
 * diretto da fuori casa senza passare dalla VPN può non riuscire per via
 * del probabile CGNAT dell'utente, stesso limite già noto per l'accesso
 * remoto diretto. Aggiungere un TURN è un passo successivo separato, non
 * affrontato qui.
 */
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

function send(socket: WebSocket, message: Record<string, unknown>): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

interface SignalMessage {
  type: "offer" | "answer" | "ice";
  sdp?: string;
  candidate?: { candidate: string; sdpMid?: string; sdpMLineIndex?: number };
}

function parseMessage(raw: unknown): SignalMessage | null {
  try {
    const msg = JSON.parse(String(raw));
    if (msg && typeof msg.type === "string") return msg as SignalMessage;
    return null;
  } catch {
    return null;
  }
}

/**
 * Chi condivide (§2, l'Hub come relay): il browser è l'offerente (ha lui
 * la traccia dello schermo da inviare), l'Hub risponde con una answer.
 * La sessione esiste da quando la connessione WebSocket si apre (non da
 * quando arriva la prima traccia) così un secondo `ontrack` per l'audio
 * si aggiunge alla stessa sessione già creata.
 */
export function handleHost(socket: WebSocket, userId: string, displayName: string): void {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const session = store.createSession(userId, displayName, pc);

  pc.ontrack = (event) => {
    session.hostTracks.push(event.track);
  };
  pc.onicecandidate = (event) => {
    if (event.candidate) send(socket, { type: "ice", candidate: event.candidate });
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "closed" || pc.connectionState === "failed") {
      store.endSession(userId);
    }
  };

  socket.on("message", (raw) => {
    const msg = parseMessage(raw);
    if (!msg) return;
    (async () => {
      if (msg.type === "offer" && msg.sdp) {
        await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send(socket, { type: "answer", sdp: answer.sdp });
      } else if (msg.type === "ice" && msg.candidate) {
        await pc.addIceCandidate(msg.candidate);
      }
    })().catch((err) => send(socket, { type: "error", message: (err as Error).message }));
  });

  socket.on("close", () => store.endSession(userId));
  socket.on("error", () => store.endSession(userId));
}

/**
 * Chi guarda: qui è l'Hub l'offerente (ha lui, dalla sessione di chi
 * condivide, la traccia da inoltrare) — il flusso è invertito rispetto a
 * handleHost. Le tracce esistenti al momento della connessione bastano:
 * una sessione compare nell'elenco solo dopo che almeno una traccia è
 * arrivata (vedi store.listSessions), quindi chi si collega ne trova
 * sempre almeno una pronta da inoltrare.
 */
export function handleViewer(socket: WebSocket, hostUserId: string, viewerUserId: string): void {
  const session = store.getSession(hostUserId);
  if (!session || session.hostTracks.length === 0) {
    send(socket, { type: "error", message: "Nessuna sessione attiva per questo utente" });
    socket.close();
    return;
  }

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const connId = randomUUID();
  store.addViewer(hostUserId, connId, viewerUserId, pc);
  for (const track of session.hostTracks) pc.addTrack(track);

  pc.onicecandidate = (event) => {
    if (event.candidate) send(socket, { type: "ice", candidate: event.candidate });
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "closed" || pc.connectionState === "failed") {
      store.removeViewer(hostUserId, connId);
    }
  };

  socket.on("message", (raw) => {
    const msg = parseMessage(raw);
    if (!msg) return;
    (async () => {
      if (msg.type === "answer" && msg.sdp) {
        await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
      } else if (msg.type === "ice" && msg.candidate) {
        await pc.addIceCandidate(msg.candidate);
      }
    })().catch((err) => send(socket, { type: "error", message: (err as Error).message }));
  });

  socket.on("close", () => store.removeViewer(hostUserId, connId));
  socket.on("error", () => store.removeViewer(hostUserId, connId));

  (async () => {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send(socket, { type: "offer", sdp: offer.sdp });
  })().catch((err) => send(socket, { type: "error", message: (err as Error).message }));
}
