import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, mediaImageUrl, type MediaSummary } from "../api/client";
import { ServiceUnavailable } from "../components/ServiceUnavailable";
import { formatRuntime } from "../lib/format";

export function Movies() {
  const [movies, setMovies] = useState<MediaSummary[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listMovies()
      .then((res) => setMovies(res.movies))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 503) setUnavailable(true);
        else setError("Impossibile caricare la libreria Film.");
      });
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 20px" }}>Film</h1>

      {unavailable && <ServiceUnavailable service="Jellyfin" />}
      {error && <p style={{ color: "var(--status-problem)" }}>{error}</p>}

      {movies && movies.length === 0 && !unavailable && (
        <p style={{ color: "var(--text-faint)" }}>Nessun film in libreria.</p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 18,
        }}
      >
        {movies?.map((movie) => (
          <Link
            key={movie.id}
            to={`/film/${movie.id}`}
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
                src={mediaImageUrl(movie.id)}
                alt=""
                loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                }}
              />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{movie.title}</p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>
                {[movie.year, formatRuntime(movie.runtimeTicks)].filter(Boolean).join(" · ")}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
