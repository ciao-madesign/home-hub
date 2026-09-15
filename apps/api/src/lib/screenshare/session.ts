import type { RTCPeerConnection, MediaStreamTrack } from "werift";

/**
 * Condivisione schermo (fuori roadmap, richiesta esplicita dell'utente):
 * l'Hub fa da relay WebRTC vero e proprio (non solo segnalazione) — il
 * video passa fisicamente attraverso l'Hub, un peer per chi condivide e
 * uno per ogni spettatore. Scelta deliberata invece di un collegamento
 * diretto peer-to-peer: chi guarda da fuori casa passa già dagli stessi
 * percorsi già risolti per l'accesso remoto (VPN §2, tunnel §23), mentre
 * un collegamento diretto rischierebbe di non stabilirsi mai per via del
 * probabile CGNAT dell'utente (§3) — stesso ragionamento già fatto per
 * l'accesso remoto alla Web App.
 *
 * Stato solo in memoria, mai nel database: una sessione non ha senso di
 * sopravvivere a un riavvio dell'Hub API (le connessioni WebRTC
 * cadrebbero comunque), stesso principio già seguito per i processi
 * attivi di Download/Gaming (`activeHandles`/`runningProcesses`).
 */
export interface ScreenShareSession {
  hostUserId: string;
  hostDisplayName: string;
  hostConnection: RTCPeerConnection;
  hostTracks: MediaStreamTrack[];
  viewers: Map<string, { connection: RTCPeerConnection; userId: string }>;
  startedAt: string;
}

export interface ScreenShareSessionSummary {
  hostUserId: string;
  hostDisplayName: string;
  startedAt: string;
  viewerCount: number;
}

const sessions = new Map<string, ScreenShareSession>();

export function getSession(hostUserId: string): ScreenShareSession | undefined {
  return sessions.get(hostUserId);
}

export function listSessions(): ScreenShareSessionSummary[] {
  return [...sessions.values()].map((s) => ({
    hostUserId: s.hostUserId,
    hostDisplayName: s.hostDisplayName,
    startedAt: s.startedAt,
    viewerCount: s.viewers.size,
  }));
}

/** Un utente ha al più una sessione attiva: avviarne una nuova sostituisce quella precedente. */
export function createSession(
  hostUserId: string,
  hostDisplayName: string,
  hostConnection: RTCPeerConnection,
): ScreenShareSession {
  endSession(hostUserId);
  const session: ScreenShareSession = {
    hostUserId,
    hostDisplayName,
    hostConnection,
    hostTracks: [],
    viewers: new Map(),
    startedAt: new Date().toISOString(),
  };
  sessions.set(hostUserId, session);
  return session;
}

export function endSession(hostUserId: string): void {
  const session = sessions.get(hostUserId);
  if (!session) return;
  for (const viewer of session.viewers.values()) viewer.connection.close();
  session.hostConnection.close();
  sessions.delete(hostUserId);
}

export function addViewer(hostUserId: string, viewerConnId: string, userId: string, connection: RTCPeerConnection): void {
  const session = sessions.get(hostUserId);
  if (!session) return;
  session.viewers.set(viewerConnId, { connection, userId });
}

export function removeViewer(hostUserId: string, viewerConnId: string): void {
  sessions.get(hostUserId)?.viewers.delete(viewerConnId);
}
