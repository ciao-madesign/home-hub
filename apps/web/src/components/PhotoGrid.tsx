import type { PhotoAsset } from "../api/client";
import { photoThumbnailUrl } from "../api/client";

export function PhotoGrid({
  assets,
  onSelect,
}: {
  assets: PhotoAsset[];
  onSelect: (index: number) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: 10,
      }}
    >
      {assets.map((asset, index) => (
        <button
          key={asset.id}
          onClick={() => onSelect(index)}
          style={{
            position: "relative",
            aspectRatio: "1 / 1",
            borderRadius: "var(--radius-sm)",
            overflow: "hidden",
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
            padding: 0,
            cursor: "pointer",
          }}
        >
          <img
            src={photoThumbnailUrl(asset.id)}
            alt=""
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
            }}
          />
          {asset.type === "video" && (
            <span
              aria-hidden
              style={{
                position: "absolute",
                right: 6,
                bottom: 6,
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: 11,
              }}
            >
              ▶
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
