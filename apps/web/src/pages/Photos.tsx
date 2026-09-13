import { useEffect, useState } from "react";
import { api, ApiError, photoThumbnailUrl, type AlbumSummary, type PhotoAsset } from "../api/client";
import { ServiceUnavailable } from "../components/ServiceUnavailable";
import { PhotoGrid } from "../components/PhotoGrid";
import { Lightbox } from "../components/Lightbox";

type Tab = "timeline" | "albums";
type TypeFilter = "all" | "image" | "video";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
        background: active ? "var(--accent)" : "var(--bg-card)",
        color: active ? "white" : "var(--text-muted)",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Timeline({ unavailable, onUnavailable }: { unavailable: boolean; onUnavailable: () => void }) {
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PhotoAsset[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    setItems([]);
    setPage(1);
  }, [filter]);

  useEffect(() => {
    api
      .photoTimeline(page, filter)
      .then((res) => {
        setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
        setHasMore(res.nextPage !== null);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 503) onUnavailable();
      });
  }, [page, filter]);

  if (unavailable) return <ServiceUnavailable service="Immich" />;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <TabButton active={filter === "all"} onClick={() => setFilter("all")}>
          Tutti
        </TabButton>
        <TabButton active={filter === "image"} onClick={() => setFilter("image")}>
          Foto
        </TabButton>
        <TabButton active={filter === "video"} onClick={() => setFilter("video")}>
          Solo video
        </TabButton>
      </div>

      {items.length === 0 ? (
        <p style={{ color: "var(--text-faint)" }}>Nessun contenuto disponibile.</p>
      ) : (
        <PhotoGrid assets={items} onSelect={setLightboxIndex} />
      )}

      {hasMore && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
          <button
            onClick={() => setPage((p) => p + 1)}
            style={{
              padding: "9px 18px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
              color: "var(--text)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Carica altri
          </button>
        </div>
      )}

      {lightboxIndex !== null && (
        <Lightbox assets={items} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </div>
  );
}

function Albums({ unavailable, onUnavailable }: { unavailable: boolean; onUnavailable: () => void }) {
  const [albums, setAlbums] = useState<AlbumSummary[] | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [albumAssets, setAlbumAssets] = useState<PhotoAsset[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    api
      .listAlbums()
      .then((res) => setAlbums(res.albums))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 503) onUnavailable();
      });
  }, []);

  useEffect(() => {
    if (!selectedAlbumId) return;
    setAlbumAssets(null);
    api
      .getAlbum(selectedAlbumId)
      .then((res) => setAlbumAssets(res.album.assets))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 503) onUnavailable();
      });
  }, [selectedAlbumId]);

  if (unavailable) return <ServiceUnavailable service="Immich" />;

  if (selectedAlbumId) {
    return (
      <div>
        <button
          onClick={() => setSelectedAlbumId(null)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-faint)",
            fontSize: 13,
            cursor: "pointer",
            padding: 0,
            marginBottom: 16,
          }}
        >
          ← Torna agli album
        </button>
        {albumAssets && albumAssets.length > 0 ? (
          <PhotoGrid assets={albumAssets} onSelect={setLightboxIndex} />
        ) : (
          <p style={{ color: "var(--text-faint)" }}>Album vuoto.</p>
        )}
        {albumAssets && lightboxIndex !== null && (
          <Lightbox
            assets={albumAssets}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </div>
    );
  }

  if (albums && albums.length === 0) {
    return <p style={{ color: "var(--text-faint)" }}>Nessun album disponibile.</p>;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 16,
      }}
    >
      {albums?.map((album) => (
        <button
          key={album.id}
          onClick={() => setSelectedAlbumId(album.id)}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div
            style={{
              aspectRatio: "1 / 1",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
          >
            {album.thumbnailAssetId && (
              <img
                src={photoThumbnailUrl(album.thumbnailAssetId)}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            )}
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{album.name}</p>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>
              {album.assetCount} elementi
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

export function Photos() {
  const [tab, setTab] = useState<Tab>("timeline");
  const [unavailable, setUnavailable] = useState(false);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Foto</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <TabButton active={tab === "timeline"} onClick={() => setTab("timeline")}>
            Timeline
          </TabButton>
          <TabButton active={tab === "albums"} onClick={() => setTab("albums")}>
            Album
          </TabButton>
        </div>
      </div>

      {tab === "timeline" ? (
        <Timeline unavailable={unavailable} onUnavailable={() => setUnavailable(true)} />
      ) : (
        <Albums unavailable={unavailable} onUnavailable={() => setUnavailable(true)} />
      )}
    </div>
  );
}
