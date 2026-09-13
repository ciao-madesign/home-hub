import net from "node:net";
import { config } from "../../config.js";

/** Verifica stato online/offline di un PC remoto (§10 appendice) via probe TCP sulla porta configurata. */
export function probeTcp(
  host: string,
  port: number,
  timeoutMs = config.machineProbeTimeoutMs,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    function finish(result: boolean): void {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    }

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}
