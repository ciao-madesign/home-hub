import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useProfile } from "../context/ProfileContext";
import { useSystemStatus } from "../hooks/useSystemStatus";
import { StatusBadge } from "../components/StatusBadge";
import { NAV_ITEMS } from "../nav";
import { api, mediaImageUrl, type ContinueWatchingItem } from "../api/client";
import { formatProgressPercent } from "../lib/format";

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

function continueWatchingLink(item: ContinueWatchingItem): string {
  return item.itemType === "movie" ? `/film/${item.itemId}` : `/serie/episodi/${item.itemId}`;
}

function ContinueWatchingCard({ item }: { item: ContinueWatchingItem }) {
  const percent = formatProgressPercent(item.positionTicks, item.durationTicks);

  return (
    <Link
      to={continueWatchingLink(item)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: 160,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "relative",
          aspectRatio: "16 / 9",
          borderRadius: "var(--radius-sm)",
          overflow: "hidden",
          background: "var(--bg-hover)",
          border: "1px solid var(--border)",
        }}
      >
        {item.metadataAvailable && (
          <img
            src={mediaImageUrl(item.itemId)}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 4,
            background: "rgba(255,255,255,0.15)",
          }}
        >
          <div style={{ width: `${percent}%`, height: "100%", background: "var(--accent)" }} />
        </div>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.title ?? (item.metadataAvailable ? "Contenuto" : "Metadati non disponibili")}
      </p>
    </Link>
  );
}

export function Home() {
  const { user } = useProfile();
  const { status } = useSystemStatus();
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>([]);
  const sections = NAV_ITEMS.filter((item) => item.to !== "/" && item.to !== "/sistema").sort(
    (a, b) => a.priority - b.priority,
  );

  useEffect(() => {
    api
      .continueWatching()
      .then((res) => setContinueWatching(res.items))
      .catch(() => setContinueWatching([]));
  }, []);

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
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 14px" }}>Continua a guardare</h2>
        {continueWatching.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-faint)" }}>
            Nessun contenuto in corso. Riprendi la visione di un film o di un episodio per vederlo
            qui.
          </p>
        ) : (
          <div style={{ display: "flex", gap: 14, overflowX: "auto" }} className="scrollbar-thin">
            {continueWatching.map((item) => (
              <ContinueWatchingCard key={item.itemId} item={item} />
            ))}
          </div>
        )}
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
