import { Link } from "react-router-dom";
import { useProfile } from "../context/ProfileContext";
import { useSystemStatus } from "../hooks/useSystemStatus";
import { StatusBadge } from "../components/StatusBadge";
import { NAV_ITEMS } from "../nav";

function HomeSection({ to, label, icon: SectionIcon }: (typeof NAV_ITEMS)[number]) {
  return (
    <Link
      to={to}
      style={{
        display: "block",
        padding: 20,
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        background: "var(--bg-card)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <SectionIcon style={{ color: "var(--accent-strong)" }} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>{label}</span>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-faint)" }}>
        Nessun contenuto disponibile ancora.
      </p>
    </Link>
  );
}

export function Home() {
  const { user } = useProfile();
  const { status } = useSystemStatus();
  const sections = NAV_ITEMS.filter((item) => item.to !== "/" && item.to !== "/sistema").sort(
    (a, b) => a.priority - b.priority,
  );

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px" }}>
        Bentornato, {user?.displayName ?? ""}
      </h1>
      <p style={{ color: "var(--text-muted)", margin: "0 0 24px" }}>
        Ecco lo stato del tuo Home Hub.
      </p>

      <section
        style={{
          marginBottom: 28,
          padding: 20,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Continua a guardare</h2>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-faint)" }}>
          Nessun contenuto in corso. Riprendi la visione di un film o di un episodio per vederlo
          qui.
        </p>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 14,
          marginBottom: 28,
        }}
      >
        {sections.map((item) => (
          <HomeSection key={item.to} {...item} />
        ))}
      </div>

      <Link
        to="/sistema"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 16,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>Stato sistema</span>
        <StatusBadge level={status?.level ?? null} />
      </Link>
    </div>
  );
}
