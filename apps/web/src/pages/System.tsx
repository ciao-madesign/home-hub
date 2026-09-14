import { useCallback, useEffect, useState } from "react";
import { useSystemStatus } from "../hooks/useSystemStatus";
import { StatusBadge } from "../components/StatusBadge";
import { QrCode } from "../components/QrCode";
import { useProfile } from "../context/ProfileContext";
import { api, ApiError, type LocalNetworkInfo, type WifiNetwork, type WifiStatus } from "../api/client";

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  const gb = bytes / 1024 ** 3;
  return `${gb.toFixed(1)} GB`;
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        background: "var(--bg-card)",
      }}
    >
      <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--text-faint)" }}>{label}</p>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{value}</p>
      {sub && <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{sub}</p>}
    </div>
  );
}

function WifiPanel() {
  const [status, setStatus] = useState<WifiStatus | null>(null);
  const [networks, setNetworks] = useState<WifiNetwork[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [selectedSsid, setSelectedSsid] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = useCallback(() => {
    api.getWifiStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleScan() {
    setScanning(true);
    setMessage(null);
    try {
      const res = await api.scanWifi();
      setNetworks(res.networks);
    } catch {
      setMessage("Scansione non riuscita.");
    } finally {
      setScanning(false);
    }
  }

  async function handleConnect(ssid: string) {
    setConnecting(ssid);
    setMessage(null);
    try {
      await api.connectWifi(ssid, password || null);
      setMessage(`Connesso a "${ssid}".`);
      setSelectedSsid(null);
      setPassword("");
      loadStatus();
    } catch (err) {
      setMessage(err instanceof ApiError ? "Connessione non riuscita." : "Errore imprevisto.");
    } finally {
      setConnecting(null);
    }
  }

  if (status && !status.available) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-faint)" }}>
        Gestione Wi-Fi non disponibile su questo sistema (richiede NetworkManager). Per il WPS: premi il pulsante
        sul router, poi ricarica questa pagina per rilevare la connessione.
      </p>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 10px" }}>
        {status?.connectedSsid ? `Connesso a "${status.connectedSsid}".` : "Non connesso a nessuna rete Wi-Fi."}{" "}
        Per il WPS: premi il pulsante sul router, poi{" "}
        <button
          onClick={loadStatus}
          style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, font: "inherit" }}
        >
          aggiorna lo stato
        </button>
        .
      </p>

      <button
        onClick={handleScan}
        disabled={scanning}
        style={{
          padding: "8px 14px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          background: "transparent",
          color: "var(--text)",
          fontSize: 13,
          cursor: "pointer",
          marginBottom: 10,
        }}
      >
        {scanning ? "Scansione…" : "Cerca reti"}
      </button>

      {message && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{message}</p>}

      {networks && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {networks.length === 0 && <p style={{ fontSize: 13, color: "var(--text-faint)" }}>Nessuna rete trovata.</p>}
          {networks.map((n) => (
            <div key={n.ssid}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-card)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
                onClick={() => setSelectedSsid(selectedSsid === n.ssid ? null : n.ssid)}
              >
                <span>
                  {n.ssid} {n.secured ? "🔒" : ""}
                </span>
                <span style={{ color: "var(--text-faint)" }}>{n.signal}%</span>
              </div>
              {selectedSsid === n.ssid && (
                <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 4 }}>
                  {n.secured && (
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                        background: "var(--bg-card)",
                        color: "var(--text)",
                        fontSize: 13,
                      }}
                    />
                  )}
                  <button
                    onClick={() => handleConnect(n.ssid)}
                    disabled={connecting === n.ssid}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "var(--radius-sm)",
                      border: "none",
                      background: "var(--accent)",
                      color: "white",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {connecting === n.ssid ? "Connessione…" : "Connetti"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NetworkSection() {
  const { user } = useProfile();
  const [info, setInfo] = useState<LocalNetworkInfo | null>(null);

  useEffect(() => {
    api.getNetworkInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Rete</h2>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: user?.role === "admin" ? 20 : 0 }}>
        {info?.primaryUrl && <QrCode value={info.primaryUrl} size={120} />}
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {info?.mdnsUrl && (
            <p style={{ margin: "0 0 4px" }}>
              Indirizzo locale: <strong>{info.mdnsUrl}</strong>
            </p>
          )}
          {!info?.mdnsUrl && (
            <p style={{ margin: "0 0 4px", color: "var(--text-faint)" }}>Discovery .local non disponibile.</p>
          )}
          {info?.ips.map((ip) => (
            <p key={ip} style={{ margin: "0 0 2px" }}>
              IP: {ip}
            </p>
          ))}
        </div>
      </div>

      {user?.role === "admin" && (
        <div
          style={{
            padding: 16,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
          }}
        >
          <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>Wi-Fi</p>
          <WifiPanel />
        </div>
      )}
    </div>
  );
}

export function System() {
  const { status, error } = useSystemStatus(5000);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Sistema</h1>
        <StatusBadge level={status?.level ?? null} />
      </div>

      {error && (
        <p style={{ color: "var(--status-problem)", marginBottom: 16 }}>{error}</p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: 28,
        }}
      >
        <MetricCard
          label="CPU (load 1m)"
          value={status ? status.cpu.loadAvg1m.toFixed(2) : "—"}
          sub={status ? `${status.cpu.cores} core` : undefined}
        />
        <MetricCard
          label="Memoria"
          value={status ? `${status.memory.usedPercent.toFixed(0)}%` : "—"}
          sub={status ? `${formatBytes(status.memory.freeBytes)} libera` : undefined}
        />
        <MetricCard
          label="Storage dati"
          value={status?.disk.freePercent !== undefined && status?.disk.freePercent !== null
            ? `${status.disk.freePercent.toFixed(0)}% libero`
            : "—"}
          sub={status ? formatBytes(status.disk.freeBytes) : undefined}
        />
        <MetricCard
          label="Temperatura"
          value={status?.temperatureCelsius !== null && status?.temperatureCelsius !== undefined
            ? `${status.temperatureCelsius.toFixed(0)}°C`
            : "N/D"}
        />
        <MetricCard
          label="Uptime"
          value={status ? `${Math.floor(status.uptimeSeconds / 3600)} h` : "—"}
        />
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Servizi</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {status?.services.map((service) => (
          <div
            key={service.name}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
            }}
          >
            <span style={{ fontSize: 14, textTransform: "capitalize" }}>{service.name}</span>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {!service.configured
                ? "Non configurato"
                : service.reachable
                  ? "Attivo"
                  : "Non disponibile"}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28 }}>
        <NetworkSection />
      </div>
    </div>
  );
}
