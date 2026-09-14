import { useEffect, useRef, useState } from "react";
import { api, mediaStreamUrl, TICKS_PER_SECOND, type AudioTrackInfo, type ResumeInfo } from "../api/client";

const PROGRESS_REPORT_INTERVAL_MS = 10000;

interface VideoPlayerProps {
  itemId: string;
  itemType: "movie" | "episode";
  mediaSourceId: string | null;
  resume: ResumeInfo | null;
  audioTracks?: AudioTrackInfo[];
  onEnded?: () => void;
}

function trackLabel(track: AudioTrackInfo): string {
  return track.title ?? track.language ?? `Traccia ${track.index}`;
}

/**
 * Selezione traccia audio (§7): il tag <video> nativo non espone le tracce
 * multiple di Direct Play (Chromium non implementa `audioTracks` su
 * HTMLMediaElement, solo Safari — verificato con un file reale). La
 * selezione ricarica quindi lo stream con `audioStreamIndex` (Jellyfin
 * remuxa/trasmette solo quella traccia, vedi routes/media.ts), mantenendo
 * il punto di riproduzione corrente.
 */
export function VideoPlayer({ itemId, itemType, mediaSourceId, resume, audioTracks, onEnded }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const defaultTrack = audioTracks?.find((t) => t.isDefault) ?? audioTracks?.[0] ?? null;
  const [selectedAudioIndex, setSelectedAudioIndex] = useState<number | null>(defaultTrack?.index ?? null);
  // Punto di ripresa: quello passato da props al primo caricamento, poi
  // aggiornato al currentTime corrente ogni volta che si cambia traccia
  // audio (il cambio ricarica lo stream, altrimenti si ripartirebbe da 0).
  const resumeSecondsRef = useRef<number | null>(
    resume && resume.positionTicks > 0 ? resume.positionTicks / TICKS_PER_SECOND : null,
  );

  function report(video: HTMLVideoElement) {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    api
      .saveProgress(itemId, {
        itemType,
        positionTicks: Math.round(video.currentTime * TICKS_PER_SECOND),
        durationTicks: Math.round(video.duration * TICKS_PER_SECOND),
      })
      .catch(() => {
        /* la mancata sincronizzazione del progresso non deve interrompere la riproduzione (§31) */
      });
  }

  function handleSelectAudioTrack(index: number) {
    const video = videoRef.current;
    if (video && Number.isFinite(video.currentTime)) resumeSecondsRef.current = video.currentTime;
    setSelectedAudioIndex(index);
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function onLoadedMetadata() {
      const seconds = resumeSecondsRef.current;
      if (video && seconds !== null && seconds < video.duration - 5) video.currentTime = seconds;
    }

    function onPause() {
      if (video) report(video);
    }

    function handleEnded() {
      if (video) report(video);
      onEnded?.();
    }

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", handleEnded);

    const interval = setInterval(() => {
      if (video && !video.paused) report(video);
    }, PROGRESS_REPORT_INTERVAL_MS);

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", handleEnded);
      clearInterval(interval);
      if (video) report(video);
    };
  }, [itemId, selectedAudioIndex]);

  // audioStreamIndex passato solo se diverso dalla traccia di default:
  // così il caso comune resta Direct Play "static" a costo zero (§7),
  // Jellyfin remuxa solo quando l'utente sceglie davvero un'altra traccia.
  const streamUrl = mediaStreamUrl(
    itemId,
    mediaSourceId,
    selectedAudioIndex !== null && selectedAudioIndex !== defaultTrack?.index ? selectedAudioIndex : null,
  );

  return (
    <div>
      <video
        ref={videoRef}
        src={streamUrl}
        controls
        autoPlay
        style={{
          width: "100%",
          borderRadius: "var(--radius-md)",
          background: "black",
          aspectRatio: "16 / 9",
        }}
      />
      {audioTracks && audioTracks.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Audio:</span>
          <select
            value={selectedAudioIndex ?? ""}
            onChange={(e) => handleSelectAudioTrack(Number(e.target.value))}
            style={{
              padding: "6px 10px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
              color: "var(--text)",
              fontSize: 13,
            }}
          >
            {audioTracks.map((t) => (
              <option key={t.index} value={t.index}>
                {trackLabel(t)}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
