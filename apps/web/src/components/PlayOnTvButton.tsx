import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

interface PlayOnTvButtonProps {
  itemId: string;
  itemType: "movie" | "episode";
  style?: React.CSSProperties;
}

/** Pulsante "Riproduci sulla TV" condiviso tra MovieDetail e EpisodeDetail — avvia la riproduzione sul Wyse e porta al telecomando. */
export function PlayOnTvButton({ itemId, itemType, style }: PlayOnTvButtonProps) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  async function playOnTv() {
    setError(null);
    try {
      await api.tvPlay(itemId, itemType);
      navigate("/telecomando");
    } catch {
      setError("Impossibile avviare la riproduzione sulla TV.");
    }
  }

  return (
    <>
      <button
        onClick={playOnTv}
        style={{
          padding: "10px 20px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          background: "transparent",
          color: "var(--text)",
          fontWeight: 600,
          fontSize: 14,
          cursor: "pointer",
          ...style,
        }}
      >
        Riproduci sulla TV
      </button>
      {error && <p style={{ fontSize: 13, color: "var(--status-problem)", margin: "8px 0 0" }}>{error}</p>}
    </>
  );
}
