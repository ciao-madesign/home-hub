import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";
import { logSystemEvent } from "./systemEvents.js";

const execFileAsync = promisify(execFile);

export class UpdateError extends Error {
  constructor(
    message: string,
    public code: "not_available" | "already_updated" | "build_failed" = "not_available",
  ) {
    super(message);
  }
}

function isCommandNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(config.gitPath, args, { cwd: config.repoRoot });
  return stdout.trim();
}

export interface UpdateCommit {
  hash: string;
  message: string;
}

export interface UpdateStatus {
  /** false se `git` manca o questa cartella non è un checkout git (§31: degrado esplicito, mai un errore fatale). */
  available: boolean;
  currentCommit: string | null;
  remoteCommit: string | null;
  behindCount: number;
  commits: UpdateCommit[];
}

/**
 * Aggiornamenti dell'Hub autorizzati dalla Web App (§33). "Behind" è
 * calcolato dopo un `git fetch` reale (non dalla copia locale
 * dell'ultimo fetch, che potrebbe essere vecchia) — chiamata quindi mai
 * su un percorso ad alta frequenza, solo quando l'admin apre la sezione
 * o preme "controlla aggiornamenti".
 */
export async function checkForUpdates(): Promise<UpdateStatus> {
  const empty: UpdateStatus = {
    available: false,
    currentCommit: null,
    remoteCommit: null,
    behindCount: 0,
    commits: [],
  };

  try {
    await git(["fetch", "origin", config.updateBranch]);
  } catch (err) {
    if (isCommandNotFound(err)) return empty;
    throw err; // repo git presente ma comando fallito per altro motivo: errore reale, non "non disponibile"
  }

  const currentCommit = await git(["rev-parse", "HEAD"]);
  const remoteCommit = await git(["rev-parse", `origin/${config.updateBranch}`]);
  if (currentCommit === remoteCommit) {
    return { available: true, currentCommit, remoteCommit, behindCount: 0, commits: [] };
  }

  const log = await git(["log", `HEAD..origin/${config.updateBranch}`, "--pretty=format:%H%x09%s"]);
  const commits = log
    .split("\n")
    .filter(Boolean)
    .map((line): UpdateCommit => {
      const [hash, message] = line.split("\t");
      return { hash, message };
    });

  return { available: true, currentCommit, remoteCommit, behindCount: commits.length, commits };
}

export interface ApplyUpdateResult {
  updatedTo: string;
  restartTriggered: boolean;
}

/**
 * Applica l'aggiornamento: fast-forward (mai un merge/rebase automatico
 * su modifiche locali impreviste, §26), poi dipendenze e build. Il
 * riavvio del servizio (e la ricostruzione dei container Docker) NON
 * viene atteso: il processo dell'Hub API può essere terminato da systemd
 * a metà della stessa chiamata che lo ha richiesto, non c'è una risposta
 * HTTP sensata da aspettare — la disconnessione stessa, seguita dal
 * servizio che torna raggiungibile, è la conferma per chi ha premuto il
 * pulsante (stesso principio già usato per lo spegnimento, §34).
 */
export async function applyUpdate(): Promise<ApplyUpdateResult> {
  const status = await checkForUpdates();
  if (!status.available) throw new UpdateError("Aggiornamenti non disponibili (git assente)", "not_available");
  if (status.behindCount === 0) throw new UpdateError("Già aggiornato all'ultima versione", "already_updated");

  logSystemEvent(
    "info",
    "update",
    `Aggiornamento avviato: ${status.currentCommit!.slice(0, 7)} → ${status.remoteCommit!.slice(0, 7)} (${status.behindCount} commit).`,
  );

  await git(["merge", "--ff-only", `origin/${config.updateBranch}`]);

  try {
    await execFileAsync(config.npmPath, ["install"], { cwd: config.repoRoot });
    await execFileAsync(config.npmPath, ["run", "build"], { cwd: config.repoRoot });
  } catch (err) {
    const message = `Build fallita dopo l'aggiornamento del codice: ${(err as Error).message}`;
    logSystemEvent("critical", "update", message);
    throw new UpdateError(message, "build_failed");
  }

  const restartArgs = [...(JSON.parse(config.updateRestartArgsJson) as string[])];
  execFileAsync(config.updateRestartCommand, restartArgs).catch((err) => {
    logSystemEvent("critical", "update", `Riavvio dopo l'aggiornamento non riuscito: ${(err as Error).message}`);
  });

  // Ricostruzione dei container Docker (Web App/Jellyfin/Immich), se
  // presenti — stesso principio: non è questa richiesta a doverne
  // attendere l'esito. Riusa la stessa capacità Docker già richiesta per
  // il watchdog dei servizi (§31), nessun privilegio aggiuntivo.
  execFileAsync(config.dockerPath, ["compose", "-f", config.hubConfigPaths.dockerCompose, "up", "-d", "--build"]).catch(
    (err) => {
      logSystemEvent("critical", "update", `Ricostruzione dei container dopo l'aggiornamento non riuscita: ${(err as Error).message}`);
    },
  );

  return { updatedTo: status.remoteCommit!, restartTriggered: true };
}
