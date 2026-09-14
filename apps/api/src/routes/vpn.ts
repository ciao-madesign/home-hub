import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  createPeer,
  deletePeer,
  getPeerOwner,
  getVpnStatus,
  listAllPeers,
  listPeersForUser,
  VpnError,
} from "../lib/network/vpn.js";
import { requireAdmin, requireAuth } from "../plugins/auth.js";

function handleVpnError(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof VpnError) {
    const status = err.code === "not_configured" ? 503 : 400;
    reply.code(status).send({ error: err.code, message: err.message });
    return true;
  }
  return false;
}

const createPeerSchema = z.object({
  profile: z.enum(["home", "full"]),
  label: z.string().min(1).max(60),
  publicKey: z.string().min(1),
});

/**
 * VPN personale WireGuard (§2, ultima funzione della Fase 9): ogni utente
 * gestisce i propri peer (self-service, stesso modello di auth.ts per le
 * sessioni), un admin vede/revoca anche quelli altrui. La chiave privata
 * non transita mai da qui: il client la genera da sé, l'Hub riceve solo
 * la pubblica e restituisce i parametri per completare la propria
 * configurazione (endpoint, AllowedIPs, indirizzo assegnato).
 */
export async function vpnRoutes(app: FastifyInstance) {
  app.get("/api/vpn/status", { preHandler: requireAuth }, async () => {
    return getVpnStatus();
  });

  app.get("/api/vpn/peers", { preHandler: requireAuth }, async (req) => {
    const peers = await listPeersForUser(req.auth!.user.id);
    return { peers };
  });

  app.post("/api/vpn/peers", { preHandler: requireAuth }, async (req, reply) => {
    const body = createPeerSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });

    try {
      const peer = await createPeer(req.auth!.user.id, body.data.profile, body.data.label, body.data.publicKey);
      return { peer };
    } catch (err) {
      if (handleVpnError(err, reply)) return;
      throw err;
    }
  });

  app.delete("/api/vpn/peers/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = req.auth!;
    const ownerId = getPeerOwner(id);
    if (!ownerId) return reply.code(404).send({ error: "not_found" });
    if (auth.user.role !== "admin" && ownerId !== auth.user.id) {
      return reply.code(404).send({ error: "not_found" });
    }
    await deletePeer(id);
    return { ok: true };
  });

  app.get("/api/vpn/peers/all", { preHandler: requireAdmin }, async () => {
    const peers = await listAllPeers();
    return { peers };
  });
}
