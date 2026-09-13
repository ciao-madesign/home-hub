import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { verifyPassword } from "../lib/password.js";
import {
  createSession,
  publicUser,
  revokeAllSessionsForUser,
  revokeSession,
  upsertDevice,
  type UserRow,
} from "../lib/sessions.js";
import { requireAuth } from "../plugins/auth.js";

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
}
