import { useCallback, useEffect, useState } from "react";
import { useSystemStatus } from "../hooks/useSystemStatus";
import { StatusBadge } from "../components/StatusBadge";
import { QrCode } from "../components/QrCode";
import { useProfile } from "../context/ProfileContext";
import {
  api,
  ApiError,
  type AllSessionEntry,
  type DdnsStatus,
  type LocalNetworkInfo,
  type Profile,
  type SessionEntry,
  type SystemEvent,
  type UpdateStatus,
  type VpnPeer,
  type VpnPeerWithUser,
  type VpnProfile,
  type VpnStatus,
  type WifiNetwork,
  type WifiStatus,
} from "../api/client";
import { Modal, modalButtonRowStyle, modalDangerButtonStyle, modalSecondaryButtonStyle } from "../components/Modal";
import { formatBytes, formatSqliteDateTime } from "../lib/format";

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        background: "var(--bg-card)",
      }}
    >
      <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--text-faint)" }}>{label}</p>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{value}</p>
      {sub && <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{sub}</p>}
    </div>
  );
}

function WifiPanel() {
  const [status, setStatus] = useState<WifiStatus | null>(null);
  const [networks, setNetworks] = useState<WifiNetwork[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [selectedSsid, setSelectedSsid] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = useCallback(() => {
    api.getWifiStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleScan() {
    setScanning(true);
    setMessage(null);
    try {
      const res = await api.scanWifi();
      setNetworks(res.networks);
    } catch {
      setMessage("Scansione non riuscita.");
    } finally {
      setScanning(false);
    }
  }

  async function handleConnect(ssid: string) {
    setConnecting(ssid);
    setMessage(null);
    try {
      await api.connectWifi(ssid, password || null);
      setMessage(`Connesso a "${ssid}".`);
      setSelectedSsid(null);
      setPassword("");
      loadStatus();
    } catch (err) {
      setMessage(err instanceof ApiError ? "Connessione non riuscita." : "Errore imprevisto.");
    } finally {
      setConnecting(null);
    }
  }

  if (status && !status.available) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-faint)" }}>
        Gestione Wi-Fi non disponibile su questo sistema (richiede NetworkManager). Per il WPS: premi il pulsante
        sul router, poi ricarica questa pagina per rilevare la connessione.
      </p>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 10px" }}>
        {status?.connectedSsid ? `Connesso a "${status.connectedSsid}".` : "Non connesso a nessuna rete Wi-Fi."}{" "}
        Per il WPS: premi il pulsante sul router, poi{" "}
        <button
          onClick={loadStatus}
          style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, font: "inherit" }}
        >
          aggiorna lo stato
        </button>
        .
      </p>

      <button
        onClick={handleScan}
        disabled={scanning}
        style={{
          padding: "8px 14px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          background: "transparent",
          color: "var(--text)",
          fontSize: 13,
          cursor: "pointer",
          marginBottom: 10,
        }}
      >
        {scanning ? "Scansione…" : "Cerca reti"}
      </button>

      {message && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{message}</p>}

      {networks && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {networks.length === 0 && <p style={{ fontSize: 13, color: "var(--text-faint)" }}>Nessuna rete trovata.</p>}
          {networks.map((n) => (
            <div key={n.ssid}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-card)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
                onClick={() => setSelectedSsid(selectedSsid === n.ssid ? null : n.ssid)}
              >
                <span>
                  {n.ssid} {n.secured ? "🔒" : ""}
                </span>
                <span style={{ color: "var(--text-faint)" }}>{n.signal}%</span>
              </div>
              {selectedSsid === n.ssid && (
                <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 4 }}>
                  {n.secured && (
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                        background: "var(--bg-card)",
                        color: "var(--text)",
                        fontSize: 13,
                      }}
                    />
                  )}
                  <button
                    onClick={() => handleConnect(n.ssid)}
                    disabled={connecting === n.ssid}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "var(--radius-sm)",
                      border: "none",
                      background: "var(--accent)",
                      color: "white",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {connecting === n.ssid ? "Connessione…" : "Connetti"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DdnsPanel() {
  const [status, setStatus] = useState<DdnsStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.getDdnsStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpdate() {
    setBusy(true);
    try {
      setStatus(await api.updateDdnsNow());
    } finally {
      setBusy(false);
    }
  }

  if (!status?.configured) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-faint)" }}>
        DDNS non configurato (HUB_DDNS_DOMAIN/HUB_DDNS_TOKEN) — necessario solo per l'accesso da fuori casa con un
        indirizzo fisso.
      </p>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 10px" }}>
        Dominio: <strong>{status.domain}.duckdns.org</strong> — ultimo aggiornamento:{" "}
        {formatSqliteDateTime(status.lastUpdatedAt)} (
        <span style={{ color: status.lastStatus === "ok" ? "var(--status-normal, #22c55e)" : "var(--status-problem)" }}>
          {status.lastStatus === "ok" ? "riuscito" : status.lastStatus === "error" ? "fallito" : "mai eseguito"}
        </span>
        )
      </p>
      <button onClick={handleUpdate} disabled={busy} style={{ ...secondaryButtonStyleLocal }}>
        {busy ? "Aggiornamento…" : "Aggiorna ora"}
      </button>
    </div>
  );
}

const vpnPeerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 14px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  fontSize: 13,
  marginBottom: 6,
};

