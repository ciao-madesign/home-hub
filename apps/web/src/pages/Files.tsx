import { useEffect, useRef, useState } from "react";
import {
  api,
  fileDownloadUrl,
  type DuplicateGroup,
  type FileEntry,
  type FileScope,
  type FileSearchResult,
  type TrashEntry,
} from "../api/client";
import {
  Modal,
  modalButtonRowStyle,
  modalInputStyle,
  modalPrimaryButtonStyle,
  modalSecondaryButtonStyle,
} from "../components/Modal";
import { formatBytes, formatDate, formatDaysLeft } from "../lib/format";
import {
  IconDownload,
  IconFolder,
} from "../components/icons";

type View = "browse" | "trash" | "duplicates" | "search";

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function Breadcrumbs({
  scope,
  path,
  onNavigate,
}: {
  scope: FileScope;
  path: string;
  onNavigate: (path: string) => void;
}) {
  const segments = path.split("/").filter(Boolean);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, flexWrap: "wrap" }}>
      <button onClick={() => onNavigate("")} style={crumbStyle}>
        {scope === "shared" ? "Condivisi" : "Privati"}
      </button>
      {segments.map((seg, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--text-faint)" }}>/</span>
          <button onClick={() => onNavigate(segments.slice(0, i + 1).join("/"))} style={crumbStyle}>
            {seg}
          </button>
        </span>
      ))}
    </div>
  );
}

const crumbStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  cursor: "pointer",
  padding: 0,
  fontSize: 13,
};

function NewFolderModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <Modal title="Nuova cartella" onClose={onClose}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome cartella"
        style={modalInputStyle}
        onKeyDown={(e) => e.key === "Enter" && name.trim() && onCreate(name.trim())}
      />
      <div style={modalButtonRowStyle}>
        <button onClick={onClose} style={modalSecondaryButtonStyle}>Annulla</button>
        <button
          onClick={() => name.trim() && onCreate(name.trim())}
          disabled={!name.trim()}
          style={modalPrimaryButtonStyle}
        >
          Crea
        </button>
      </div>
    </Modal>
  );
}

function RenameModal({
  entry,
  onClose,
  onRename,
}: {
  entry: FileEntry;
  onClose: () => void;
  onRename: (newName: string) => void;
}) {
  const [name, setName] = useState(entry.name);
  return (
    <Modal title="Rinomina" onClose={onClose}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={modalInputStyle}
        onKeyDown={(e) => e.key === "Enter" && name.trim() && onRename(name.trim())}
      />
      <div style={modalButtonRowStyle}>
        <button onClick={onClose} style={modalSecondaryButtonStyle}>Annulla</button>
        <button
          onClick={() => name.trim() && onRename(name.trim())}
          disabled={!name.trim()}
          style={modalPrimaryButtonStyle}
        >
          Rinomina
        </button>
      </div>
    </Modal>
  );
}

function MoveModal({
  entry,
  currentScope,
  currentPath,
  onClose,
  onMove,
}: {
  entry: FileEntry;
  currentScope: FileScope;
  currentPath: string;
  onClose: () => void;
  onMove: (destScope: FileScope, destPath: string) => void;
}) {
  const [destScope, setDestScope] = useState<FileScope>(currentScope === "shared" ? "private" : "shared");
  const [destPath, setDestPath] = useState(currentPath);

  return (
    <Modal title={`Sposta "${entry.name}"`} onClose={onClose}>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-faint)" }}>
        Spostare tra Condivisi e Privati cambia la visibilità del contenuto.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <TabButton active={destScope === "shared"} onClick={() => setDestScope("shared")}>Condivisi</TabButton>
        <TabButton active={destScope === "private"} onClick={() => setDestScope("private")}>Privati</TabButton>
      </div>
      <input
        value={destPath}
        onChange={(e) => setDestPath(e.target.value)}
        placeholder="Cartella di destinazione (vuoto = root)"
        style={modalInputStyle}
      />
      <div style={modalButtonRowStyle}>
        <button onClick={onClose} style={modalSecondaryButtonStyle}>Annulla</button>
        <button onClick={() => onMove(destScope, destPath)} style={modalPrimaryButtonStyle}>
          Sposta
        </button>
      </div>
    </Modal>
  );
}

