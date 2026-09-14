import { spawn } from "node:child_process";
import path from "node:path";
import { config } from "../../config.js";
import type { EngineCallbacks, EngineHandle } from "./types.js";

/**
 * Motore per i download "normali" da URL (§12), usando yt-dlp come da
 * decisione in docs/EXTERNAL_TOOLS.md. Pausa/ripresa avvengono con
 * SIGSTOP/SIGCONT: lo stesso processo resta vivo, nessuna riesecuzione.
 *
 * `maxRateKbps` è deciso dal chiamante (vedi lib/priority.ts, §32) invece
 * di leggere `config.downloadMaxRateKbps` qui direttamente: yt-dlp non
 * supporta un cambio di `--limit-rate` a caldo su un processo già avviato
 * (a differenza di WebTorrent, vedi torrent.ts), quindi la priorità
 * dinamica per un download da URL può applicarsi solo al lancio del
 * processo — resta fissa per tutta la vita di quel download, anche
 * attraverso una pausa/ripresa (limitazione nota, documentata in
 * docs/SPECIFICHE.md).
 */
export function startYtDlpDownload(
  source: string,
  destDir: string,
  callbacks: EngineCallbacks,
  maxRateKbps: number,
): EngineHandle {
  const args = [
    source,
    "--newline",
    "--no-colors",
    "--no-playlist",
    "-o",
    path.join(destDir, "%(title)s.%(ext)s"),
  ];
  if (maxRateKbps > 0) {
    args.push("--limit-rate", `${maxRateKbps}K`);
  }

  const proc = spawn(config.ytdlpPath, args, { stdio: ["ignore", "pipe", "pipe"] });

  let stdoutBuffer = "";
  let stderrTail = "";

  proc.stdout.on("data", (chunk: Buffer) => {
    stdoutBuffer += chunk.toString();
    let newlineIndex: number;
    while ((newlineIndex = stdoutBuffer.indexOf("\n")) >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex);
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      parseLine(line);
    }
  });

  proc.stderr.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-2000);
  });

  function parseLine(line: string): void {
    const destinationMatch = line.match(/^\[download\] Destination: (.+)$/);
    if (destinationMatch) {
      callbacks.onTitle(path.basename(destinationMatch[1]));
      return;
    }

    const alreadyMatch = line.match(/^\[download\] (.+) has already been downloaded$/);
    if (alreadyMatch) {
      callbacks.onTitle(path.basename(alreadyMatch[1]));
      callbacks.onProgress(100, null, null, null);
      return;
    }

    const progressMatch = line.match(
      /^\[download\]\s+(\d+(?:\.\d+)?)% of\s+~?\s*([\d.]+)(KiB|MiB|GiB) at\s+([\d.]+)(KiB|MiB|GiB)\/s/,
    );
    if (progressMatch) {
      const percent = Number(progressMatch[1]);
      const totalBytes = toBytes(Number(progressMatch[2]), progressMatch[3]);
      const speedBytesPerSec = toBytes(Number(progressMatch[4]), progressMatch[5]);
      callbacks.onProgress(
        percent,
        Math.round((totalBytes * percent) / 100),
        totalBytes,
        speedBytesPerSec,
      );
    }
  }

  proc.on("close", (code) => {
    // La distinzione tra "annullato", "errore" e "completato" spetta a chi
    // orchestra (manager.ts): qui riportiamo fedelmente solo l'esito del processo.
    if (code === 0) {
      callbacks.onDone(null);
    } else {
      const lastLine = stderrTail.trim().split("\n").filter(Boolean).pop();
      callbacks.onDone(new Error(lastLine || `yt-dlp uscito con codice ${code}`));
    }
  });

  return {
    pause() {
      if (proc.pid) process.kill(proc.pid, "SIGSTOP");
    },
    resume() {
      if (proc.pid) process.kill(proc.pid, "SIGCONT");
    },
    cancel() {
      proc.kill("SIGKILL");
    },
  };
}

function toBytes(value: number, unit: string): number {
  const multiplier = unit === "GiB" ? 1024 ** 3 : unit === "MiB" ? 1024 ** 2 : 1024;
  return value * multiplier;
}