const PROFILE_LABEL: Record<VpnProfile, string> = {
  home: "Solo Hub (uso quotidiano)",
  full: "Tunnel completo (esci con l'IP di casa)",
};

/**
 * VPN personale WireGuard (§2, ultima funzione della Fase 9). La chiave
 * privata non passa mai da qui: il client WireGuard dell'utente la genera
 * da solo creando un nuovo tunnel vuoto, qui si incolla solo la pubblica
 * mostrata — l'Hub restituisce i parametri restanti (endpoint, indirizzo
 * assegnato, AllowedIPs) da completare nel client.
 */
function VpnPanel() {
  const { user } = useProfile();
  const [status, setStatus] = useState<VpnStatus | null>(null);
  const [peers, setPeers] = useState<VpnPeer[] | null>(null);
  const [allPeers, setAllPeers] = useState<VpnPeerWithUser[] | null>(null);
  const [profile, setProfile] = useState<VpnProfile>("home");
  const [label, setLabel] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newPeer, setNewPeer] = useState<VpnPeer | null>(null);

  const load = useCallback(() => {
    api.getVpnStatus().then(setStatus).catch(() => setStatus(null));
    api
      .listVpnPeers()
      .then((r) => setPeers(r.peers))
      .catch(() => {});
    if (user?.role === "admin") {
      api
        .listAllVpnPeers()
        .then((r) => setAllPeers(r.peers))
        .catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.createVpnPeer({ profile, label, publicKey });
      setNewPeer(res.peer);
      setLabel("");
      setPublicKey("");
      load();
    } catch (err) {
      setMessage(err instanceof ApiError ? String(err.body ?? err.message) : "Creazione non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    await api.deleteVpnPeer(id);
    if (newPeer?.id === id) setNewPeer(null);
    load();
  }

  if (!status?.configured) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-faint)" }}>
        VPN non configurato (HUB_VPN_ENABLED) — serve solo per uscire su Internet con l'IP di casa da remoto,
        l'accesso remoto alla Web App non ne ha bisogno.
      </p>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 10px" }}>
        Interfaccia: {status.interfaceUp ? "attiva" : "non attiva"}
        {!status.commandsAvailable && " (strumenti WireGuard non trovati su questo sistema)"}
        {status.serverPublicKey && (
          <>
            <br />
            Chiave pubblica del server:{" "}
            <code style={{ fontSize: 11, wordBreak: "break-all" }}>{status.serverPublicKey}</code>
          </>
        )}
      </p>

      {peers?.map((p) => (
        <div key={p.id} style={vpnPeerRowStyle}>
          <span>
            {p.label} — {PROFILE_LABEL[p.profile]} — {p.address}
            {p.connected && <span style={{ color: "var(--status-normal, #22c55e)" }}> ● connesso</span>}
          </span>
          <button
            onClick={() => handleDelete(p.id)}
            style={{ background: "none", border: "none", color: "var(--status-problem)", cursor: "pointer", fontSize: 12 }}
          >
            Revoca
          </button>
        </div>
      ))}
      {peers?.length === 0 && <p style={{ fontSize: 13, color: "var(--text-faint)" }}>Nessun dispositivo collegato.</p>}

      <form
        onSubmit={handleCreate}
        style={{
          marginTop: 14,
          padding: 14,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxWidth: 420,
        }}
      >
        <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600 }}>Aggiungi un dispositivo</p>
        <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--text-faint)" }}>
          Crea un nuovo tunnel vuoto nel tuo client WireGuard (genera da solo una coppia di chiavi, mai vista
          dall'Hub) e incolla qui la chiave pubblica che ti mostra.
        </p>
        <select value={profile} onChange={(e) => setProfile(e.target.value as VpnProfile)} style={inputStyleLocal}>
          <option value="home">{PROFILE_LABEL.home}</option>
          <option value="full">{PROFILE_LABEL.full}</option>
        </select>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Nome dispositivo (es. Telefono)"
          style={inputStyleLocal}
        />
        <input
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
          placeholder="Chiave pubblica WireGuard"
          style={{ ...inputStyleLocal, fontFamily: "monospace" }}
        />
        {message && <p style={{ fontSize: 12, color: "var(--status-problem)", margin: 0 }}>{message}</p>}
        <button
          type="submit"
          disabled={busy || !label || !publicKey}
          style={{ ...secondaryButtonStyleLocal, alignSelf: "flex-start" }}
        >
          {busy ? "Creazione…" : "Aggiungi"}
        </button>
      </form>

      {newPeer && (
        <Modal title="Configura il tuo client" onClose={() => setNewPeer(null)}>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 8px" }}>
            Incolla questi valori nel tuo client, insieme alla chiave privata che hai già generato lì (non viene
            mai condivisa con l'Hub):
          </p>
          <pre
            style={{
              fontSize: 12,
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: 12,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {`[Interface]\nAddress = ${newPeer.address}/32\n\n[Peer]\nPublicKey = ${status.serverPublicKey}\nEndpoint = ${status.endpointHost ?? "<configura HUB_VPN_ENDPOINT_HOST>"}:${status.listenPort}\nAllowedIPs = ${newPeer.allowedIps}\nPersistentKeepalive = 25`}
          </pre>
          <div style={modalButtonRowStyle}>
            <button style={modalSecondaryButtonStyle} onClick={() => setNewPeer(null)}>
              Chiudi
            </button>
          </div>
        </Modal>
      )}

      {user?.role === "admin" && allPeers && allPeers.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)" }}>Tutti i dispositivi (tutti gli utenti)</p>
          {allPeers.map((p) => (
            <div key={p.id} style={vpnPeerRowStyle}>
              <span>
                <strong>{p.displayName}</strong> — {p.label} — {PROFILE_LABEL[p.profile]} — {p.address}
                {p.connected && <span style={{ color: "var(--status-normal, #22c55e)" }}> ● connesso</span>}
              </span>
              <button
                onClick={() => handleDelete(p.id)}
                style={{ background: "none", border: "none", color: "var(--status-problem)", cursor: "pointer", fontSize: 12 }}
              >
                Revoca
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const secondaryButtonStyleLocal: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  fontSize: 13,
  cursor: "pointer",
};

function NetworkSection() {
  const { user } = useProfile();
  const [info, setInfo] = useState<LocalNetworkInfo | null>(null);

  useEffect(() => {
    api.getNetworkInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Rete</h2>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: user?.role === "admin" ? 20 : 0 }}>
        {info?.primaryUrl && <QrCode value={info.primaryUrl} size={120} />}
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {info?.mdnsUrl && (
            <p style={{ margin: "0 0 4px" }}>
              Indirizzo locale: <strong>{info.mdnsUrl}</strong>
            </p>
          )}
          {!info?.mdnsUrl && (
            <p style={{ margin: "0 0 4px", color: "var(--text-faint)" }}>Discovery .local non disponibile.</p>
          )}
          {info?.ips.map((ip) => (
            <p key={ip} style={{ margin: "0 0 2px" }}>
              IP: {ip}
            </p>
          ))}
        </div>
      </div>

      {user?.role === "admin" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              padding: 16,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
            }}
          >
            <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>Wi-Fi</p>
            <WifiPanel />
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
            }}
          >
            <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>DDNS (accesso remoto)</p>
            <DdnsPanel />
          </div>
        </div>
      )}

      {/* VPN (§2): a differenza di Wi-Fi/DDNS non è admin-only — ogni
          utente gestisce i propri dispositivi, come per le sessioni. */}
      <div
        style={{
          marginTop: 14,
          padding: 16,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
        }}
      >
        <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>VPN personale</p>
        <VpnPanel />
      </div>
    </div>
  );
}

