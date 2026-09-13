import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, mediaImageUrl, type MediaSummary } from "../api/client";
import { ServiceUnavailable } from "../components/ServiceUnavailable";

export function Series() {
  const [series, setSeries] = useState<MediaSummary[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listSeries()
      .then((res) => setSeries(res.series))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 503) setUnavailable(true);
        else setError("Impossibile caricare la libreria Serie.");
      });
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 20px" }}>Serie</h1>

      {unavailable && <ServiceUnavailable service="Jellyfin" />}
      {error && <p style={{ color: "var(--status-problem)" }}>{error}</p>}

      {series && series.length === 0 && !unavailable && (
        <p style={{ color: "var(--text-faint)" }}>Nessuna serie in libreria.</p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 18,
        }}
      >
        {series?.map((item) => (
          <Link
            key={item.id}
            to={`/serie/${item.id}`}
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
          >
            <div
              style={{
                aspectRatio: "2 / 3",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
              }}
            >
              <img
                src={mediaImageUrl(item.id)}
                alt=""
                loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                }}
              />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{item.title}</p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>{item.year}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
