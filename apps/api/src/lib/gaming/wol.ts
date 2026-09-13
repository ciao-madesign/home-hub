import dgram from "node:dgram";

export class WolError extends Error {}

function parseMac(mac: string): Buffer {
  const clean = mac.replace(/[^0-9a-fA-F]/g, "");
  if (clean.length !== 12) throw new WolError("Indirizzo MAC non valido");
  return Buffer.from(clean, "hex");
}

/** Pacchetto magico Wake-on-LAN: 6 byte 0xFF seguiti dal MAC ripetuto 16 volte. */
export function buildMagicPacket(mac: string): Buffer {
  const macBuffer = parseMac(mac);
  const packet = Buffer.alloc(6 + 16 * 6);
  packet.fill(0xff, 0, 6);
  for (let i = 0; i < 16; i++) {
    macBuffer.copy(packet, 6 + i * 6);
  }
  return packet;
}

/** Invia il pacchetto Wake-on-LAN in broadcast UDP (§10 appendice Remote Gaming). */
export function sendWakeOnLan(
  mac: string,
  broadcastAddress = "255.255.255.255",
  port = 9,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let packet: Buffer;
    try {
      packet = buildMagicPacket(mac);
    } catch (err) {
      reject(err);
      return;
    }

    const socket = dgram.createSocket("udp4");
    socket.once("error", (err) => {
      socket.close();
      reject(err);
    });
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, 0, packet.length, port, broadcastAddress, (err) => {
        socket.close();
        if (err) reject(err);
        else resolve();
      });
    });
  });
}
