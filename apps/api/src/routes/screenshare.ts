import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { requireAuth } from "../plugins/auth.js";
import { listSessions } from "../lib/screenshare/session.js";
import { handleHost, handleViewer } from "../lib/screenshare/webrtc.js";

/**
 * Condivisione schermo (fuori roadmap, richiesta esplicita dell'utente):
 * l'Hub relay WebRTC vero e proprio, non solo segnalazione — vedi il
 * commento in lib/screenshare/session.ts per il perché. Autenticazione
 * come per <video src>/<img> (§2 in plugins/auth.ts): il WebSocket nativo
 * del browser non può impostare header, quindi il token passa come query
 * string `?token=`, già supportato da extractToken/attachAuth.
 */
export async function screenshareRoutes(app: FastifyInstance) {
  app.get("/api/screenshare/sessions", { preHandler: requireAuth }, async () => {
    return { sessions: listSessions() };
  });

  app.get(
    "/api/screenshare/ws",
    { preHandler: requireAuth, websocket: true },
    (socket: WebSocket, req) => {
      const auth = req.auth!;
      const query = req.query as { role?: string; hostUserId?: string };

      if (query.role === "host") {
        handleHost(socket, auth.user.id, auth.user.display_name);
        return;
      }
      if (query.role === "viewer" && query.hostUserId) {
        handleViewer(socket, query.hostUserId, auth.user.id);
        return;
      }
      socket.close();
    },
  );
}
