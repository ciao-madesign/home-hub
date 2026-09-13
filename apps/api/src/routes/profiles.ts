import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { createSession, publicUser, upsertDevice, type UserRow } from "../lib/sessions.js";

const selectBodySchema = z.object({
  deviceName: z.string().min(1).max(120).default("Dispositivo sconosciuto"),
  deviceKind: z.enum(["browser", "tv", "mobile", "unknown"]).default("browser"),
});

/**
 * Selezione profilo per accesso LAN (§21): nessuna password richiesta,
 * qualsiasi dispositivo in rete locale è considerato autorizzato.
 */
export async function profilesRoutes(app: FastifyInstance) {
  app.get("/api/profiles", async () => {
    const db = getDb();
    const users = db
      .prepare("SELECT * FROM users ORDER BY role DESC, display_name ASC")
      .all() as unknown as UserRow[];
    return { profiles: users.map(publicUser) };
  });

  app.post("/api/profiles/:id/select", async (req, reply) => {
    const params = req.params as { id: string };
    const body = selectBodySchema.safeParse(req.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
    }

    const db = getDb();
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(params.id) as
      | UserRow
      | undefined;
    if (!user) return reply.code(404).send({ error: "profile_not_found" });

    const deviceId = upsertDevice(body.data.deviceName, body.data.deviceKind, user.id);
    const { token, session } = createSession(user.id, "local", deviceId);

    return {
      token,
      user: publicUser(user),
      session: { id: session.id, origin: session.origin, expiresAt: session.expires_at },
    };
  });
}
