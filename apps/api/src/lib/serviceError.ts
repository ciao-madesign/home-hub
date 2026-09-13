import type { FastifyReply } from "fastify";
import { JellyfinError } from "./jellyfin.js";
import { ImmichError } from "./immich.js";

/**
 * Se un backend interno non è raggiungibile, la sezione resta visibile ma
 * segnalata come temporaneamente indisponibile (§31) — non un errore fatale.
 */
export function handleServiceError(err: unknown, service: string, reply: FastifyReply): boolean {
  if (err instanceof JellyfinError || err instanceof ImmichError) {
    reply.code(503).send({ error: "service_unavailable", service });
    return true;
  }
  return false;
}
