import type { FastifyReply, FastifyRequest } from "fastify";
import { resolveSession } from "../lib/sessions.js";

declare module "fastify" {
  interface FastifyRequest {
    auth?: ReturnType<typeof resolveSession>;
  }
}

function extractToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return null;
}

/** Popola request.auth se è presente un token di sessione valido, senza bloccare la richiesta. */
export async function attachAuth(req: FastifyRequest): Promise<void> {
  const token = extractToken(req);
  req.auth = token ? resolveSession(token) : null;
}

/** Blocca la richiesta se non esiste una sessione valida (§24). */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.auth) {
    reply.code(401).send({ error: "unauthorized" });
  }
}

/** Blocca la richiesta se l'utente autenticato non è admin (§20). */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.auth || req.auth.user.role !== "admin") {
    reply.code(403).send({ error: "forbidden" });
  }
}
