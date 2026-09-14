import type { FastifyReply, FastifyRequest } from "fastify";
import { resolveSession } from "../lib/sessions.js";
import { isSetupCompleted } from "../lib/setup.js";

declare module "fastify" {
  interface FastifyRequest {
    auth?: ReturnType<typeof resolveSession>;
  }
}

function extractToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  // Fallback via query string: necessario per <img>/<video src> che non
  // possono impostare un header Authorization (usato solo da /api/media/*).
  const query = req.query as Record<string, unknown> | undefined;
  if (typeof query?.token === "string") return query.token;
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

/**
 * Blocca ogni endpoint del wizard di primo avvio una volta completato
 * (§28), a prescindere dall'autenticazione: questi endpoint sono
 * deliberatamente senza login (il primo avvio non ha ancora utenti),
 * quindi vanno disattivati in modo permanente subito dopo, altrimenti
 * chiunque sulla LAN potrebbe rieseguire il setup più avanti.
 */
export async function requireSetupNotCompleted(
  _req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (isSetupCompleted()) {
    reply.code(409).send({ error: "already_completed", message: "Il setup iniziale è già stato completato" });
  }
}
