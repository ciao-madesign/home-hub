import { useEffect, useRef, useState } from "react";
import { api, type DownloadItem, type DownloadStatus } from "../api/client";
import { formatBytes, formatSpeed } from "../lib/format";

const STATUS_LABELS: Record<DownloadStatus, string> = {
  queued: "In coda",
  downloading: "In corso",
  paused: "In pausa",
  completed: "Completato",
  error: "Errore",
};

const STATUS_COLORS: Record<DownloadStatus, string> = {
  queued: "var(--text-faint)",
  downloading: "var(--accent-strong)",
  paused: "var(--status-attention)",
  completed: "var(--status-normal)",
  error: "var(--status-problem)",
};

function DownloadRow({ item, onChanged }: { item: DownloadItem; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        padding: 14,
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
        background: "var(--bg-card)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            color: "var(--text-faint)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "2px 6px",
            flexShrink: 0,
          }}
        >
          {item.kind === "url" ? "URL" : "Torrent"}
        </span>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={item.title ?? item.source}
        >
          {item.title ?? item.source}
        </p>
        <span style={{ fontSize: 12, color: STATUS_COLORS[item.status], flexShrink: 0 }}>
          {STATUS_LABELS[item.status]}
        </span>
      </div>

      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: "var(--bg-hover)",
          overflow: "hidden",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, item.progressPercent))}%`,
            height: "100%",
            background: item.status === "error" ? "var(--status-problem)" : "var(--accent)",
            transition: "width 300ms ease",
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>
          {item.progressPercent.toFixed(1)}%
          {item.totalBytes ? ` · ${formatBytes(item.downloadedBytes)} / ${formatBytes(item.totalBytes)}` : ""}
          {item.status === "downloading" ? ` · ${formatSpeed(item.speedBytesPerSec)}` : ""}
          {item.errorMessage ? ` · ${item.errorMessage}` : ""}
        </p>

        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {(item.status === "downloading" || item.status === "queued") && (
            <button disabled={busy} onClick={() => run(() => api.pauseDownload(item.id))} style={actionButtonStyle}>
              Pausa
            </button>
          )}
          {item.status === "paused" && (
            <button disabled={busy} onClick={() => run(() => api.resumeDownload(item.id))} style={actionButtonStyle}>
              Riprendi
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => run(() => api.cancelDownload(item.id))}
            style={{ ...actionButtonStyle, color: "var(--status-problem)" }}
          >
            {item.status === "completed" || item.status === "error" ? "Rimuovi" : "Annulla"}
          </button>
        </div>
      </div>
    </div>
  );
}

const actionButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-muted)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

export function Downloads() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [magnetInput, setMagnetInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const torrentFileInput = useRef<HTMLInputElement>(null);

  function refresh() {
    api
      .listDownloads()
      .then((res) => setDownloads(res.downloads))
      .catch(() => {
        /* polling: un errore isolato non deve interrompere l'interfaccia */
      });
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, []);

  async function addUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setError(null);
    try {
      await api.addUrlDownload(urlInput.trim());
      setUrlInput("");
      refresh();
    } catch {
      setError("URL non valido o download non avviabile.");
    }
  }

  async function addMagnet(e: React.FormEvent) {
    e.preventDefault();
    if (!magnetInput.trim()) return;
    setError(null);
    try {
      await api.addTorrentDownload(magnetInput.trim());
      setMagnetInput("");
      refresh();
    } catch {
      setError("Magnet URI non valido.");
    }
  }

  async function handleTorrentFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    try {
      await api.uploadTorrentFile(file);
      refresh();
    } catch {
      setError("Impossibile caricare il file .torrent.");
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 20px" }}>Download</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <form onSubmit={addUrl} style={{ display: "flex", gap: 8 }}>
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="URL da scaricare…"
            style={inputStyle}
          />
          <button type="submit" style={primaryButtonStyle}>
            Aggiungi
          </button>
        </form>

        <form onSubmit={addMagnet} style={{ display: "flex", gap: 8 }}>
          <input
            value={magnetInput}
            onChange={(e) => setMagnetInput(e.target.value)}
            placeholder="magnet:?xt=…"
            style={inputStyle}
          />
          <button type="submit" style={primaryButtonStyle}>
            Aggiungi
          </button>
          <button
            type="button"
            onClick={() => torrentFileInput.current?.click()}
            style={{ ...primaryButtonStyle, background: "var(--bg-card)", color: "var(--text)" }}
          >
            .torrent
          </button>
          <input
            ref={torrentFileInput}
            type="file"
            accept=".torrent"
            hidden
            onChange={(e) => handleTorrentFile(e.target.files)}
          />
        </form>
      </div>

      {error && <p style={{ color: "var(--status-problem)", fontSize: 13, marginBottom: 16 }}>{error}</p>}

      {downloads.length === 0 ? (
        <p style={{ color: "var(--text-faint)" }}>Nessun download attivo o in coda.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {downloads.map((item) => (
            <DownloadRow key={item.id} item={item} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "9px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontSize: 13,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: "var(--radius-sm)",
  border: "none",
  background: "var(--accent)",
  color: "white",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
