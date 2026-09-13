import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  ApiError,
  mediaImageUrl,
  type EpisodeSummary,
  type MediaSummary,
  type SeasonSummary,
} from "../api/client";
import { ServiceUnavailable } from "../components/ServiceUnavailable";

export function SeriesDetail() {
  const { id = "" } = useParams();
  const [series, setSeries] = useState<MediaSummary | null>(null);
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeSummary[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api
      .getSeries(id)
      .then((res) => {
        setSeries(res.series);
        setSeasons(res.seasons);
        setSelectedSeasonId(res.seasons[0]?.id ?? null);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 503) setUnavailable(true);
        else if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
  }, [id]);

  useEffect(() => {
    if (!selectedSeasonId) return;
    setEpisodes(null);
    api
      .listEpisodes(id, selectedSeasonId)
      .then((res) => setEpisodes(res.episodes))
      .catch(() => setEpisodes([]));
  }, [id, selectedSeasonId]);

  if (unavailable) return <ServiceUnavailable service="Jellyfin" />;
  if (notFound) return <p style={{ color: "var(--text-muted)" }}>Serie non trovata.</p>;
  if (!series) return <p style={{ color: "var(--text-faint)" }}>Caricamento…</p>;

  return (
    <div>
      <Link to="/serie" style={{ fontSize: 13, color: "var(--text-faint)" }}>
        ← Torna a Serie
      </Link>

      <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 200px" }}>
          <img
            src={mediaImageUrl(series.id)}
            alt=""
            style={{
              width: "100%",
              aspectRatio: "2 / 3",
              objectFit: "cover",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
            }}
          />
        </div>

        <div style={{ flex: "1 1 420px", minWidth: 280 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px" }}>{series.title}</h1>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-faint)" }}>
            {[series.year, series.genres.join(", ")].filter(Boolean).join(" · ")}
            {series.communityRating ? ` · ★ ${series.communityRating.toFixed(1)}` : ""}
          </p>
          {series.overview && (
            <p style={{ color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 560 }}>
              {series.overview}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 28, marginBottom: 16, flexWrap: "wrap" }}>
        {seasons.map((season) => (
          <button
            key={season.id}
            onClick={() => setSelectedSeasonId(season.id)}
            style={{
              padding: "8px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: selectedSeasonId === season.id ? "var(--accent)" : "var(--bg-card)",
              color: selectedSeasonId === season.id ? "white" : "var(--text)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {season.name}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {episodes?.map((episode) => (
          <Link
            key={episode.id}
            to={`/serie/episodi/${episode.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: 14,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
            }}
          >
            <span
              style={{
                width: 28,
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-faint)",
                flexShrink: 0,
              }}
            >
              {episode.indexNumber ?? "–"}
            </span>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{episode.title}</p>
              {episode.overview && (
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: 12,
                    color: "var(--text-faint)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {episode.overview}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
