import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  createGame,
  createMachine,
  deleteGame,
  deleteMachine,
  GamingError,
  getGame,
  getMachine,
  listGames,
  listMachines,
  listSaveBackups,
  toGameDto,
  toMachineDto,
  toSaveBackupDto,
  updateGame,
} from "../lib/gaming/store.js";
import { scanForNewGames } from "../lib/gaming/scan.js";
import { isRunning, launchLocal, stopLocal, EmulatorError } from "../lib/gaming/emulator.js";
import { probeTcp } from "../lib/gaming/machineStatus.js";
import { resolveExecutionMachine } from "../lib/gaming/autoSelect.js";
import { sendWakeOnLan, WolError } from "../lib/gaming/wol.js";
import { backupSave } from "../lib/gaming/saveBackup.js";
import { assertSafeRelativePath, UnsafePathError } from "../lib/pathSafety.js";
import { absOnDisk, pickWriteDisk, resolveAcrossDisks } from "../lib/storage/library.js";
import { requireAuth } from "../plugins/auth.js";

function handleGamingError(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof GamingError) {
    reply.code(err.code === "conflict" ? 409 : 404).send({ error: err.code, message: err.message });
    return true;
  }
  if (err instanceof EmulatorError) {
    reply.code(409).send({ error: "emulator_error", message: err.message });
    return true;
  }
  if (err instanceof WolError) {
    reply.code(400).send({ error: "invalid_mac", message: err.message });
    return true;
  }
  return false;
}

const createGameSchema = z.object({
  title: z.string().min(1),
  platform: z.string().min(1),
  romPath: z.string().nullable().default(null),
  savePath: z.string().nullable().default(null),
  executionMachineId: z.string().nullable().default(null),
});

const updateGameSchema = createGameSchema.partial();

const createMachineSchema = z.object({
  name: z.string().min(1),
  macAddress: z.string().nullable().default(null),
  host: z.string().nullable().default(null),
  port: z.number().int().positive().nullable().default(null),
  agentUrl: z.string().url().nullable().default(null),
});

/**
 * Gaming (§10): catalogo centralizzato, importazione da cartelle
 * monitorate, esecuzione locale (emulatori retro) o su PC remoto
 * (Wake-on-LAN + probe di stato — l'avvio effettivo della sessione
 * Sunshine/Moonlight resta fuori dall'Hub, vedi docs/SPECIFICHE.md).
 */
