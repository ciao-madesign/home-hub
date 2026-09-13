import { useSystemStatus } from "../hooks/useSystemStatus";
import { StatusBadge } from "../components/StatusBadge";

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
    </div>
  );
}
