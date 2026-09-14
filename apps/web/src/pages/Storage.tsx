import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  type BackupRun,
  type BackupStatus,
  type DiskInfo,
} from "../api/client";
import { useProfile } from "../context/ProfileContext";
import { formatBytes } from "../lib/format";
import {
  Modal,
  modalButtonRowStyle,
  modalDangerButtonStyle,
  modalSecondaryButtonStyle,
} from "../components/Modal";

function cardStyle(): React.CSSProperties {
  return {
    padding: 18,
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border)",
    background: "var(--bg-card)",
  };
}

function formatDateTime(sqliteTimestamp: string | null): string {
  if (!sqliteTimestamp) return "—";
  const date = new Date(`${sqliteTimestamp.replace(" ", "T")}Z`);
  return date.toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const RUN_STATUS_LABEL: Record<BackupRun["status"], string> = {
  running: "In corso",
  completed: "Completato",
  completed_with_errors: "Completato con errori",
  interrupted: "Interrotto",
  failed: "Fallito",
};

function statusColor(status: BackupRun["status"]): string {
  if (status === "completed") return "var(--status-normal, #22c55e)";
  if (status === "running") return "var(--accent)";
  if (status === "completed_with_errors") return "var(--status-attention, #eab308)";
  return "var(--status-problem, #ef4444)";
}

function DiskCard({ disk }: { disk: DiskInfo }) {
  const usedPercent = disk.freePercent !== null ? 100 - disk.freePercent : null;
  return (
    <div style={cardStyle()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{disk.label}</p>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: disk.connected ? (disk.critical ? "var(--status-problem, #ef4444)" : "var(--text-muted)") : "var(--status-problem, #ef4444)",
          }}
        >
          {disk.connected ? (disk.critical ? "Spazio critico" : "Connesso") : "Non disponibile"}
        </span>
      </div>
      <p style={{ margin: "2px 0 12px", fontSize: 12, color: "var(--text-faint)" }}>{disk.path}</p>

      {disk.connected && (
        <>
          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: "var(--bg-hover)",
              overflow: "hidden",
              marginBottom: 8,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${usedPercent ?? 0}%`,
                background: disk.critical ? "var(--status-problem, #ef4444)" : "var(--accent)",
              }}
            />
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
            {formatBytes(disk.freeBytes)} liberi su {formatBytes(disk.totalBytes)}
          </p>
        </>
      )}

      <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--text-faint)" }}>
        SMART:{" "}
        {!disk.smart?.available
          ? "non disponibile"
          : disk.smart.health === "passed"
            ? "OK"
            : disk.smart.health === "failed"
              ? "problema rilevato"
              : "sconosciuto"}
      </p>
    </div>
  );
}

export function Storage() {
  const { user } = useProfile();
  const isAdmin = user?.role === "admin";

  const [disks, setDisks] = useState<DiskInfo[] | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [disksRes, statusRes, runsRes] = await Promise.all([
        api.listDisks(),
        api.getBackupStatus(),
        api.listBackupRuns(10),
      ]);
      setDisks(disksRes.disks);
      setBackupStatus(statusRes);
      setRuns(runsRes.runs);
      setError(null);
    } catch {
      setError("Impossibile contattare l'Hub API");
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  async function handleBackupNow() {
    setActionBusy(true);
    setActionError(null);
    try {
      await api.runBackupNow();
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? String(err.body ?? err.message) : "Errore avvio backup");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRestore() {
    setActionBusy(true);
    setActionError(null);
    try {
      const res = await api.restoreBackup();
      setRestoreResult(
        `${res.summary.filesRestored} file ripristinati, ${res.summary.filesFailed} falliti. ${res.note}`,
      );
      setRestoreModalOpen(false);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? String(err.body ?? err.message) : "Errore durante il ripristino");
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 20px" }}>Storage e Backup</h1>

      {error && <p style={{ color: "var(--status-problem)", marginBottom: 16 }}>{error}</p>}
      {actionError && <p style={{ color: "var(--status-problem)", marginBottom: 16 }}>{actionError}</p>}
      {restoreResult && <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>{restoreResult}</p>}

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Dischi</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 14,
          marginBottom: 28,
        }}
      >
        {disks?.map((d) => <DiskCard key={d.id} disk={d} />)}
        {disks === null && <p style={{ color: "var(--text-faint)" }}>Caricamento…</p>}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Backup</h2>
        {isAdmin && (
          <button
            onClick={handleBackupNow}
            disabled={actionBusy || backupStatus?.running || !backupStatus?.configured}
            style={{
              padding: "9px 16px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: "var(--accent)",
              color: "white",
              fontWeight: 600,
              fontSize: 13,
              cursor: actionBusy || backupStatus?.running ? "default" : "pointer",
              opacity: actionBusy || backupStatus?.running || !backupStatus?.configured ? 0.6 : 1,
            }}
          >
            {backupStatus?.running ? "Backup in corso…" : "Backup Now"}
          </button>
        )}
      </div>

      {!backupStatus?.configured ? (
        <div style={{ ...cardStyle(), marginBottom: 20 }}>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14 }}>
            Nessun disco di backup configurato (HUB_BACKUP_ROOT). L'Hub continua a funzionare normalmente, ma i
            dati personali non sono protetti da un backup automatico.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 14,
            marginBottom: 20,
          }}
        >
          <div style={cardStyle()}>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--text-faint)" }}>Backup recente e valido</p>
            <p
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: backupStatus.hasRecentValidBackup ? "var(--status-normal, #22c55e)" : "var(--status-attention, #eab308)",
              }}
            >
              {backupStatus.hasRecentValidBackup ? "Sì" : "No"}
            </p>
          </div>
          <div style={cardStyle()}>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--text-faint)" }}>Ultimo run</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
              {backupStatus.latestRun ? formatDateTime(backupStatus.latestRun.startedAt) : "Mai eseguito"}
            </p>
            {backupStatus.latestRun && (
              <p style={{ margin: "4px 0 0", fontSize: 12, color: statusColor(backupStatus.latestRun.status) }}>
                {RUN_STATUS_LABEL[backupStatus.latestRun.status]}
              </p>
            )}
          </div>
        </div>
      )}

      {runs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
          {runs.map((run) => (
            <div
              key={run.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
                fontSize: 13,
              }}
            >
              <span style={{ color: "var(--text-muted)" }}>
                {formatDateTime(run.startedAt)} · {run.trigger === "manual" ? "manuale" : "automatico"}
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                {run.filesCopied} copiati · {run.filesSkipped} invariati · {run.filesFailed} falliti ·{" "}
                {formatBytes(run.bytesCopied)}
              </span>
              <span style={{ color: statusColor(run.status), fontWeight: 600 }}>{RUN_STATUS_LABEL[run.status]}</span>
            </div>
          ))}
        </div>
      )}

      {isAdmin && backupStatus?.configured && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Ripristino</h2>
          <div style={cardStyle()}>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>
              Ripristina file, foto, salvataggi e database dal disco di backup verso il disco dati corrente.
              Operazione da usare solo in fase di recovery (§35): sovrascrive i file di destinazione con lo stesso
              percorso già presenti.
            </p>
            <button
              onClick={() => setRestoreModalOpen(true)}
              disabled={actionBusy || backupStatus.running}
              style={{
                padding: "9px 16px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--status-problem, #ef4444)",
                background: "transparent",
                color: "var(--status-problem, #ef4444)",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Ripristina da backup…
            </button>
          </div>
        </>
      )}

      {restoreModalOpen && (
        <Modal title="Confermi il ripristino?" onClose={() => setRestoreModalOpen(false)}>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 6px" }}>
            I file già presenti sul disco dati con lo stesso percorso verranno sovrascritti con la versione nel
            backup. Il database verrà ripristinato ma richiederà un riavvio dell'Hub API per diventare effettivo.
          </p>
          <div style={modalButtonRowStyle}>
            <button style={modalSecondaryButtonStyle} onClick={() => setRestoreModalOpen(false)}>
              Annulla
            </button>
            <button style={modalDangerButtonStyle} onClick={handleRestore} disabled={actionBusy}>
              Ripristina
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
