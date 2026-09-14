import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  completeSetup,
  createInitialUser,
  HUB_NAME_KEY,
  initStorageLayout,
  isSetupCompleted,
  SetupError,
  setSetting,
} from "../lib/setup.js";
import { listDisks } from "../lib/storage/disks.js";
import { getSystemStatus } from "../lib/system.js";
import { connectWifi, getWifiStatus, handleWifiError, listWifiNetworks } from "../lib/network/wifi.js";
import { requireSetupNotCompleted } from "../plugins/auth.js";

function handleSetupError(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof SetupError) {
    reply.code(err.code === "already_completed" ? 409 : 400).send({ error: err.code, message: err.message });
    return true;
  }
  return false;
}

const userSchema = z.object({
  username: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9._-]+$/i, "Solo lettere, numeri, punto, trattino e underscore"),
  displayName: z.string().min(1).max(80),
  password: z.string().min(8).nullable().default(null),
});

export async function setupRoutes(app: FastifyInstance) {
  app.get("/api/setup/status", async () => {
    return { completed: isSetupCompleted() };
  });

  // Wi-Fi durante il wizard (§28, step "rete"): nessun utente/sessione
  // esiste ancora a questo punto, quindi non può passare da requireAdmin
  // come /api/network/wifi/* (usato invece dopo il setup) — stesso
  // motivo/stessa guardia degli altri endpoint di questa rotta.
  app.get("/api/setup/wifi/status", { preHandler: requireSetupNotCompleted }, async (_req, reply) => {
    try {
      return await getWifiStatus();
    } catch (err) {
      if (handleWifiError(err, reply)) return;
      throw err;
    }
  });

  app.get("/api/setup/wifi/scan", { preHandler: requireSetupNotCompleted }, async (_req, reply) => {
    try {
      return { networks: await listWifiNetworks() };
    } catch (err) {
      if (handleWifiError(err, reply)) return;
      throw err;
    }
  });

  app.post("/api/setup/wifi/connect", { preHandler: requireSetupNotCompleted }, async (req, reply) => {
    const body = z.object({ ssid: z.string().min(1), password: z.string().nullable().default(null) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
    try {
      await connectWifi(body.data.ssid, body.data.password);
      return { ok: true };
    } catch (err) {
      if (handleWifiError(err, reply)) return;
      throw err;
    }
  });

  app.post("/api/setup/admin", { preHandler: requireSetupNotCompleted }, async (req, reply) => {
    const body = userSchema.extend({ password: z.string().min(8) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });

    try {
      const user = createInitialUser(body.data.username, body.data.displayName, body.data.password, "admin");
      return { user };
    } catch (err) {
      if (handleSetupError(err, reply)) return;
      throw err;
    }
  });

  app.post("/api/setup/users", { preHandler: requireSetupNotCompleted }, async (req, reply) => {
    const body = userSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });

    try {
      const user = createInitialUser(body.data.username, body.data.displayName, body.data.password, "user");
      return { user };
    } catch (err) {
      if (handleSetupError(err, reply)) return;
      throw err;
    }
  });

  app.get("/api/setup/storage", { preHandler: requireSetupNotCompleted }, async () => {
    return { disks: await listDisks() };
  });

  app.post("/api/setup/storage/init", { preHandler: requireSetupNotCompleted }, async (_req, reply) => {
    try {
      return await initStorageLayout();
    } catch (err) {
      if (handleSetupError(err, reply)) return;
      throw err;
    }
  });

  app.get("/api/setup/libraries", { preHandler: requireSetupNotCompleted }, async () => {
    const status = await getSystemStatus();
    return { services: status.services };
  });

  app.post("/api/setup/settings", { preHandler: requireSetupNotCompleted }, async (req, reply) => {
    const body = z.object({ hubName: z.string().min(1).max(60) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });

    setSetting(HUB_NAME_KEY, body.data.hubName);
    return { ok: true };
  });

  app.post("/api/setup/complete", { preHandler: requireSetupNotCompleted }, async (_req, reply) => {
    try {
      completeSetup();
      return { ok: true };
    } catch (err) {
      if (handleSetupError(err, reply)) return;
      throw err;
    }
  });
}
