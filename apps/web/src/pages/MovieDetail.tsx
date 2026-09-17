import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, mediaImageUrl, type MovieDetail as MovieDetailDto, type ResumeInfo } from "../api/client";
import { PlayOnTvButton } from "../components/PlayOnTvButton";
import { ServiceUnavailable } from "../components/ServiceUnavailable";
import { VideoPlayer } from "../components/VideoPlayer";
import { formatRuntime } from "../lib/format";

export function MovieDetail() {
  const { id = "" } = useParams();
  const [movie, setMovie] = useState<MovieDetailDto | null>(null);
  const [resume, setResume] = useState<ResumeInfo | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setPlaying(false);
    api
      .getMovie(id)
      .then((res) => {
        setMovie(res.movie);
        setResume(res.resume);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 503) setUnavailable(true);
        else if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
  }, [id]);

  if (unavailable) return <ServiceUnavailable service="Jellyfin" />;
  if (notFound) return <p style={{ color: "var(--text-muted)" }}>Film non trovato.</p>;
  if (!movie) return <p style={{ color: "var(--text-faint)" }}>Caricamento…</p>;

  return (
    <div>
      <Link to="/film" style={{ fontSize: 13, color: "var(--text-faint)" }}>
        ← Torna a Film
      </Link>

      <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 220px" }}>
          <img
            src={mediaImageUrl(movie.id)}
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
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px" }}>{movie.title}</h1>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-faint)" }}>
            {[movie.year, formatRuntime(movie.runtimeTicks), movie.genres.join(", ")]
              .filter(Boolean)
              .join(" · ")}
            {movie.communityRating ? ` · ★ ${movie.communityRating.toFixed(1)}` : ""}
          </p>

          {movie.overview && (
            <p style={{ color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 560 }}>
              {movie.overview}
            </p>
          )}

          {!playing && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => setPlaying(true)}
                style={{
                  marginTop: 12,
                  padding: "10px 20px",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  background: "var(--accent)",
                  color: "white",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {resume ? "Riprendi" : "Riproduci"}
              </button>
              <PlayOnTvButton itemId={movie.id} itemType="movie" style={{ marginTop: 12 }} />
            </div>
          )}
        </div>
      </div>

      {playing && (
        <div style={{ marginTop: 24, maxWidth: 960 }}>
          <VideoPlayer
            itemId={movie.id}
            itemType="movie"
            mediaSourceId={movie.mediaSourceId}
            resume={resume}
            audioTracks={movie.audioTracks}
          />
        </div>
      )}
    </div>
  );
}