function EntryRow({
  entry,
  scope,
  currentPath,
  onOpen,
  onRename,
  onMove,
  onDelete,
  onDeletePermanent,
}: {
  entry: FileEntry;
  scope: FileScope;
  currentPath: string;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
  onDeletePermanent: () => void;
}) {
  const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
        background: "var(--bg-card)",
      }}
    >
      <button
        onClick={entry.isDirectory ? onOpen : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flex: 1,
          minWidth: 0,
          background: "transparent",
          border: "none",
          color: "var(--text)",
          cursor: entry.isDirectory ? "pointer" : "default",
          padding: 0,
          textAlign: "left",
        }}
      >
        <span style={{ color: entry.isDirectory ? "var(--accent-strong)" : "var(--text-faint)", flexShrink: 0 }}>
          {entry.isDirectory ? <IconFolder /> : "📄"}
        </span>
        <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {entry.name}
        </span>
      </button>

      <span style={{ fontSize: 12, color: "var(--text-faint)", flexShrink: 0, width: 80, textAlign: "right" }}>
        {formatBytes(entry.size)}
      </span>
      <span style={{ fontSize: 12, color: "var(--text-faint)", flexShrink: 0, width: 90 }}>
        {formatDate(entry.modifiedAt)}
      </span>

      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        {!entry.isDirectory && (
          <a
            href={fileDownloadUrl(scope, fullPath)}
            title="Scarica"
            style={iconButtonStyle}
          >
            <IconDownload />
          </a>
        )}
        <button onClick={onRename} title="Rinomina" style={iconButtonStyle}>✎</button>
        <button onClick={onMove} title="Sposta / cambia privacy" style={iconButtonStyle}>⇄</button>
        <button onClick={onDelete} title="Elimina (cestino)" style={iconButtonStyle}>🗑</button>
        <button
          onClick={onDeletePermanent}
          title="Elimina definitivamente"
          style={{ ...iconButtonStyle, color: "var(--status-problem)" }}
        >
          ⨯
        </button>
      </div>
    </div>
  );
}

const iconButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 13,
  textDecoration: "none",
};

function TrashView({ onRestore, onDeletePermanent }: { onRestore: (id: string) => void; onDeletePermanent: (id: string) => void }) {
  const [items, setItems] = useState<TrashEntry[] | null>(null);

  function refresh() {
    api.listTrash().then((res) => setItems(res.items));
  }

  useEffect(refresh, []);

  if (items === null) return <p style={{ color: "var(--text-faint)" }}>Caricamento…</p>;
  if (items.length === 0) return <p style={{ color: "var(--text-faint)" }}>Il cestino è vuoto.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
          }}
        >
          <span style={{ flex: 1, fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.name}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
            {item.scope === "shared" ? "Condivisi" : "Privati"} · {formatDaysLeft(item.expiresAt)}
          </span>
          <button
            onClick={() => { onRestore(item.id); refresh(); }}
            style={{ ...iconButtonStyle, width: "auto", padding: "0 10px" }}
          >
            Ripristina
          </button>
          <button
            onClick={() => { onDeletePermanent(item.id); refresh(); }}
            style={{ ...iconButtonStyle, width: "auto", padding: "0 10px", color: "var(--status-problem)" }}
          >
            Elimina definitivamente
          </button>
        </div>
      ))}
    </div>
  );
}

