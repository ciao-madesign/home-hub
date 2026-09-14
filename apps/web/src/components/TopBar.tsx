import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile } from "../context/ProfileContext";
import { useSystemStatus } from "../hooks/useSystemStatus";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { StatusBadge } from "./StatusBadge";
import { IconLogOut, IconSearch } from "./icons";

export function TopBar() {
  const { user, session, logout } = useProfile();
  const { status } = useSystemStatus();
  const online = useOnlineStatus();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) navigate(`/cerca?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "12px 20px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-elevated)",
      }}
    >
      <form
        onSubmit={onSearchSubmit}
        style={{
          flex: 1,
          maxWidth: 480,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          padding: "8px 12px",
        }}
      >
        <IconSearch style={{ color: "var(--text-faint)", flexShrink: 0 }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca in Film, Serie, Foto, Musica, Giochi, File…"
          aria-label="Ricerca globale"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text)",
            fontSize: 14,
          }}
        />
      </form>

      <div style={{ flex: 1 }} />

      {!online && (
        <span
          style={{
            fontSize: 12,
            padding: "4px 10px",
            borderRadius: 999,
            background: "rgba(245, 158, 11, 0.12)",
            color: "var(--status-attention)",
            fontWeight: 600,
          }}
        >
          Offline
        </span>
      )}

      {session && (
        <span
          title={session.origin === "remote" ? "Connesso da fuori casa (accesso remoto)" : "Connesso sulla rete di casa"}
          style={{
            fontSize: 12,
            padding: "4px 10px",
            borderRadius: 999,
            background: session.origin === "remote" ? "rgba(99, 102, 241, 0.12)" : "var(--bg-hover)",
            color: session.origin === "remote" ? "var(--accent)" : "var(--text-faint)",
            fontWeight: 600,
          }}
        >
          {session.origin === "remote" ? "Remoto" : "Locale"}
        </span>
      )}

      <StatusBadge level={status?.level ?? null} />

      {user && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            aria-hidden
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: user.avatarColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              color: "#0a0b0d",
            }}
          >
            {user.displayName.slice(0, 1).toUpperCase()}
          </span>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{user.displayName}</span>
          <button
            onClick={() => logout()}
            aria-label="Cambia profilo"
            title="Cambia profilo"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-faint)",
              cursor: "pointer",
              display: "flex",
              padding: 6,
              borderRadius: "var(--radius-sm)",
            }}
          >
            <IconLogOut />
          </button>
        </div>
      )}
    </header>
  );
}
