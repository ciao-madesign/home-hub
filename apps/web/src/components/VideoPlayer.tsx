import { useEffect, useRef } from "react";
import { api, mediaStreamUrl, TICKS_PER_SECOND, type ResumeInfo } from "../api/client";

const PROGRESS_REPORT_INTERVAL_MS = 10000;

interface VideoPlayerProps {
  itemId: string;
  itemType: "movie" | "episode";
  mediaSourceId: string | null;
  resume: ResumeInfo | null;
  onEnded?: () => void;
}

export function VideoPlayer({ itemId, itemType, mediaSourceId, resume, onEnded }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function onLoadedMetadata() {
      if (resume && video && resume.positionTicks > 0) {
        const seconds = resume.positionTicks / TICKS_PER_SECOND;
        if (seconds < video.duration - 5) video.currentTime = seconds;
      }
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
  }, [itemId]);

  return (
    <video
      ref={videoRef}
      src={mediaStreamUrl(itemId, mediaSourceId)}
      controls
      autoPlay
      style={{
        width: "100%",
        borderRadius: "var(--radius-md)",
        background: "black",
        aspectRatio: "16 / 9",
      }}
    />
  );
}
