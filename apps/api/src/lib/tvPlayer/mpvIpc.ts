import { createConnection, type Socket } from "node:net";
import { EventEmitter } from "node:events";

export class MpvIpcError extends Error {}

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
}

/**
 * Client per l'IPC JSON di mpv (`--input-ipc-server`) su socket Unix:
 * comandi con `request_id` per la risposta puntuale, eventi
 * `property-change` per lo stato in tempo reale — la sessione li usa per
 * trasmettere posizione/pausa ai dispositivi di controllo senza fare
 * polling continuo del processo.
 */
export class MpvIpcClient extends EventEmitter {
  private socket: Socket | null = null;
  private buffer = "";
  private nextRequestId = 1;
  private pending = new Map<number, PendingRequest>();

  /** mpv crea il socket poco dopo l'avvio del processo: riprova finché non esiste. */
  connect(socketPath: string, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const attemptOnce = (): Promise<void> =>
      new Promise((resolve, reject) => {
        const socket = createConnection(socketPath);
        socket.once("connect", () => {
          socket.removeAllListeners("error");
          this.socket = socket;
          socket.on("data", (chunk) => this.onData(chunk));
          socket.on("close", () => this.emit("close"));
          socket.on("error", (err) => this.emit("socketError", err));
          resolve();
        });
        socket.once("error", (err) => {
          socket.destroy();
          reject(err);
        });
      });

    return new Promise((resolve, reject) => {
      const tryOnce = () => {
        attemptOnce()
          .then(resolve)
          .catch((err) => {
            if (Date.now() >= deadline) reject(err);
            else setTimeout(tryOnce, 100);
          });
      };
      tryOnce();
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line.trim()) continue;

      let message: Record<string, unknown>;
      try {
        message = JSON.parse(line);
      } catch {
        continue; // riga malformata, ignorata
      }

      const requestId = message.request_id;
      if (typeof requestId === "number" && this.pending.has(requestId)) {
        const pending = this.pending.get(requestId)!;
        this.pending.delete(requestId);
        if (message.error === "success") pending.resolve(message.data);
        else pending.reject(new MpvIpcError(String(message.error)));
      } else if (typeof message.event === "string") {
        this.emit(message.event, message);
      }
    }
  }

  /**
   * Timeout per comando: se mpv smette di rispondere (o il socket si
   * chiude mentre un comando è in volo, es. una `stop()` che corre in
   * parallelo a un `/api/tv/control`), la Promise deve comunque
   * risolversi prima o poi — altrimenti resta appesa per sempre insieme
   * alla richiesta HTTP che la sta aspettando.
   */
  command(args: unknown[], timeoutMs = 5000): Promise<unknown> {
    if (!this.socket) return Promise.reject(new MpvIpcError("Socket IPC non connesso"));
    const requestId = this.nextRequestId++;
    const payload = JSON.stringify({ command: args, request_id: requestId }) + "\n";

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pending.delete(requestId)) reject(new MpvIpcError("Timeout comando mpv"));
      }, timeoutMs);

      this.pending.set(requestId, {
        resolve: (data) => {
          clearTimeout(timeout);
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.socket!.write(payload, (err) => {
        if (err && this.pending.delete(requestId)) {
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  getProperty(name: string): Promise<unknown> {
    return this.command(["get_property", name]);
  }

  setProperty(name: string, value: unknown): Promise<unknown> {
    return this.command(["set_property", name, value]);
  }

  observeProperty(id: number, name: string): Promise<unknown> {
    return this.command(["observe_property", id, name]);
  }

  close(): void {
    this.socket?.end();
    this.socket = null;
    for (const pending of this.pending.values()) pending.reject(new MpvIpcError("Socket IPC chiuso"));
    this.pending.clear();
  }
}
