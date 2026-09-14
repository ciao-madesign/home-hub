import { useEffect, useState } from "react";
import { api, ApiError, type Bookmark } from "../api/client";
import { useProfile } from "../context/ProfileContext";
import {
  Modal,
  modalButtonRowStyle,
  modalDangerButtonStyle,
  modalInputStyle,
  modalPrimaryButtonStyle,
  modalSecondaryButtonStyle,
} from "../components/Modal";

const COLORS = ["#6366f1", "#22c55e", "#f97316", "#ec4899", "#06b6d4", "#eab308", "#ef4444", "#8b5cf6"];

function BookmarkModal({
  initial,
  onClose,
  onSaved,
  onDeleted,
}: {
  initial: Bookmark | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      if (initial) await api.updateBookmark(initial.id, { title, url, color });
      else await api.createBookmark({ title, url, color });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? "Salvataggio non riuscito (URL valido? deve iniziare con http/https)." : "Errore imprevisto.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    setBusy(true);
    try {
      await api.deleteBookmark(initial.id);
      onDeleted?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={initial ? "Modifica collegamento" : "Nuovo collegamento"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome (es. La7)" style={modalInputStyle} />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.la7.it/diretta"
          style={modalInputStyle}
        />
        <div style={{ display: "flex", gap: 8 }}>
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Colore ${c}`}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: c,
                border: color === c ? "2px solid white" : "2px solid transparent",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
        {error && <p style={{ color: "var(--status-problem)", fontSize: 13, margin: 0 }}>{error}</p>}
      </div>

      <div style={{ ...modalButtonRowStyle, justifyContent: initial ? "space-between" : "flex-end" }}>
        {initial && (
          <button style={modalDangerButtonStyle} onClick={handleDelete} disabled={busy}>
            Elimina
          </button>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button style={modalSecondaryButtonStyle} onClick={onClose}>
            Annulla
          </button>
          <button style={modalPrimaryButtonStyle} onClick={handleSave} disabled={busy || !title || !url}>
            Salva
          </button>
        </div>
      </div>
    </Modal>
  );
}

function BookmarkTile({ bookmark, onEdit }: { bookmark: Bookmark; onEdit: () => void }) {
  const { user } = useProfile();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <a
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          width: 84,
          height: 84,
          borderRadius: "50%",
          background: bookmark.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 30,
          fontWeight: 700,
          color: "#0a0b0d",
        }}
      >
        {bookmark.title.slice(0, 1).toUpperCase()}
      </a>
      <span style={{ fontSize: 13, fontWeight: 600, textAlign: "center" }}>{bookmark.title}</span>
      {user?.role === "admin" && (
        <button
          onClick={onEdit}
          style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 12, cursor: "pointer" }}
        >
          Modifica
        </button>
      )}
    </div>
  );
}

export function Web() {
  const { user } = useProfile();
  const [bookmarks, setBookmarks] = useState<Bookmark[] | null>(null);
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [adding, setAdding] = useState(false);

  function load() {
    api.listBookmarks().then((r) => setBookmarks(r.bookmarks)).catch(() => setBookmarks([]));
  }

  useEffect(load, []);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Web</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            Apre il sito nel browser del dispositivo — non dentro l'Hub.
          </p>
        </div>
        {user?.role === "admin" && (
          <button onClick={() => setAdding(true)} style={modalPrimaryButtonStyle}>
            Aggiungi
          </button>
        )}
      </div>

      {bookmarks?.length === 0 && (
        <p style={{ color: "var(--text-faint)" }}>
          Nessun collegamento ancora.{" "}
          {user?.role === "admin" ? 'Tocca "Aggiungi" per crearne uno.' : "Chiedi a un admin di aggiungerne uno."}
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
          gap: 20,
        }}
      >
        {bookmarks?.map((b) => (
          <BookmarkTile key={b.id} bookmark={b} onEdit={() => setEditing(b)} />
        ))}
      </div>

      {adding && (
        <BookmarkModal
          initial={null}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
      {editing && (
        <BookmarkModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onDeleted={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