function DuplicatesView({ scope, onDelete }: { scope: FileScope; onDelete: (path: string) => void }) {
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);

  useEffect(() => {
    setGroups(null);
    api.findDuplicateFiles(scope).then((res) => setGroups(res.groups));
  }, [scope]);

  if (groups === null) return <p style={{ color: "var(--text-faint)" }}>Ricerca duplicati in corso…</p>;
  if (groups.length === 0) return <p style={{ color: "var(--text-faint)" }}>Nessun duplicato trovato.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {groups.map((group) => (
        <div key={group.hash} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14 }}>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--text-faint)" }}>
            {group.files.length} copie · {formatBytes(group.size)} ciascuna
          </p>
          {group.files.map((f) => (
            <div key={f.path} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <span style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.path}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{formatDate(f.modifiedAt)}</span>
              <button onClick={() => onDelete(f.path)} style={{ ...iconButtonStyle, width: "auto", padding: "0 10px" }}>
                Elimina
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SearchView({ results, scope, onNavigate }: { results: FileSearchResult[]; scope: FileScope; onNavigate: (path: string) => void }) {
  if (results.length === 0) return <p style={{ color: "var(--text-faint)" }}>Nessun risultato.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {results.map((r) => (
        <button
          key={r.path}
          onClick={() => onNavigate(r.isDirectory ? r.path : r.path.split("/").slice(0, -1).join("/"))}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
            color: "var(--text)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {r.isDirectory ? <IconFolder /> : <span>📄</span>}
          <span style={{ flex: 1, fontSize: 14 }}>{r.name}</span>
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
            {scope === "shared" ? "Condivisi" : "Privati"}/{r.path}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Files() {
  const [scope, setScope] = useState<FileScope>("shared");
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [view, setView] = useState<View>("browse");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FileSearchResult[]>([]);
  const [modal, setModal] = useState<
    | { type: "newFolder" }
    | { type: "rename"; entry: FileEntry }
    | { type: "move"; entry: FileEntry }
    | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function refresh() {
    setEntries(null);
    api.listFiles(scope, currentPath).then((res) => setEntries(res.entries));
  }

  useEffect(() => {
    if (view === "browse") refresh();
  }, [scope, currentPath, view]);

  function navigate(path: string) {
    setCurrentPath(path);
    setView("browse");
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    await api.uploadFiles(scope, currentPath, files);
    refresh();
  }

  async function handleDelete(entry: FileEntry) {
    await api.deleteFile(scope, currentPath ? `${currentPath}/${entry.name}` : entry.name);
    refresh();
  }

  async function handleDeletePermanent(entry: FileEntry) {
    const confirmed = window.confirm(
      `Eliminare definitivamente "${entry.name}"? L'operazione non passa dal cestino e non è reversibile.`,
    );
    if (!confirmed) return;
    await api.deleteFile(scope, currentPath ? `${currentPath}/${entry.name}` : entry.name, true);
    refresh();
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const res = await api.searchFiles(scope, searchQuery.trim());
    setSearchResults(res.results);
    setView("search");
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>File</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <TabButton active={scope === "shared"} onClick={() => { setScope("shared"); setCurrentPath(""); }}>Condivisi</TabButton>
          <TabButton active={scope === "private"} onClick={() => { setScope("private"); setCurrentPath(""); }}>Privati</TabButton>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setModal({ type: "newFolder" })} style={toolbarButtonStyle}>+ Cartella</button>
        <button onClick={() => fileInputRef.current?.click()} style={toolbarButtonStyle}>Carica file</button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => handleUpload(e.target.files)}
        />
        <TabButton active={view === "duplicates"} onClick={() => setView("duplicates")}>Duplicati</TabButton>
        <TabButton active={view === "trash"} onClick={() => setView("trash")}>Cestino</TabButton>

        <form onSubmit={handleSearch} style={{ flex: 1, minWidth: 200, display: "flex" }}>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca per nome…"
            style={{ ...modalInputStyle, maxWidth: 260 }}
          />
        </form>
      </div>

      {view === "browse" && (
        <>
          <div style={{ marginBottom: 14 }}>
            <Breadcrumbs scope={scope} path={currentPath} onNavigate={navigate} />
          </div>
          {entries === null && <p style={{ color: "var(--text-faint)" }}>Caricamento…</p>}
          {entries && entries.length === 0 && <p style={{ color: "var(--text-faint)" }}>Cartella vuota.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {entries?.map((entry) => (
              <EntryRow
                key={entry.name}
                entry={entry}
                scope={scope}
                currentPath={currentPath}
                onOpen={() => navigate(currentPath ? `${currentPath}/${entry.name}` : entry.name)}
                onRename={() => setModal({ type: "rename", entry })}
                onMove={() => setModal({ type: "move", entry })}
                onDelete={() => handleDelete(entry)}
                onDeletePermanent={() => handleDeletePermanent(entry)}
              />
            ))}
          </div>
        </>
      )}

      {view === "trash" && (
        <TrashView
          onRestore={async (id) => { await api.restoreTrash(id); }}
          onDeletePermanent={async (id) => { await api.deleteTrashPermanent(id); }}
        />
      )}

      {view === "duplicates" && (
        <DuplicatesView
          scope={scope}
          onDelete={async (path) => { await api.deleteFile(scope, path); setView("duplicates"); }}
        />
      )}

      {view === "search" && <SearchView results={searchResults} scope={scope} onNavigate={navigate} />}

      {modal?.type === "newFolder" && (
        <NewFolderModal
          onClose={() => setModal(null)}
          onCreate={async (name) => {
            await api.createFolder(scope, currentPath, name);
            setModal(null);
            refresh();
          }}
        />
      )}

      {modal?.type === "rename" && (
        <RenameModal
          entry={modal.entry}
          onClose={() => setModal(null)}
          onRename={async (newName) => {
            const path = currentPath ? `${currentPath}/${modal.entry.name}` : modal.entry.name;
            await api.renameFile(scope, path, newName);
            setModal(null);
            refresh();
          }}
        />
      )}

      {modal?.type === "move" && (
        <MoveModal
          entry={modal.entry}
          currentScope={scope}
          currentPath={currentPath}
          onClose={() => setModal(null)}
          onMove={async (destScope, destPath) => {
            const path = currentPath ? `${currentPath}/${modal.entry.name}` : modal.entry.name;
            await api.moveFile(scope, path, destScope, destPath);
            setModal(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

const toolbarButtonStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