export async function gamingRoutes(app: FastifyInstance) {
  app.get("/api/games", { preHandler: requireAuth }, async () => {
    return { games: listGames().map(toGameDto) };
  });

  app.get("/api/games/scan", { preHandler: requireAuth }, async () => {
    return { candidates: await scanForNewGames() };
  });

  app.post("/api/games", { preHandler: requireAuth }, async (req, reply) => {
    const body = createGameSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });

    const game = createGame({
      title: body.data.title,
      platform: body.data.platform,
      romPath: body.data.romPath,
      coverPath: null,
      savePath: body.data.savePath,
      executionMachineId: body.data.executionMachineId,
    });
    return { game: toGameDto(game) };
  });

  app.get("/api/games/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const game = getGame(id);
    if (!game) return reply.code(404).send({ error: "not_found" });
    return {
      game: toGameDto(game),
      saves: listSaveBackups(id).map(toSaveBackupDto),
      running: isRunning(id),
    };
  });

  app.patch("/api/games/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateGameSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
    if (!getGame(id)) return reply.code(404).send({ error: "not_found" });

    updateGame(id, {
      title: body.data.title,
      platform: body.data.platform,
      rom_path: body.data.romPath,
      save_path: body.data.savePath,
      execution_machine_id: body.data.executionMachineId,
    });
    return { game: toGameDto(getGame(id)!) };
  });

  app.delete("/api/games/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (isRunning(id)) return reply.code(409).send({ error: "conflict", message: "Il gioco è in esecuzione" });
    deleteGame(id);
    return { ok: true };
  });

  app.post("/api/games/import", { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({ romPath: z.string().min(1), title: z.string().min(1), platform: z.string().min(1) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });

    const game = createGame({
      title: body.data.title,
      platform: body.data.platform,
      romPath: body.data.romPath,
      coverPath: null,
      savePath: null,
      executionMachineId: null,
    });
    return { game: toGameDto(game) };
  });

  app.get("/api/games/:id/cover", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const game = getGame(id);
    if (!game?.cover_path) return reply.code(404).send();
    try {
      const found = await resolveAcrossDisks("Games", assertSafeRelativePath(game.cover_path));
      if (!found) return reply.code(404).send();
      reply.header("cache-control", "public, max-age=86400");
      return reply.send(fsSync.createReadStream(found.abs));
    } catch (err) {
      if (err instanceof UnsafePathError) return reply.code(400).send();
      throw err;
    }
  });

  app.post("/api/games/:id/cover", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const game = getGame(id);
    if (!game) return reply.code(404).send({ error: "not_found" });

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "invalid_body", message: "Immagine mancante" });

    const disk = await pickWriteDisk();
    const ext = path.extname(file.filename) || ".jpg";
    const relPath = `.covers/${id}${ext}`;
    const abs = absOnDisk(disk, "Games", [relPath]);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, await file.toBuffer());

    updateGame(id, { cover_path: relPath });
    return { game: toGameDto(getGame(id)!) };
  });

  app.post("/api/games/:id/launch", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const game = getGame(id);
    if (!game) return reply.code(404).send({ error: "not_found" });

    // Assegnazione esplicita dell'utente vince sempre; senza, l'Hub sceglie
    // da sé in base alla piattaforma e alla disponibilità (§10, autoSelect.ts).
    const machine = game.execution_machine_id
      ? getMachine(game.execution_machine_id)
      : await resolveExecutionMachine(game.platform);
    if (!machine) return reply.code(409).send({ error: "conflict", message: "Macchina di esecuzione non configurata" });

    try {
      if (machine.kind === "local") {
        if (!game.rom_path) {
          return reply.code(409).send({ error: "conflict", message: "Nessuna ROM configurata per questo gioco" });
        }
        const found = await resolveAcrossDisks("Games", assertSafeRelativePath(game.rom_path));
        if (!found) return reply.code(409).send({ error: "conflict", message: "ROM non trovata su nessun disco" });
        launchLocal(id, game.platform, found.abs);
        return { mode: "local", started: true, machineId: machine.id, machineName: machine.name };
      }

      // PC remoto (§10 appendice): l'Hub sveglia e verifica lo stato; l'avvio
      // della sessione Sunshine/Moonlight vera e propria resta fuori
      // dall'Hub in questa fase (vedi docs/SPECIFICHE.md, proposte aperte).
      if (!machine.host || !machine.port) {
        return reply.code(409).send({ error: "conflict", message: "Macchina remota non configurata (host/porta mancanti)" });
      }
      const online = await probeTcp(machine.host, machine.port);
      if (online) {
        return { mode: "remote", machineOnline: true, wolSent: false, machineId: machine.id, machineName: machine.name };
      }

      if (!machine.mac_address) {
        return reply.code(409).send({ error: "conflict", message: "MAC address mancante: impossibile inviare Wake-on-LAN" });
      }
      await sendWakeOnLan(machine.mac_address);
      return { mode: "remote", machineOnline: false, wolSent: true, machineId: machine.id, machineName: machine.name };
    } catch (err) {
      if (err instanceof UnsafePathError) return reply.code(400).send({ error: "invalid_path" });
      if (handleGamingError(err, reply)) return;
      throw err;
    }
  });

  app.post("/api/games/:id/stop", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      stopLocal(id);
      return { ok: true };
    } catch (err) {
      if (handleGamingError(err, reply)) return;
      throw err;
    }
  });

  app.post("/api/games/:id/backup-save", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const backup = await backupSave(id);
      return { backup };
    } catch (err) {
      if (handleGamingError(err, reply)) return;
      throw err;
    }
  });

  // --- Macchine ------------------------------------------------------------

  app.get("/api/machines", { preHandler: requireAuth }, async () => {
    return { machines: listMachines().map(toMachineDto) };
  });

  app.post("/api/machines", { preHandler: requireAuth }, async (req, reply) => {
    const body = createMachineSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
    const machine = createMachine(body.data.name, body.data.macAddress, body.data.host, body.data.port, body.data.agentUrl);
    return { machine: toMachineDto(machine) };
  });

  app.delete("/api/machines/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      deleteMachine(id);
      return { ok: true };
    } catch (err) {
      if (handleGamingError(err, reply)) return;
      throw err;
    }
  });

  app.post("/api/machines/:id/wake", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const machine = getMachine(id);
    if (!machine) return reply.code(404).send({ error: "not_found" });
    if (!machine.mac_address) {
      return reply.code(409).send({ error: "conflict", message: "MAC address non configurato" });
    }
    try {
      await sendWakeOnLan(machine.mac_address);
      return { ok: true };
    } catch (err) {
      if (handleGamingError(err, reply)) return;
      throw err;
    }
  });

  app.get("/api/machines/:id/status", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const machine = getMachine(id);
    if (!machine) return reply.code(404).send({ error: "not_found" });
    if (machine.kind === "local") return { online: true };
    if (!machine.host || !machine.port) return { online: false };
    return { online: await probeTcp(machine.host, machine.port) };
  });

  app.post("/api/machines/:id/shutdown", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const machine = getMachine(id);
    if (!machine) return reply.code(404).send({ error: "not_found" });

    // Spegnimento remoto sicuro (§10 appendice) senza memorizzare
    // credenziali del PC remoto (§26): richiede un agente HTTP configurato
    // sulla macchina stessa, che gestisce la propria autorizzazione locale.
    const agentUrl = machine.agent_url;
    if (!agentUrl) {
      return reply
        .code(409)
        .send({ error: "conflict", message: "Nessun agente di spegnimento configurato per questa macchina" });
    }
    try {
      const res = await fetch(`${agentUrl.replace(/\/+$/, "")}/shutdown`, { method: "POST" });
      if (!res.ok) return reply.code(502).send({ error: "agent_error", message: `Agente ha risposto ${res.status}` });
      return { ok: true };
    } catch (err) {
      return reply.code(502).send({ error: "agent_unreachable", message: (err as Error).message });
    }
  });
}
