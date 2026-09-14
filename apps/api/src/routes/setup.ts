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
import { connectWifi, getWifiStatus, listWifiNetworks, WifiError } from "../lib/network/wifi.js";

function handleSetupError(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof SetupError) {
    reply.code(err.code === "already_completed" ? 409 : 400).send({ error: err.code, message: err.message });
    return true;
  }
  return false;
}

/**
 * Blocca ogni endpoint del wizard una volta completato (§28), a
 * prescindere dall'autenticazione: questi endpoint sono deliberatamente
 * senza login (il primo avvio non ha ancora utenti), quindi vanno
 * disattivati in modo permanente subito dopo, altrimenti chiunque sulla
 * LAN potrebbe rieseguire il setup più avanti.
 */
function assertNotCompletedGuard(reply: FastifyReply): boolean {
  if (isSetupCompleted()) {
    reply.code(409).send({ error: "already_completed", message: "Il setup iniziale è già stato completato" });
    return false;
  }
  return true;
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
  app.get("/api/setup/wifi/status", async (_req, reply) => {
    if (!assertNotCompletedGuard(reply)) return;
    try {
      return await getWifiStatus();
    } catch (err) {
      if (err instanceof WifiError) return reply.code(503).send({ error: "wifi_unavailable", message: err.message });
      throw err;
    }
  });

  app.get("/api/setup/wifi/scan", async (_req, reply) => {
    if (!assertNotCompletedGuard(reply)) return;
    try {
      return { networks: await listWifiNetworks() };
    } catch (err) {
      if (err instanceof WifiError) return reply.code(503).send({ error: "wifi_unavailable", message: err.message });
      throw err;
    }
  });

  app.post("/api/setup/wifi/connect", async (req, reply) => {
    if (!assertNotCompletedGuard(reply)) return;
    const body = z.object({ ssid: z.string().min(1), password: z.string().nullable().default(null) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
    try {
      await connectWifi(body.data.ssid, body.data.password);
      return { ok: true };
    } catch (err) {
      if (err instanceof WifiError) return reply.code(503).send({ error: "wifi_unavailable", message: err.message });
      throw err;
    }
  });

  app.post("/api/setup/admin", async (req, reply) => {
    if (!assertNotCompletedGuard(reply)) return;
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

  app.post("/api/setup/users", async (req, reply) => {
    if (!assertNotCompletedGuard(reply)) return;
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

  app.get("/api/setup/storage", async (_req, reply) => {
    if (!assertNotCompletedGuard(reply)) return;
    return { disks: await listDisks() };
  });

  app.post("/api/setup/storage/init", async (_req, reply) => {
    if (!assertNotCompletedGuard(reply)) return;
    try {
      return await initStorageLayout();
    } catch (err) {
      if (handleSetupError(err, reply)) return;
      throw err;
    }
  });

  app.get("/api/setup/libraries", async (_req, reply) => {
    if (!assertNotCompletedGuard(reply)) return;
    const status = await getSystemStatus();
    return { services: status.services };
  });

  app.post("/api/setup/settings", async (req, reply) => {
    if (!assertNotCompletedGuard(reply)) return;
    const body = z.object({ hubName: z.string().min(1).max(60) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });

    setSetting(HUB_NAME_KEY, body.data.hubName);
    return { ok: true };
  });

  app.post("/api/setup/complete", async (_req, reply) => {
    if (!assertNotCompletedGuard(reply)) return;
    try {
      completeSetup();
      return { ok: true };
    } catch (err) {
      if (handleSetupError(err, reply)) return;
      throw err;
    }
  });
}
