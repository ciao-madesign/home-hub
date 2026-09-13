import { useEffect, useState } from "react";
import type { PhotoAsset } from "../api/client";
import { photoOriginalUrl } from "../api/client";

const SLIDESHOW_INTERVALS = [3, 5, 10] as const;

export function Lightbox({
  assets,
  initialIndex,
  onClose,
}: {
  assets: PhotoAsset[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [slideshow, setSlideshow] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState<(typeof SLIDESHOW_INTERVALS)[number]>(5);

  const asset = assets[index];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setIndex((i) => (i + 1) % assets.length);
      else if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + assets.length) % assets.length);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [assets.length, onClose]);

  useEffect(() => {
    if (!slideshow) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % assets.length);
    }, intervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [slideshow, intervalSeconds, assets.length]);

  if (!asset) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(5, 6, 8, 0.96)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        <span>
          {index + 1} / {assets.length} · {asset.fileName}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setSlideshow((s) => !s)}
            style={{
              padding: "6px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: slideshow ? "var(--accent)" : "transparent",
              color: slideshow ? "white" : "var(--text-muted)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {slideshow ? "Slideshow ●" : "Slideshow"}
          </button>
          <select
            value={intervalSeconds}
            onChange={(e) => setIntervalSeconds(Number(e.target.value) as typeof intervalSeconds)}
            style={{
              background: "var(--bg-card)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 8px",
              fontSize: 13,
            }}
          >
            {SLIDESHOW_INTERVALS.map((s) => (
              <option key={s} value={s}>
                {s}s
              </option>
            ))}
          </select>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              fontSize: 20,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          minHeight: 0,
        }}
      >
        <button
          onClick={() => setIndex((i) => (i - 1 + assets.length) % assets.length)}
          aria-label="Precedente"
          style={navButtonStyle("left")}
        >
          ‹
        </button>

        {asset.type === "image" ? (
          <img
            src={photoOriginalUrl(asset.id)}
            alt=""
            style={{ maxWidth: "92%", maxHeight: "88%", objectFit: "contain" }}
          />
        ) : (
          <video
            key={asset.id}
            src={photoOriginalUrl(asset.id)}
            controls
            autoPlay
            style={{ maxWidth: "92%", maxHeight: "88%" }}
          />
        )}

        <button
          onClick={() => setIndex((i) => (i + 1) % assets.length)}
          aria-label="Successivo"
          style={navButtonStyle("right")}
        >
          ›
        </button>
      </div>
    </div>
  );
}

function navButtonStyle(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    [side]: 12,
    top: "50%",
    transform: "translateY(-50%)",
    width: 44,
    height: 44,
    borderRadius: "50%",
    border: "1px solid var(--border)",
    background: "rgba(20, 21, 25, 0.7)",
    color: "var(--text)",
    fontSize: 24,
    cursor: "pointer",
  };
}
