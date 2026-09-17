import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  ApiError,
  type EpisodeDetail as EpisodeDetailDto,
  type EpisodeSummary,
  type ResumeInfo,
} from "../api/client";
import { PlayOnTvButton } from "../components/PlayOnTvButton";
import { ServiceUnavailable } from "../components/ServiceUnavailable";
import { VideoPlayer } from "../components/VideoPlayer";

export function EpisodeDetail() {
  const { episodeId = "" } = useParams();
  const navigate = useNavigate();

  const [episode, setEpisode] = useState<EpisodeDetailDto | null>(null);
  const [resume, setResume] = useState<ResumeInfo | null>(null);
  const [nextEpisode, setNextEpisode] = useState<EpisodeSummary | null>(null);
  const [showNextPrompt, setShowNextPrompt] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setShowNextPrompt(false);
    setNextEpisode(null);
    api
      .getEpisode(episodeId)
      .then(async (res) => {
        setEpisode(res.episode);
        setResume(res.resume);

        if (res.episode.seriesId && res.episode.seasonId) {
          const { episodes } = await api.listEpisodes(res.episode.seriesId, res.episode.seasonId);
          const index = episodes.findIndex((e) => e.id === episodeId);
          if (index >= 0 && index + 1 < episodes.length) setNextEpisode(episodes[index + 1]);
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 503) setUnavailable(true);
        else if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
  }, [episodeId]);

  if (unavailable) return <ServiceUnavailable service="Jellyfin" />;
  if (notFound) return <p style={{ color: "var(--text-muted)" }}>Episodio non trovato.</p>;
  if (!episode) return <p style={{ color: "var(--text-faint)" }}>Caricamento…</p>;

  return (
    <div>
      {episode.seriesId && (
        <Link to={`/serie/${episode.seriesId}`} style={{ fontSize: 13, color: "var(--text-faint)" }}>
          ← {episode.seriesName ?? "Torna alla serie"}
        </Link>
      )}

      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "12px 0 4px" }}>
        {episode.indexNumber ? `${episode.indexNumber}. ` : ""}
        {episode.title}
      </h1>
      {episode.overview && (
        <p style={{ color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 640, marginBottom: 12 }}>
          {episode.overview}
        </p>
      )}
      <PlayOnTvButton
        itemId={episode.id}
        itemType="episode"
        style={{ marginBottom: 16, padding: "8px 16px", fontSize: 13 }}
      />

      <div style={{ position: "relative", maxWidth: 960 }}>
        <VideoPlayer
          key={episode.id}
          itemId={episode.id}
          itemType="episode"
          mediaSourceId={episode.mediaSourceId}
          resume={resume}
          audioTracks={episode.audioTracks}
          onEnded={() => {
            if (nextEpisode) setShowNextPrompt(true);
          }}
        />

        {showNextPrompt && nextEpisode && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(10, 11, 13, 0.85)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              borderRadius: "var(--radius-md)",
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>Prossimo episodio</p>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
              {nextEpisode.indexNumber ? `${nextEpisode.indexNumber}. ` : ""}
              {nextEpisode.title}
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button
                onClick={() => setShowNextPrompt(false)}
                style={{
                  padding: "9px 16px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                Annulla
              </button>
              <button
                onClick={() => navigate(`/serie/episodi/${nextEpisode.id}`)}
                style={{
                  padding: "9px 20px",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  background: "var(--accent)",
                  color: "white",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Riproduci
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
