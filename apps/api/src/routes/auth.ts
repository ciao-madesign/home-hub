import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  createSession,
  getUserById,
  listActiveSessionsForUser,
  listAllActiveSessions,
  publicUser,
  revokeAllRemoteSessions,
  revokeAllSessionsForUser,
  revokeSession,
  setUserPassword,
  toSessionDto,
  upsertDevice,
  type UserRow,
} from "../lib/sessions.js";
import { requireAdmin, requireAuth } from "../plugins/auth.js";

const loginBodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  deviceName: z.string().min(1).max(120).default("Dispositivo remoto"),
  deviceKind: z.enum(["browser", "tv", "mobile", "unknown"]).default("browser"),
});

/**
 * Autenticazione per accesso remoto (§22/§24): username/password obbligatori,
 * a differenza della selezione profilo su LAN.
 */
export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/login", async (req, reply) => {
    const body = loginBodySchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
    }

    const db = getDb();
    const user = db
      .prepare("SELECT * FROM users WHERE username = ?")
      .get(body.data.username) as UserRow | undefined;

    if (!user || !user.password_hash || !verifyPassword(body.data.password, user.password_hash)) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const deviceId = upsertDevice(body.data.deviceName, body.data.deviceKind, user.id);
    const { token, session } = createSession(user.id, "remote", deviceId);

    return {
      token,
      user: publicUser(user),
      session: { id: session.id, origin: session.origin, expiresAt: session.expires_at },
    };
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (req) => {
    const auth = req.auth!;
    return {
      user: publicUser(auth.user),
      session: {
        id: auth.session.id,
        origin: auth.session.origin,
        expiresAt: auth.session.expires_at,
      },
    };
  });

  app.post("/api/auth/logout", { preHandler: requireAuth }, async (req) => {
    revokeSession(req.auth!.session.id);
    return { ok: true };
  });

  app.post("/api/auth/sessions/revoke-all", { preHandler: requireAuth }, async (req) => {
    revokeAllSessionsForUser(req.auth!.user.id);
    return { ok: true };
  });

  // --- Sessioni (§24: "possibilità di revocare immediatamente tutte le
  // sessioni remote") -----------------------------------------------------

  app.get("/api/auth/sessions", { preHandler: requireAuth }, async (req) => {
    const auth = req.auth!;
    const sessions = listActiveSessionsForUser(auth.user.id).map((s) => toSessionDto(s, auth.session.id));
    return { sessions };
  });

  app.post("/api/auth/sessions/:id/revoke", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = req.auth!;
    // Un utente può revocare solo le proprie sessioni; un admin anche quelle altrui.
    if (auth.user.role !== "admin") {
      const owned = listActiveSessionsForUser(auth.user.id).some((s) => s.id === id);
      if (!owned) return reply.code(404).send({ error: "not_found" });
    }
    revokeSession(id);
    return { ok: true };
  });

  app.get("/api/auth/sessions/all", { preHandler: requireAdmin }, async (req) => {
    const auth = req.auth!;
    const sessions = listAllActiveSessions().map((s) => ({
      ...toSessionDto(s, auth.session.id),
      username: s.username,
      displayName: s.display_name,
    }));
    return { sessions };
  });

  // Pulsante di emergenza (§24): revoca ogni sessione remota di ogni
  // utente, es. in caso di sospetto accesso non autorizzato da Internet.
  app.post("/api/auth/sessions/revoke-all-remote", { preHandler: requireAdmin }, async () => {
    const count = revokeAllRemoteSessions();
    return { ok: true, revoked: count };
  });

  // --- Password (§25: recupero via "procedura locale sull'Hub") ----------

  const changePasswordSchema = z.object({
    currentPassword: z.string().nullable().default(null),
    newPassword: z.string().min(8),
  });

  app.post("/api/auth/password", { preHandler: requireAuth }, async (req, reply) => {
    const body = changePasswordSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });

    const user = req.auth!.user;
    if (user.password_hash) {
      if (!body.data.currentPassword || !verifyPassword(body.data.currentPassword, user.password_hash)) {
        return reply.code(401).send({ error: "invalid_credentials" });
      }
    }
    setUserPassword(user.id, hashPassword(body.data.newPassword));
    return { ok: true };
  });

  // Reset password di un altro utente da parte di un admin (§25): l'admin
  // ha già accesso locale senza password, quindi non serve conoscere
  // quella vecchia — pensato per l'utente che ha dimenticato la propria.
  app.post("/api/auth/users/:id/reset-password", { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ newPassword: z.string().min(8) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });

    const user = getUserById(id);
    if (!user) return reply.code(404).send({ error: "not_found" });

    setUserPassword(id, hashPassword(body.data.newPassword));
    revokeAllSessionsForUser(id);
    return { ok: true };
  });
}
