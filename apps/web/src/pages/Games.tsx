import { useEffect, useRef, useState } from "react";
import {
  api,
  gameCoverUrl,
  type GameDetail,
  type GameItem,
  type MachineItem,
  type ScanCandidate,
} from "../api/client";
import {
  Modal,
  modalButtonRowStyle,
  modalInputStyle,
  modalPrimaryButtonStyle,
  modalSecondaryButtonStyle,
} from "../components/Modal";
import { formatDate } from "../lib/format";

type View = "catalog" | "machines";

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

function AddGameModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("");
  const [romPath, setRomPath] = useState("");

  async function submit() {
    if (!title.trim() || !platform.trim()) return;
    await api.createGame({ title: title.trim(), platform: platform.trim(), romPath: romPath.trim() || null });
    onCreated();
  }

  return (
    <Modal title="Aggiungi gioco" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titolo" style={modalInputStyle} autoFocus />
        <input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Piattaforma (es. nes, snes, pc)" style={modalInputStyle} />
        <input value={romPath} onChange={(e) => setRomPath(e.target.value)} placeholder="Percorso ROM in Games/ (opzionale)" style={modalInputStyle} />
      </div>
      <div style={modalButtonRowStyle}>
        <button onClick={onClose} style={modalSecondaryButtonStyle}>Annulla</button>
        <button onClick={submit} disabled={!title.trim() || !platform.trim()} style={modalPrimaryButtonStyle}>
          Aggiungi
        </button>
      </div>
    </Modal>
  );
}

function ScanModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [candidates, setCandidates] = useState<ScanCandidate[] | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    api.scanGames().then((res) => setCandidates(res.candidates));
  }, []);

  async function importOne(candidate: ScanCandidate) {
    setImporting(candidate.romPath);
    try {
      await api.importGame(candidate);
      setCandidates((prev) => prev?.filter((c) => c.romPath !== candidate.romPath) ?? null);
      onImported();
    } finally {
      setImporting(null);
    }
  }

  return (
    <Modal title="Giochi trovati nelle cartelle monitorate" onClose={onClose}>
      {candidates === null && <p style={{ color: "var(--text-faint)", fontSize: 13 }}>Scansione in corso…</p>}
      {candidates && candidates.length === 0 && (
        <p style={{ color: "var(--text-faint)", fontSize: 13 }}>Nessun nuovo gioco trovato in Games/.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
        {candidates?.map((c) => (
          <div
            key={c.romPath}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{c.suggestedTitle}</p>
              <p style={{ margin: 0, fontSize: 11, color: "var(--text-faint)" }}>
                {c.platform} · {c.romPath}
              </p>
            </div>
            <button
              onClick={() => importOne(c)}
              disabled={importing !== null}
              style={{ ...modalSecondaryButtonStyle, padding: "6px 12px" }}
            >
              {importing === c.romPath ? "…" : "Aggiungi alla libreria"}
            </button>
          </div>
        ))}
      </div>
      <div style={modalButtonRowStyle}>
        <button onClick={onClose} style={modalPrimaryButtonStyle}>Chiudi</button>
      </div>
    </Modal>
  );
}

function GameDetailModal({
  gameId,
  machines,
  onClose,
  onChanged,
}: {
  gameId: string;
  machines: MachineItem[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  function refresh() {
    api.getGame(gameId).then(setDetail);
  }

  useEffect(refresh, [gameId]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      refresh();
      onChanged();
    } catch {
      setError("Operazione non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  if (!detail) return null;
  const { game, saves, running } = detail;

  return (
    <Modal title={game.title} onClose={onClose}>
      <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
        <div
          style={{
            width: 90,
            aspectRatio: "3 / 4",
            borderRadius: "var(--radius-sm)",
            overflow: "hidden",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          {game.coverPath && (
            <img src={gameCoverUrl(game.id)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
        </div>
        <div style={{ flex: 1, fontSize: 13, color: "var(--text-muted)" }}>
          <p style={{ margin: "0 0 4px" }}>Piattaforma: {game.platform}</p>
          <p style={{ margin: "0 0 4px" }}>Stato: {running ? "In esecuzione" : "Non in esecuzione"}</p>
          <button
            onClick={() => coverInput.current?.click()}
            style={{ ...modalSecondaryButtonStyle, padding: "4px 10px", fontSize: 12, marginTop: 6 }}
          >
            Carica copertina
          </button>
          <input
            ref={coverInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) run(() => api.uploadGameCover(game.id, file));
            }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>
          Macchina di esecuzione
        </label>
        <select
          value={game.executionMachineId ?? "local"}
          onChange={(e) => run(() => api.updateGame(game.id, { executionMachineId: e.target.value }))}
          style={modalInputStyle}
        >
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} {m.kind === "remote" ? "(remota)" : ""}
            </option>
          ))}
        </select>
      </div>

      {error && <p style={{ color: "var(--status-problem)", fontSize: 12, marginBottom: 10 }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {!running ? (
          <button disabled={busy} onClick={() => run(() => api.launchGame(game.id))} style={modalPrimaryButtonStyle}>
            Avvia
          </button>
        ) : (
          <button disabled={busy} onClick={() => run(() => api.stopGame(game.id))} style={modalPrimaryButtonStyle}>
            Ferma
          </button>
        )}
        {game.hasSavePath && (
          <button disabled={busy} onClick={() => run(() => api.backupGameSave(game.id))} style={modalSecondaryButtonStyle}>
            Backup salvataggio
          </button>
        )}
        <button
          disabled={busy}
          onClick={() =>
            window.confirm(`Rimuovere "${game.title}" dal catalogo?`) &&
            run(() => api.deleteGame(game.id).then(onClose))
          }
          style={{ ...modalSecondaryButtonStyle, color: "var(--status-problem)" }}
        >
          Rimuovi dal catalogo
        </button>
      </div>

      {saves.length > 0 && (
        <div>
          <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "0 0 6px" }}>Backup salvataggi</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {saves.map((s) => (
              <p key={s.id} style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                {formatDate(s.createdAt)}
              </p>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Catalog() {
  const [games, setGames] = useState<GameItem[] | null>(null);
  const [machines, setMachines] = useState<MachineItem[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showScan, setShowScan] = useState(false);

  function refresh() {
    api.listGames().then((res) => setGames(res.games));
  }

  useEffect(() => {
    refresh();
    api.listMachines().then((res) => setMachines(res.machines));
  }, []);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setShowAdd(true)} style={toolbarButtonStyle}>+ Aggiungi gioco</button>
        <button onClick={() => setShowScan(true)} style={toolbarButtonStyle}>Scansiona cartelle</button>
      </div>

      {games && games.length === 0 && <p style={{ color: "var(--text-faint)" }}>Nessun gioco in libreria.</p>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 16,
        }}
      >
        {games?.map((game) => (
          <button
            key={game.id}
            onClick={() => setSelectedGameId(game.id)}
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
                aspectRatio: "3 / 4",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
              }}
            >
              {game.coverPath && (
                <img src={gameCoverUrl(game.id)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              )}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{game.title}</p>
              <p style={{ margin: 0, fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase" }}>
                {game.platform}
              </p>
            </div>
          </button>
        ))}
      </div>

      {showAdd && (
        <AddGameModal onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); refresh(); }} />
      )}
      {showScan && (
        <ScanModal onClose={() => setShowScan(false)} onImported={refresh} />
      )}
      {selectedGameId && (
        <GameDetailModal
          gameId={selectedGameId}
          machines={machines}
          onClose={() => setSelectedGameId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function AddMachineModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [macAddress, setMacAddress] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");

  async function submit() {
    if (!name.trim()) return;
    await api.createMachine({
      name: name.trim(),
      macAddress: macAddress.trim() || null,
      host: host.trim() || null,
      port: port.trim() ? Number(port.trim()) : null,
    });
    onCreated();
  }

  return (
    <Modal title="Aggiungi PC remoto" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" style={modalInputStyle} autoFocus />
        <input value={macAddress} onChange={(e) => setMacAddress(e.target.value)} placeholder="MAC address (Wake-on-LAN)" style={modalInputStyle} />
        <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="IP / hostname" style={modalInputStyle} />
        <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="Porta per il probe di stato" style={modalInputStyle} />
      </div>
      <div style={modalButtonRowStyle}>
        <button onClick={onClose} style={modalSecondaryButtonStyle}>Annulla</button>
        <button onClick={submit} disabled={!name.trim()} style={modalPrimaryButtonStyle}>Aggiungi</button>
      </div>
    </Modal>
  );
}

function MachineRow({ machine, onChanged }: { machine: MachineItem; onChanged: () => void }) {
  const [online, setOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (machine.kind === "local") {
      setOnline(true);
      return;
    }
    let cancelled = false;
    function poll() {
      api.getMachineStatus(machine.id).then((res) => {
        if (!cancelled) setOnline(res.online);
      });
    }
    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [machine.id, machine.kind]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
        background: "var(--bg-card)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: online ? "var(--status-normal)" : "var(--text-faint)",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{machine.name}</p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>
          {machine.kind === "local" ? "Locale (questo Hub)" : `${machine.host ?? "—"}${machine.port ? `:${machine.port}` : ""}`}
          {" · "}
          {online === null ? "verifica…" : online ? "online" : "offline"}
        </p>
      </div>
      {machine.kind === "remote" && (
        <>
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); await api.wakeMachine(machine.id); setBusy(false); }}
            style={{ ...toolbarButtonStyle, padding: "6px 12px" }}
          >
            Sveglia
          </button>
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); await api.deleteMachine(machine.id); setBusy(false); onChanged(); }}
            style={{ ...toolbarButtonStyle, padding: "6px 12px", color: "var(--status-problem)" }}
          >
            Rimuovi
          </button>
        </>
      )}
    </div>
  );
}

function Machines() {
  const [machines, setMachines] = useState<MachineItem[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  function refresh() {
    api.listMachines().then((res) => setMachines(res.machines));
  }

  useEffect(refresh, []);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setShowAdd(true)} style={toolbarButtonStyle}>+ Aggiungi PC remoto</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {machines?.map((m) => <MachineRow key={m.id} machine={m} onChanged={refresh} />)}
      </div>
      {showAdd && <AddMachineModal onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); refresh(); }} />}
    </div>
  );
}

export function Games() {
  const [view, setView] = useState<View>("catalog");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Giochi</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <TabButton active={view === "catalog"} onClick={() => setView("catalog")}>Catalogo</TabButton>
          <TabButton active={view === "machines"} onClick={() => setView("machines")}>Macchine</TabButton>
        </div>
      </div>

      {view === "catalog" ? <Catalog /> : <Machines />}
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
