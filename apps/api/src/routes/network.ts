import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getLocalNetworkInfo } from "../lib/network/interfaces.js";
import { connectWifi, getWifiStatus, handleWifiError, listWifiNetworks } from "../lib/network/wifi.js";
import { getDdnsStatus, updateDdns } from "../lib/network/ddns.js";
import { requireAdmin } from "../plugins/auth.js";

/**
 * Rete e setup iniziale (§21/§28). `/api/network/info` è volutamente senza
 * `requireAuth`: serve a mostrare IP/`.local`/QR nella schermata di
 * selezione profilo, prima del login, per far scoprire l'Hub a un secondo
 * dispositivo (§21) — nessun dato sensibile esposto (solo indirizzi
 * locali). Le funzioni Wi-Fi sono invece riservate agli admin (§20):
 * cambiano la configurazione di rete del sistema.
 */
export async function networkRoutes(app: FastifyInstance) {
  app.get("/api/network/info", async () => {
    return getLocalNetworkInfo();
  });

  app.get("/api/network/wifi/status", { preHandler: requireAdmin }, async (_req, reply) => {
    try {
      return await getWifiStatus();
    } catch (err) {
      if (handleWifiError(err, reply)) return;
      throw err;
    }
  });

  app.get("/api/network/wifi/scan", { preHandler: requireAdmin }, async (_req, reply) => {
    try {
      return { networks: await listWifiNetworks() };
    } catch (err) {
      if (handleWifiError(err, reply)) return;
      throw err;
    }
  });

  app.post("/api/network/wifi/connect", { preHandler: requireAdmin }, async (req, reply) => {
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

  // DDNS (§23): stato/ultimo aggiornamento, riservato agli admin.
  app.get("/api/network/ddns/status", { preHandler: requireAdmin }, async () => {
    return getDdnsStatus();
  });

  app.post("/api/network/ddns/update", { preHandler: requireAdmin }, async () => {
    await updateDdns();
    return getDdnsStatus();
  });
}