function NotificationsSection() {
  const [events, setEvents] = useState<SystemEvent[] | null>(null);

  useEffect(() => {
    api.listSystemEvents(20).then((r) => setEvents(r.events)).catch(() => {});
  }, []);

  const critical = events?.filter((e) => e.level === "critical") ?? [];
  if (critical.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Notifiche</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {critical.map((e) => (
          <div
            key={e.id}
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--status-problem)",
              background: "rgba(239, 68, 68, 0.08)",
              fontSize: 13,
            }}
          >
            <span style={{ color: "var(--status-problem)" }}>{e.message}</span>
            <span style={{ color: "var(--text-faint)", marginLeft: 8, fontSize: 12 }}>
              {formatSqliteDateTime(e.createdAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Aggiornamenti Hub autorizzati dalla Web App (§33), admin-only. */
function UpdatesSection() {
  const { user } = useProfile();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const load = useCallback(() => {
    setChecking(true);
    api
      .getUpdateStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user, load]);

  if (user?.role !== "admin") return null;

  async function handleApply() {
    setApplying(true);
    setError(null);
    try {
      const res = await api.applyUpdate();
      setApplied(res.updatedTo.slice(0, 7));
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.body ?? err.message) : "Aggiornamento non riuscito.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Aggiornamenti</h2>
      <div
        style={{
          padding: 16,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
        }}
      >
        {!status?.available && !checking && (
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-faint)" }}>
            Aggiornamenti non disponibili (richiede git, non trovato su questo sistema).
          </p>
        )}
        {status?.available && status.behindCount === 0 && (
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>
            Già aggiornato all'ultima versione
            {status.currentCommit && <> (<code style={{ fontSize: 12 }}>{status.currentCommit.slice(0, 7)}</code>)</>}.
          </p>
        )}
        {status?.available && status.behindCount > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)" }}>
              {status.behindCount} {status.behindCount === 1 ? "commit" : "commit"} disponibili:
            </p>
            <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 12, color: "var(--text-faint)" }}>
              {status.commits.slice(0, 8).map((c) => (
                <li key={c.hash}>{c.message}</li>
              ))}
            </ul>
          </div>
        )}
        {applied && (
          <p style={{ fontSize: 13, color: "var(--status-normal, #22c55e)" }}>
            Aggiornato a <code style={{ fontSize: 12 }}>{applied}</code> — l'Hub si sta riavviando, questa pagina si
            ricollegherà da sola in qualche istante.
          </p>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} disabled={checking} style={secondaryButtonStyleLocal}>
            {checking ? "Controllo…" : "Controlla aggiornamenti"}
          </button>
          {status?.available && status.behindCount > 0 && (
            <button
              onClick={() => setModalOpen(true)}
              style={{
                padding: "8px 14px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                background: "var(--accent)",
                color: "white",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Aggiorna e riavvia…
            </button>
          )}
        </div>
      </div>

      {modalOpen && (
        <Modal title="Confermi l'aggiornamento?" onClose={() => setModalOpen(false)}>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 6px" }}>
            L'Hub scaricherà il codice più recente, lo ricompilerà e si riavvierà da solo — resterà irraggiungibile
            per qualche minuto. Le sessioni attive (comprese quelle remote) non vengono chiuse.
          </p>
          {error && <p style={{ fontSize: 13, color: "var(--status-problem)" }}>{error}</p>}
          <div style={modalButtonRowStyle}>
            <button style={modalSecondaryButtonStyle} onClick={() => setModalOpen(false)}>
              Annulla
            </button>
            <button style={modalDangerButtonStyle} onClick={handleApply} disabled={applying}>
              {applying ? "Aggiornamento…" : "Aggiorna"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PowerSection() {
  const { user } = useProfile();
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user?.role !== "admin") return null;

  async function handleShutdown() {
    setBusy(true);
    setError(null);
    try {
      await api.shutdownHost();
      setModalOpen(false);
    } catch {
      setError("Spegnimento non riuscito.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Alimentazione</h2>
      <div
        style={{
          padding: 16,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
        }}
      >
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>
          Spegnimento sicuro del sistema (§34). Per riaccenderlo servirà il pulsante fisico sul Wyse.
        </p>
        <button
          onClick={() => setModalOpen(true)}
          style={{
            padding: "9px 16px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--status-problem)",
            background: "transparent",
            color: "var(--status-problem)",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Spegni l'Hub…
        </button>
      </div>

      {modalOpen && (
        <Modal title="Confermi lo spegnimento?" onClose={() => setModalOpen(false)}>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 6px" }}>
            L'Hub e tutti i servizi (Film, Serie, Foto, Download…) diventeranno irraggiungibili finché non lo
            riaccendi fisicamente.
          </p>
          {error && <p style={{ fontSize: 13, color: "var(--status-problem)" }}>{error}</p>}
          <div style={modalButtonRowStyle}>
            <button style={modalSecondaryButtonStyle} onClick={() => setModalOpen(false)}>
              Annulla
            </button>
            <button style={modalDangerButtonStyle} onClick={handleShutdown} disabled={busy}>
              Spegni
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const inputStyleLocal: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontSize: 13,
};

function AccountSection() {
  const { user } = useProfile();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [resetUserId, setResetUserId] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role === "admin") api.listProfiles().then((r) => setProfiles(r.profiles)).catch(() => {});
  }, [user]);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.changePassword(currentPassword || null, newPassword);
      setMessage("Password aggiornata.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setMessage(err instanceof ApiError && err.status === 401 ? "Password attuale errata." : "Aggiornamento non riuscito.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetOther(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUserId) return;
    setResetMessage(null);
    try {
      await api.resetUserPassword(resetUserId, resetPassword);
      setResetMessage("Password reimpostata. Le sessioni di quell'utente sono state disconnesse.");
      setResetPassword("");
    } catch {
      setResetMessage("Reimpostazione non riuscita.");
    }
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Account</h2>

      <form
        onSubmit={handleChangePassword}
        style={{
          padding: 16,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
          marginBottom: user?.role === "admin" ? 14 : 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxWidth: 360,
        }}
      >
        <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>Cambia la tua password</p>
        <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--text-faint)" }}>
          Serve solo per l'accesso remoto (§24) — sulla rete di casa entri senza password.
        </p>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Password attuale (se già impostata)"
          style={inputStyleLocal}
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Nuova password (almeno 8 caratteri)"
          style={inputStyleLocal}
        />
        {message && <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{message}</p>}
        <button
          type="submit"
          disabled={busy || newPassword.length < 8}
          style={{ ...secondaryButtonStyleLocal, alignSelf: "flex-start" }}
        >
          Aggiorna password
        </button>
      </form>

      {user?.role === "admin" && (
        <form
          onSubmit={handleResetOther}
          style={{
            padding: 16,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxWidth: 360,
          }}
        >
          <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>Reimposta la password di un utente</p>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--text-faint)" }}>
            Utile se qualcuno ha dimenticato la password per l'accesso remoto (§25).
          </p>
          <select value={resetUserId} onChange={(e) => setResetUserId(e.target.value)} style={inputStyleLocal}>
            <option value="">Seleziona utente…</option>
            {profiles?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
          <input
            type="password"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            placeholder="Nuova password"
            style={inputStyleLocal}
          />
          {resetMessage && <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{resetMessage}</p>}
          <button
            type="submit"
            disabled={!resetUserId || resetPassword.length < 8}
            style={{ ...secondaryButtonStyleLocal, alignSelf: "flex-start" }}
          >
            Reimposta
          </button>
        </form>
      )}
    </div>
  );
}

function SessionsSection() {
  const { user } = useProfile();
  const [mySessions, setMySessions] = useState<SessionEntry[] | null>(null);
  const [allSessions, setAllSessions] = useState<AllSessionEntry[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listMySessions().then((r) => setMySessions(r.sessions)).catch(() => {});
    if (user?.role === "admin") api.listAllSessions().then((r) => setAllSessions(r.sessions)).catch(() => {});
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRevoke(id: string) {
    await api.revokeSession(id);
    load();
  }

  async function handleRevokeAllRemote() {
    const res = await api.revokeAllRemoteSessions();
    setMessage(`${res.revoked} sessioni remote disconnesse.`);
    load();
  }

  function SessionRow({ s, showUser }: { s: SessionEntry | AllSessionEntry; showUser?: boolean }) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
          fontSize: 13,
          marginBottom: 6,
        }}
      >
        <span>
          {showUser && "username" in s && <strong>{s.displayName}</strong>}
          {showUser && " — "}
          {s.deviceName ?? "Dispositivo sconosciuto"}
          {s.current && <span style={{ color: "var(--accent)" }}> (questa sessione)</span>}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: s.origin === "remote" ? "var(--accent)" : "var(--text-faint)" }}>
            {s.origin === "remote" ? "Remoto" : "Locale"}
          </span>
          <button
            onClick={() => handleRevoke(s.id)}
            style={{ background: "none", border: "none", color: "var(--status-problem)", cursor: "pointer", fontSize: 12 }}
          >
            Disconnetti
          </button>
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Sessioni</h2>

      {mySessions?.map((s) => <SessionRow key={s.id} s={s} />)}

      {user?.role === "admin" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0 8px" }}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>Tutte le sessioni (tutti gli utenti)</p>
            <button
              onClick={handleRevokeAllRemote}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--status-problem)",
                background: "transparent",
                color: "var(--status-problem)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Disconnetti tutte le sessioni remote
            </button>
          </div>
          {message && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{message}</p>}
          {allSessions?.map((s) => <SessionRow key={s.id} s={s} showUser />)}
        </>
      )}
    </div>
  );
}

export function System() {
  const { status, error } = useSystemStatus(5000);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Sistema</h1>
        <StatusBadge level={status?.level ?? null} />
      </div>

      {error && (
        <p style={{ color: "var(--status-problem)", marginBottom: 16 }}>{error}</p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: 28,
        }}
      >
        <MetricCard
          label="CPU (load 1m)"
          value={status ? status.cpu.loadAvg1m.toFixed(2) : "—"}
          sub={status ? `${status.cpu.cores} core` : undefined}
        />
        <MetricCard
          label="Memoria"
          value={status ? `${status.memory.usedPercent.toFixed(0)}%` : "—"}
          sub={status ? `${formatBytes(status.memory.freeBytes)} libera` : undefined}
        />
        <MetricCard
          label="Storage dati"
          value={status?.disk.freePercent !== undefined && status?.disk.freePercent !== null
            ? `${status.disk.freePercent.toFixed(0)}% libero`
            : "—"}
          sub={status ? formatBytes(status.disk.freeBytes) : undefined}
        />
        <MetricCard
          label="Temperatura"
          value={status?.temperatureCelsius !== null && status?.temperatureCelsius !== undefined
            ? `${status.temperatureCelsius.toFixed(0)}°C`
            : "N/D"}
        />
        <MetricCard
          label="Uptime"
          value={status ? `${Math.floor(status.uptimeSeconds / 3600)} h` : "—"}
        />
        <MetricCard
          label="Internet"
          value={status ? (status.internet.reachable ? "Connesso" : "Non raggiungibile") : "—"}
        />
      </div>

      <NotificationsSection />

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Servizi</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {status?.services.map((service) => (
          <div
            key={service.name}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
            }}
          >
            <span style={{ fontSize: 14, textTransform: "capitalize" }}>{service.name}</span>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {!service.configured
                ? "Non configurato"
                : service.reachable
                  ? "Attivo"
                  : "Non disponibile"}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28 }}>
        <NetworkSection />
        <AccountSection />
        <SessionsSection />
        <UpdatesSection />
        <PowerSection />
      </div>
    </div>
  );
}
